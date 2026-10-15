// Sin interceptar solicitudes: navegador → proxy Vite → FastAPI → motor Python.
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const { chromium } = require(process.env.SIOP_PLAYWRIGHT_PATH || path.join(root, 'apps/web/node_modules/playwright'));
const url = process.env.SIOP_REVIEW_URL || 'http://localhost:5173/';
const output = path.join(root, 'apps/web/design/evidencia');

async function run() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.SIOP_BROWSER_CHANNEL || 'chrome', headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce', permissions: ['microphone'] });
  const page = await context.newPage();
  const errors = [];
  const checks = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const hero = page.getByRole('region', { name: 'Compra recomendada', exact: true });
  const apiResponse = (suffix) => page.waitForResponse((response) => response.url().endsWith(`/api/v1/${suffix}`) && response.request().method() === 'POST');
  async function calculate(expectedQuantity, expectedCost) {
    const pending = apiResponse('analyses');
    await page.getByRole('button', { name: 'Calcular mejor compra', exact: true }).click();
    const response = await pending;
    assert.equal(response.status(), 200);
    const data = await response.json();
    assert.equal(data.data_source, 'calculated');
    if (expectedQuantity !== undefined) assert.equal(data.recommended.quantity, expectedQuantity);
    if (expectedCost !== undefined) assert.equal(data.recommended.annual_costs.total, expectedCost);
    await page.waitForFunction(() => document.querySelector('[data-testid="results-panel"]') && !document.querySelector('[data-testid="results-panel"]').classList.contains('opacity-60'));
    const quantity = new Intl.NumberFormat('en-US').format(data.recommended.quantity);
    await hero.locator('.desk-hero-quantity').getByText(quantity, { exact: true }).waitFor();
    assert((await hero.innerText()).includes(new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(data.recommended.annual_costs.total)));
    return data;
  }
  try {
    await page.goto(url);
    await hero.waitFor();
    await page.getByText('Motor conectado', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Modo de datos').count(), 0);
    const healthResponse = await context.request.get(`${url.replace(/\/$/, '')}/api/v1/health`);
    assert.equal(healthResponse.status(), 200);
    const health = await healthResponse.json();
    checks.push({ check: 'Salud a través del proxy', status: health.status, ai_configured: health.ai_available });
    for (const [id, quantity, total] of [['ily', 1000, 150840], ['wohl', 1000, 24725], ['sensibilidad_a', 500, 47522], ['sensibilidad_b', 200, 48520]]) {
      await page.getByLabel('Caso de análisis').selectOption(id);
      await calculate(quantity, total);
      checks.push({ check: `Motor real ${id}`, quantity, total });
    }
    await page.getByLabel('Caso de análisis').selectOption('sensibilidad_a');
    await page.getByRole('tab', { name: 'Ventas', exact: true }).click();
    await page.getByLabel('¿Cuántas unidades vendes o necesitas?').fill('200');
    await page.getByLabel('Período de ventas', { exact: true }).selectOption('month');
    const monthly = await calculate(500, 47522);
    assert.equal(monthly.normalized.annual_demand, 2400);
    checks.push({ check: '200/mes equivale a 2400/año', total: 47522 });
    await page.getByLabel('¿Cuántas unidades vendes o necesitas?').fill('237');
    const custom = await calculate();
    assert.equal(custom.normalized.annual_demand, 2844);
    assert.equal(custom.input.demand.value, 237);
    checks.push({ check: 'Demanda arbitraria calculada en API', demand: 237, period: 'month', quantity: custom.recommended.quantity, total: custom.recommended.annual_costs.total });
    await page.getByLabel('Caso de análisis').selectOption('sensibilidad_a');
    await calculate(500, 47522);
    await page.getByRole('tab', { name: 'Costos', exact: true }).click();
    await page.getByLabel(/^Mantenimiento por unidad/).fill('10');
    assert.equal(await page.locator('[data-testid="results-panel"].opacity-60').count(), 1);
    await calculate(200, 48520);
    checks.push({ check: 'Mantenimiento 5 → 10 y protección de datos antiguos', quantity: 200 });
    await page.getByRole('tab', { name: 'Procedimiento', exact: true }).click();
    await page.getByText('Ver procedimiento matemático, fórmulas y supuestos del modelo').click();
    assert((await page.locator('.desk-workspace').innerText()).includes('2400'));
    await page.getByRole('tab', { name: 'Comparar', exact: true }).click();
    for (const width of [1366, 390, 320]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 768 });
      await page.getByRole('button', { name: 'Tabla', exact: true }).click();
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
      assert(dimensions.content <= dimensions.viewport + 1, `Desbordamiento a ${width}px`);
      await page.screenshot({ path: path.join(output, `integracion-${width}.png`), fullPage: true });
      checks.push({ check: 'Tabla adaptable sin desbordamiento', width });
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.getByRole('button', { name: 'Asistente IA (Texto, Foto y Voz)' }).click();
    const panel = page.getByRole('complementary', { name: 'Asistente inteligente' });
    assert.equal(await panel.getByRole('button', { name: /Simular|Demo/ }).count(), 0);
    if (!health.ai_available) {
      await panel.getByLabel('Mensaje para el asistente').fill('Vendo 200 cuadernos al mes.');
      let pending = apiResponse('assistant/messages');
      await panel.getByRole('button', { name: 'Enviar', exact: true }).click();
      assert.equal((await pending).status(), 503);
      await panel.getByRole('alert').waitFor();
      assert.equal(await panel.getByRole('region', { name: 'Borrador revisable del asistente' }).count(), 0);
      checks.push({ check: 'Texto real sin credenciales: error 503 recuperable, sin borrador inventado' });
      await panel.getByRole('tab', { name: 'Fotografía', exact: true }).click();
      await panel.getByLabel('Selecciona una fotografía o cotización').setInputFiles({ name: 'cotizacion.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA1cAAAAASUVORK5CYII=', 'base64') });
      await panel.getByLabel('Contexto adicional de la foto').fill('Revisa los tramos del proveedor.');
      pending = apiResponse('assistant/extract-image');
      await panel.getByRole('button', { name: 'Extraer datos de la fotografía' }).click();
      assert.equal((await pending).status(), 503);
      checks.push({ check: 'Fotografía real y contexto llegan a API; 503 sin configuración' });
      await panel.getByRole('tab', { name: 'Voz', exact: true }).click();
      await panel.getByRole('button', { name: 'Grabar mensaje de voz' }).click();
      await panel.getByText('Grabando', { exact: false }).waitFor();
      // Captura real de MediaRecorder, con dispositivo de audio de prueba de Chrome.
      pending = apiResponse('assistant/transcribe');
      await page.waitForTimeout(700);
      await panel.getByRole('button', { name: 'Detener y transcribir' }).click();
      assert.equal((await pending).status(), 503);
      await panel.getByText('Reintentar transcripción', { exact: true }).waitFor();
      checks.push({ check: 'MediaRecorder produce WebM válido para API; 503 recuperable sin credenciales' });
      await page.getByRole('button', { name: 'Calcular mejor compra', exact: true }).click();
      await page.getByRole('button', { name: 'Calcular mejor compra', exact: true }).waitFor();
      assert((await hero.innerText()).includes('48,520.00'));
      checks.push({ check: 'Calculadora manual disponible después de fallos de IA' });
      await page.screenshot({ path: path.join(output, 'integracion-asistente.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    const report = { url, checked_at: new Date().toISOString(), ai_live_verified: false, ai_limitation: 'Se necesita clave y modelo de Gemini para comprobar interpretación/transcripción con el proveedor real.', checks, page_errors: errors };
    fs.writeFileSync(path.join(output, 'integracion-real.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { await context.close(); await browser.close(); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
