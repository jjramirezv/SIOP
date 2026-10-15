// Prueba explícita con consumo de Gemini. No lee ni registra la clave de API.
// Requiere frontend/API iniciados y SIOP_RUN_LIVE_AI=1.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const { chromium } = require(path.join(root, 'apps/web/node_modules/playwright'));
const base = process.env.SIOP_REVIEW_URL || 'http://localhost:5173/';
const directory = path.join(__dirname, 'evidencia-ia');
const fixtureDir = path.join(__dirname, 'fixtures');
const exercise = 'Producto: cuadernos. Moneda PEN (soles peruanos). Vendo 200 unidades al mes. Trabajo 360 días por año. Cada pedido cuesta 40 soles. El mantenimiento es un monto fijo de 5 soles por unidad al año. Precios aplicados a todas las unidades: desde 0 unidades, 20 soles; desde 200 unidades, 19.60 soles; desde 500 unidades, 19.20 soles. Compro actualmente 200 unidades por pedido. Prepara un borrador con esos datos para que lo revise antes de calcular.';

async function run() {
  assert.equal(process.env.SIOP_RUN_LIVE_AI, '1', 'Para autorizar llamadas reales, configura SIOP_RUN_LIVE_AI=1.');
  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(fixtureDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(205000);
  const report = { checked_at: new Date().toISOString(), url: base, provider: 'Gemini', live: true,
    audio_origin: 'WAV hablado con Microsoft Sabina local; no micrófono físico', checks: [], calls: [], page_errors: [], completed: false };
  const resumeScenario = process.env.SIOP_AI_RESUME === 'scenario';
  if (resumeScenario) {
    const previous = JSON.parse(fs.readFileSync(path.join(directory, 'gemini-real.json'), 'utf8'));
    assert(previous.checks.length >= 2, 'La continuación requiere texto y explicación ya comprobados.');
    report.previous_checked_at = previous.checked_at;
    report.checks = previous.checks;
    report.calls = previous.calls;
  }
  page.on('pageerror', (error) => report.page_errors.push(error.message));
  let analyses = 0;
  page.on('request', (request) => { if (request.url().endsWith('/api/v1/analyses') && request.method() === 'POST') analyses += 1; });
  function save() { fs.writeFileSync(path.join(directory, 'gemini-real.json'), JSON.stringify(report, null, 2) + '\n'); }
  async function call(label, endpoint, action, retry = action) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const started = Date.now();
      let automaticRetries = 0;
      const pending = page.waitForResponse(async (response) => {
        if (!response.url().endsWith(`/api/v1/${endpoint}`) || response.request().method() !== 'POST') return false;
        if ([429, 503].includes(response.status())) {
          const body = await response.json();
          if (body.error?.retryable && automaticRetries < 4) {
            report.calls.push({ label, attempt, automatic_retry: ++automaticRetries, status: response.status(), milliseconds: Date.now() - started, response: body });
            save();
            return false;
          }
        }
        return true;
      }, { timeout: 200000 });
      await (attempt === 1 ? action : retry)();
      const response = await pending;
      const body = await response.json();
      report.calls.push({ label, attempt, status: response.status(), milliseconds: Date.now() - started, response: body });
      save();
      if (response.status() === 503 && attempt < 2) {
        await page.waitForTimeout(3500);
        continue;
      }
      assert.equal(response.status(), 200, `${label}: ${JSON.stringify(body)}`);
      return { body, request: response.request() };
    }
  }
  const panel = page.getByRole('complementary', { name: 'Asistente inteligente' });
  const draft = () => panel.getByRole('region', { name: 'Borrador revisable del asistente' });
  async function apply(quantity, total) {
    const response = await call('Aplicar borrador revisado y calcular', 'analyses', () => draft().getByRole('button', { name: 'Aplicar datos al formulario y calcular' }).click());
    assert.equal(response.body.recommended.quantity, quantity);
    assert.equal(response.body.recommended.annual_costs.total, total);
    await page.getByRole('button', { name: 'Calcular mejor compra', exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-testid="results-panel"]').classList.contains('opacity-60'));
    await draft().waitFor({ state: 'detached' });
  }
  try {
    const health = await context.request.get(`${base.replace(/\/$/, '')}/api/v1/health`);
    assert.equal((await health.json()).ai_available, true, 'Falta configurar Gemini en la API.');
    await page.goto(base);
    await page.getByRole('heading', { name: 'Compra recomendada', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Asistente IA (Texto, Foto y Voz)' }).click();
    if (!resumeScenario) {
    await panel.getByLabel('Mensaje para el asistente').fill(exercise);
    const beforeText = analyses;
    const text = await call('Interpretación de texto completo', 'assistant/messages', () => panel.getByRole('button', { name: 'Enviar', exact: true }).click(), () => panel.getByRole('button', { name: 'Reintentar mensaje' }).click());
    assert.equal(text.body.data_source, 'assistant');
    assert.equal(text.body.requires_confirmation, true);
    assert.equal(text.body.proposed_input.demand.value, 200);
    assert.equal(text.body.proposed_input.demand.period, 'month');
    assert.equal(text.body.proposed_input.holding_cost.value, 5);
    await draft().waitFor();
    assert.equal(await page.getByLabel('¿Cuántas unidades vendes o necesitas?').inputValue(), '10000');
    assert.equal(analyses, beforeText);
    await draft().getByLabel(/Costo de mantenimiento/).fill('10');
    assert.equal(analyses, beforeText);
    await page.screenshot({ path: path.join(directory, 'texto-borrador-revisable.png'), fullPage: true });
    await apply(200, 48520);
    report.checks.push('Texto real → borrador editable → corrección H=10 → confirmación → Q=200 y CT=48520. El formulario no cambia antes de confirmar.');

    const explanation = await call('Explicación comercial del análisis vigente', 'assistant/messages', () => panel.getByRole('button', { name: 'Explícame el resultado' }).click(), () => panel.getByRole('button', { name: 'Reintentar mensaje' }).click());
    assert.equal(explanation.body.action, 'explain');
    assert(explanation.body.message.includes('200'), 'La explicación debe mencionar la cantidad recomendada.');
    assert(explanation.body.message.replace(/[^0-9]/g, '').includes('48520'), 'La explicación debe usar el costo anual verificado.');
    assert.equal(explanation.body.proposed_input, null);
    report.checks.push('Explicación real usa la entrada vigente recalculada por el backend.');
    } else {
      await page.getByLabel('Caso de análisis').selectOption('sensibilidad_b');
      const restored = await call('Restaurar escenario calculado para continuar las pruebas', 'analyses', () => page.getByRole('button', { name: 'Calcular mejor compra', exact: true }).click());
      assert.equal(restored.body.recommended.quantity, 200);
      assert.equal(restored.body.recommended.annual_costs.total, 48520);
      await page.getByRole('button', { name: 'Calcular mejor compra', exact: true }).waitFor();
    }

    report.pending = [];
    try {
    const beforeScenario = analyses;
    if (resumeScenario) await panel.getByLabel('Mensaje para el asistente').fill('Para un escenario hipotético cambia solo el mantenimiento a un monto fijo de 5 soles por unidad al año. Conserva los otros datos actuales y prepara un borrador revisable sin calcular todavía.');
    let scenario = await call('Escenario alternativo', 'assistant/messages', () => resumeScenario ? panel.getByRole('button', { name: 'Enviar', exact: true }).click() : panel.getByRole('button', { name: 'Prueba otro escenario' }).click(), () => panel.getByRole('button', { name: 'Reintentar mensaje' }).click());
    // Si el proveedor pide concretar el cambio, el usuario lo indica explícitamente.
    if (scenario.body.action === 'clarify') {
      assert.equal(scenario.body.proposed_input, null);
      await panel.getByLabel('Mensaje para el asistente').fill('Para el escenario hipotético cambia solo el mantenimiento a un monto fijo de 5 soles por unidad al año. Conserva los otros datos actuales y prepara un borrador revisable sin calcular todavía.');
      scenario = await call('Aclaración explícita del cambio de escenario', 'assistant/messages', () => panel.getByRole('button', { name: 'Enviar', exact: true }).click(), () => panel.getByRole('button', { name: 'Reintentar mensaje' }).click());
    }
    assert.equal(scenario.body.requires_confirmation, true);
    assert(scenario.body.proposed_input);
    await draft().getByRole('button', { name: 'Descartar propuesta' }).click();
    assert.equal(analyses, beforeScenario);
    report.checks.push('Escenario real propuesto y descartado sin cambiar ni recalcular el formulario.');
    } catch (error) {
      report.pending.push({ feature: 'Escenario alternativo', reason: error.message });
      save();
    }

    const quote = await context.newPage();
    await quote.setViewportSize({ width: 1100, height: 820 });
    await quote.setContent(`<html lang="es"><meta charset="utf-8"><body style="margin:0;padding:50px;background:white;color:#102033;font:24px Arial"><h1 style="font-size:34px">PROVEEDOR ANDINO — COTIZACIÓN</h1><p>Producto: Cuadernos · Moneda: PEN (soles)</p><p>Demanda: 200 unidades al mes · 360 días por año</p><p>Costo por pedido: S/ 40.00</p><p>Mantenimiento FIJO: S/ 5.00 por unidad AL AÑO</p><p>Compra actual: 200 unidades por pedido</p><table style="border-collapse:collapse;width:100%;line-height:2.3"><tr><th style="text-align:left">Desde / unidades</th><th>Precio por unidad</th></tr><tr><td>0</td><td style="text-align:center">S/ 20.00</td></tr><tr><td>200</td><td style="text-align:center">S/ 19.60</td></tr><tr><td>500</td><td style="text-align:center">S/ 19.20</td></tr></table><p style="font-size:20px">El precio del tramo se aplica a todas las unidades del pedido.</p></body></html>`);
    const quoteFile = path.join(fixtureDir, 'cotizacion-legible.png');
    await quote.screenshot({ path: quoteFile, fullPage: true });
    await quote.close();
    await panel.getByRole('tab', { name: 'Fotografía', exact: true }).click();
    await panel.getByLabel('Selecciona una fotografía o cotización').setInputFiles(quoteFile);
    await panel.getByLabel('Contexto adicional de la foto').fill('La cotización adjunta reemplaza los datos del escenario anterior solo si confirmo el borrador. Extrae fielmente sus números.');
    const beforeImage = analyses;
    const photo = await call('Extracción real de cotización PNG', 'assistant/extract-image', () => panel.getByRole('button', { name: 'Extraer datos de la fotografía' }).click());
    assert.equal(photo.body.requires_confirmation, true);
    assert.equal(photo.body.proposed_input.holding_cost.value, 5);
    assert.deepEqual(photo.body.proposed_input.discount_tiers, [{ min_quantity: 0, unit_price: 20 }, { min_quantity: 200, unit_price: 19.6 }, { min_quantity: 500, unit_price: 19.2 }]);
    await draft().waitFor();
    assert.equal(await page.getByLabel(/^Mantenimiento por unidad/).inputValue(), '10');
    assert.equal(analyses, beforeImage);
    await page.screenshot({ path: path.join(directory, 'fotografia-borrador-revisable.png'), fullPage: true });
    await apply(500, 47522);
    report.checks.push('Foto PNG interpretada por Gemini → revisión humana → Q=500 y CT=47522. Precios y mantenimiento extraídos fielmente.');

    await panel.getByRole('tab', { name: 'Voz', exact: true }).click();
    const voice = await call('Transcripción real de WAV hablado en español', 'assistant/transcribe', () => panel.getByLabel('Archivo de audio para transcribir').setInputFiles(path.join(fixtureDir, 'ejercicio-hablado.wav')), () => panel.getByRole('button', { name: 'Reintentar transcripción' }).click());
    assert(/200|doscient[ao]s/i.test(voice.body.text));
    assert(/mes/i.test(voice.body.text));
    const transcript = panel.getByLabel('Revisa o corrige la transcripción antes de enviarla al asistente:');
    await transcript.waitFor();
    assert.equal(await transcript.inputValue(), voice.body.text);
    const reviewed = `${voice.body.text}\nEl nombre de producto confirmado es: Cuadernos revisados por voz.`;
    await transcript.fill(reviewed);
    await page.screenshot({ path: path.join(directory, 'voz-transcripcion-editable.png'), fullPage: true });
    const beforeVoice = analyses;
    const interpreted = await call('Texto revisado de voz por el flujo común del asistente', 'assistant/messages', () => panel.getByRole('button', { name: 'Enviar texto revisado al asistente' }).click(), () => panel.getByRole('button', { name: 'Reintentar mensaje' }).click());
    assert.equal(interpreted.request.postDataJSON().message, reviewed);
    assert.equal(interpreted.body.requires_confirmation, true);
    await draft().waitFor();
    assert.equal(analyses, beforeVoice);
    await apply(500, 47522);
    report.checks.push('WAV español → transcripción real editable → corrección explícita → mismo endpoint de Texto → borrador revisable → cálculo correcto.');
    assert.deepEqual(report.page_errors, []);
    report.completed = report.pending.length === 0;
    await page.screenshot({ path: path.join(directory, 'asistente-real-completado.png'), fullPage: true });
    save();
    console.log(JSON.stringify({ completed: report.completed, checks: report.checks, pending: report.pending, calls: report.calls.map(({ label, attempt, status, milliseconds }) => ({ label, attempt, status, milliseconds })), page_errors: report.page_errors }, null, 2));
    if (!report.completed) process.exitCode = 1;
  } catch (error) {
    report.failure = error.message;
    await page.screenshot({ path: path.join(directory, 'fallo-revisable.png'), fullPage: true }).catch(() => {});
    save();
    throw error;
  } finally { await context.close(); await browser.close(); }
}
run().catch((error) => { console.error(error.message); process.exitCode = 1; });
