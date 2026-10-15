// Inyección de fallos controlados: verifica la espera sin consumir cuota de IA.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const http = require('node:http');
const root = path.resolve(__dirname, '../..');
const { chromium } = require(path.join(root, 'apps/web/node_modules/playwright'));
const output = path.join(__dirname, 'evidencia-espera');
const reply = JSON.parse(fs.readFileSync(path.join(root, 'contracts/examples/assistant-response.json'), 'utf8'));
const url = process.env.SIOP_REVIEW_URL || 'http://localhost:5173/';
async function run() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const requests = { messages: [], 'extract-image': [], transcribe: [] };
  const checks = [];
  const errors = [];
  const transcript = 'Vendo 200 cuadernos al mes.';
  page.on('pageerror', (error) => errors.push(error.message));
  // Recibir realmente el multipart: Chrome omite el contenido de archivos en
  // la vista de solicitudes de DevTools, por lo que se valida en un servidor local.
  const fixtureServer = http.createServer((request, response) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Accept', 'Content-Type': 'application/json' };
    if (request.method === 'OPTIONS') { response.writeHead(204, headers); response.end(); return; }
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const endpoint = request.url.split('/').at(-1);
      const raw = Buffer.concat(chunks);
      requests[endpoint].push({ raw, json: request.headers['content-type']?.includes('application/json') ? JSON.parse(raw.toString()) : null });
      const attempt = requests[endpoint].length;
      const body = attempt < 3 ? { error: { code: 'ASSISTANT_UNAVAILABLE', message: 'Error temporal inyectado por la prueba', retryable: true, retry_after_seconds: 6 } }
        : endpoint === 'transcribe' ? { text: transcript, language: 'es' } : reply;
      response.writeHead(attempt < 3 ? 503 : 200, headers);
      response.end(JSON.stringify(body));
    });
  });
  await new Promise((resolve) => fixtureServer.listen(0, '127.0.0.1', resolve));
  await page.route('**/api/v1/assistant/**', (route) => route.continue({
    url: `http://127.0.0.1:${fixtureServer.address().port}${new URL(route.request().url()).pathname}`,
  }));
  try {
    await page.goto(url);
    await page.getByRole('heading', { name: 'Compra recomendada', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Asistente IA (Texto, Foto y Voz)' }).click();
    const panel = page.getByRole('complementary', { name: 'Asistente inteligente' });
    const notice = panel.getByText(/Esto puede demorar más de lo esperado/);
    async function waiting(kind) {
      await notice.waitFor({ timeout: 11000 });
      await notice.scrollIntoViewIfNeeded();
      assert.equal(await panel.getByRole('alert').count(), 0);
      assert(await page.getByRole('button', { name: 'Calcular mejor compra', exact: true }).isEnabled());
      await page.screenshot({ path: path.join(output, `${kind}-esperando.png`), fullPage: true });
      checks.push(`${kind}: aviso de demora, sin alerta de saturación y calculadora disponible`);
    }
    async function discard() {
      await panel.getByRole('region', { name: 'Borrador revisable del asistente' }).waitFor();
      assert.equal(await page.getByLabel('¿Cuántas unidades vendes o necesitas?').inputValue(), '10000');
      await panel.getByRole('button', { name: 'Descartar propuesta' }).click();
    }
    const message = 'Vendo 200 cuadernos al mes. Conserva este mensaje.';
    await panel.getByLabel('Mensaje para el asistente').fill(message);
    await panel.getByRole('button', { name: 'Enviar', exact: true }).click();
    await waiting('texto');
    await discard();
    assert.equal(requests.messages.length, 3);
    assert.equal(await panel.getByRole('log').getByText(message, { exact: true }).count(), 1);
    assert.deepEqual(requests.messages.map((request) => request.json), Array(3).fill(requests.messages[0].json));
    checks.push('texto: tres intentos automáticos, mismo contexto y una sola burbuja');

    await panel.getByRole('tab', { name: 'Fotografía', exact: true }).click();
    const imagePath = path.join(__dirname, 'fixtures/cotizacion-legible.png');
    await panel.getByLabel('Selecciona una fotografía o cotización').setInputFiles(imagePath);
    await panel.getByLabel('Contexto adicional de la foto').fill('Nota conservada');
    await panel.getByRole('button', { name: 'Extraer datos de la fotografía' }).click();
    await waiting('fotografia');
    await discard();
    assert.equal(requests['extract-image'].length, 3);
    for (const request of requests['extract-image']) {
      assert(request.raw.includes(fs.readFileSync(imagePath)));
      assert(request.raw.includes(Buffer.from('Nota conservada')));
    }
    checks.push('foto: se conserva el archivo y su nota en los tres intentos');

    await panel.getByRole('tab', { name: 'Voz', exact: true }).click();
    const audioPath = path.join(__dirname, 'fixtures/ejercicio-hablado.wav');
    await panel.getByLabel('Archivo de audio para transcribir').setInputFiles(audioPath);
    await waiting('audio');
    const editor = panel.getByLabel('Revisa o corrige la transcripción antes de enviarla al asistente:');
    await editor.waitFor();
    assert.equal(await editor.inputValue(), transcript);
    assert.equal(requests.transcribe.length, 3);
    for (const request of requests.transcribe) assert(request.raw.includes(fs.readFileSync(audioPath)));
    const reviewed = `${transcript} Corrijo el nombre: Cuadernos revisados.`;
    await editor.fill(reviewed);
    await panel.getByRole('button', { name: 'Enviar texto revisado al asistente' }).click();
    await discard();
    assert.equal(requests.messages.at(-1).json.message, reviewed);
    checks.push('audio: mismo archivo en los tres intentos; transcripción revisable y envío exacto por Texto');

    await panel.getByRole('tab', { name: 'Texto', exact: true }).click();
    requests.messages = [];
    await panel.getByLabel('Mensaje para el asistente').fill('Conservar al cancelar');
    const cancelledResponse = page.waitForResponse((response) => response.url().endsWith('/assistant/messages') && response.status() === 503);
    await panel.getByRole('button', { name: 'Enviar', exact: true }).click();
    await cancelledResponse;
    await panel.getByRole('button', { name: 'Cancelar espera', exact: true }).click();
    await page.waitForTimeout(7000);
    assert.equal(requests.messages.length, 1);
    assert.equal(await panel.getByLabel('Mensaje para el asistente').inputValue(), 'Conservar al cancelar');
    checks.push('cancelación: conserva el texto y detiene los reintentos');
    assert.deepEqual(errors, []);
    const report = { url, checked_at: new Date().toISOString(), test_type: 'fallos controlados y respuestas de fixture, no proveedor real', checks, page_errors: errors };
    fs.writeFileSync(path.join(output, 'espera-asistente.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { await context.close(); await browser.close(); await new Promise((resolve) => fixtureServer.close(resolve)); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
