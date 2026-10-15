// Revisión real con Playwright; SIOP_PLAYWRIGHT_PATH permite usar un runtime existente.
const { chromium } = require(process.env.SIOP_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function run() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const output = path.resolve(__dirname, '../design/evidencia');
  fs.mkdirSync(output, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  const checks = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const hero = page.getByRole('region', { name: 'Compra recomendada', exact: true });
  async function calculate() {
    await page.getByRole('button', { name: 'Calcular mejor compra', exact: true }).click();
    await page.getByRole('button', { name: 'Calcular mejor compra', exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-testid="results-panel"]')?.classList.contains('opacity-60'));
  }
  async function stableChart() {
    if (!(await page.getByRole('figure').count())) return;
    await page.waitForFunction(() => {
      const svg = document.querySelector('.desk-chart .recharts-surface');
      const container = document.querySelector('.desk-chart .recharts-responsive-container');
      return svg && container && Math.abs(Number(svg.getAttribute('width')) - container.getBoundingClientRect().width) < 2 && document.querySelectorAll('.recharts-label-list text').length >= 3;
    });
  }
  async function noOverflow(label) {
    await stableChart();
    const size = await page.evaluate(() => ({ width: innerWidth, actual: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
    assert(size.actual <= size.width + 1, `${label}: desbordamiento ${JSON.stringify(size)}`);
    checks.push({ label, ...size });
  }
  try {
    await page.goto(process.env.SIOP_REVIEW_URL || 'http://localhost:5175/');
    await page.getByRole('heading', { name: 'Compra recomendada', exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const [id, quantity, annual] of [['ily', '1,000', '150,840.00'], ['wohl', '1,000', '24,725.00'], ['sensibilidad_b', '200', '48,520.00'], ['sensibilidad_a', '500', '47,522.00']]) {
      await page.getByLabel('Caso de análisis').selectOption(id);
      await calculate();
      assert(await hero.getByText(quantity, { exact: true }).count(), `${id}: cantidad`);
      assert((await hero.innerText()).includes(annual), `${id}: costo anual`);
      checks.push({ label: `Referencia ${id}`, quantity, annual });
    }
    for (const width of [1366, 1024, 850, 390, 320]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 768 });
      await noOverflow(`Comparar ${width}`);
      if (width === 1366) {
        const bounds = await page.locator('.desk-calculate').boundingBox();
        assert(bounds.y + bounds.height <= 768, 'El botón principal debe caber en el caso típico de escritorio');
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(output, 'mesa-desktop.png'), fullPage: true });
      }
      if (width === 390) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(output, 'mesa-mobile.png'), fullPage: true });
      }
      await page.getByRole('button', { name: 'Tabla', exact: true }).click();
      await noOverflow(`Tabla ${width}`);
      await page.getByRole('button', { name: 'Ver desglose del tramo 3' }).click();
      await noOverflow(`Desglose ${width}`);
      await page.getByRole('tab', { name: 'Resumen', exact: true }).click();
      await noOverflow(`Resumen ${width}`);
      await page.getByRole('tab', { name: 'Procedimiento', exact: true }).click();
      await page.getByText('Ver procedimiento matemático, fórmulas y supuestos del modelo').click();
      await noOverflow(`Procedimiento ${width}`);
      for (const group of ['Ventas', 'Precios', 'Costos']) {
        await page.getByRole('tab', { name: group, exact: true }).click();
        await noOverflow(`${group} ${width}`);
      }
      await page.getByRole('tab', { name: 'Comparar', exact: true }).click();
      // La vista elegida se conserva al volver de Resumen o Procedimiento.
      await page.getByRole('table').waitFor();
      await page.getByRole('button', { name: 'Gráfico', exact: true }).click();
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.getByLabel(/^Mantenimiento por unidad/).fill('10');
    assert(await page.locator('[data-testid="results-panel"].opacity-60').count());
    assert(await hero.getByText('500', { exact: true }).count());
    await calculate();
    assert(await hero.getByText('200', { exact: true }).count());
    assert((await hero.innerText()).includes('48,520.00'));
    checks.push({ label: 'Cambiar mantenimiento marca pendiente y recalcula 500 → 200' });
    await page.getByRole('tab', { name: 'Precios', exact: true }).click();
    await page.getByLabel('Precio por unidad del tramo 2 (PEN)', { exact: true }).fill('21');
    await page.getByRole('tab', { name: 'Costos', exact: true }).click();
    await page.getByRole('button', { name: 'Calcular mejor compra', exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'discount_tiers.1.unit_price');
    assert.equal(await page.getByRole('tab', { name: /Precios/ }).getAttribute('aria-selected'), 'true');
    checks.push({ label: 'Error oculto abre Precios y enfoca el campo inválido' });
    await page.getByLabel('Caso de análisis').selectOption('sensibilidad_a');
    await calculate();
    await page.getByRole('button', { name: 'Asistente IA (Texto, Foto y Voz)' }).click();
    const assistant = page.getByRole('complementary', { name: 'Asistente inteligente' });
    await assistant.getByRole('tab', { name: 'Fotografía', exact: true }).click();
    await assistant.getByRole('button', { name: 'Cotización de prueba (Demo)' }).click();
    await assistant.getByRole('button', { name: 'Extraer datos de la fotografía' }).click();
    const photoDraft = assistant.getByRole('region', { name: 'Borrador revisable del asistente' });
    await photoDraft.waitFor();
    const reviewBorder = await photoDraft.getByLabel(/^Costo de mantenimiento/).evaluate((el) => getComputedStyle(el).borderTopColor);
    assert.equal(reviewBorder, 'rgb(194, 139, 36)');
    checks.push({ label: 'Los campos de IA por revisar conservan borde ámbar', border: reviewBorder });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'mesa-borrador.png'), fullPage: true });
    assert(!(await page.locator('[data-testid="results-panel"].opacity-60').count()));
    await assistant.getByRole('button', { name: 'Descartar propuesta' }).click();
    await assistant.getByRole('tab', { name: 'Voz', exact: true }).click();
    await assistant.getByRole('button', { name: 'Simular grabación de prueba' }).click();
    const transcript = assistant.getByLabel('Revisa o corrige la transcripción antes de enviarla al asistente:');
    await transcript.waitFor();
    await assistant.getByRole('button', { name: 'Enviar texto revisado al asistente' }).click();
    await assistant.getByRole('region', { name: 'Borrador revisable del asistente' }).waitFor();
    await assistant.getByRole('button', { name: 'Aplicar datos al formulario y calcular' }).click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="results-panel"]')?.classList.contains('opacity-60'));
    checks.push({ label: 'Foto demo y voz revisada conservan confirmación humana' });
    await noOverflow('Asistente escritorio');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'mesa-asistente.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 844 });
    await noOverflow('Asistente 320');
    await page.getByRole('button', { name: 'Cerrar asistente' }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.desk-primary').evaluate((el) => getComputedStyle(el).transitionDuration), '0s');
    checks.push({ label: 'Movimiento reducido desactiva transiciones' });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'redesign-checks.json'), JSON.stringify({ checkedAt: new Date().toISOString(), checks, errors }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
  } finally { await browser.close(); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
