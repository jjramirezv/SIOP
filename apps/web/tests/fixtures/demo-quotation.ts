export async function createDemoQuotation(): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1100;
  canvas.height = 940;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No pudimos generar la cotización de prueba. Puedes seleccionar una fotografía de tu dispositivo.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#0f172a';
  context.font = 'bold 32px Arial';
  context.fillText('PROVEEDOR ANDINO · COTIZACIÓN', 60, 80);
  context.font = '20px Arial';
  context.fillStyle = '#475569';
  context.fillText('Documento de demostración · Moneda: PEN (soles)', 60, 125);
  const lines = [
    'Producto: Insumos de almacén · Sensibilidad A',
    'Demanda: 2400 unidades al año · Base: 360 días por año',
    'Costo por pedido (transporte y trámites): 40 soles',
    'Mantenimiento fijo: 5 soles por unidad al año',
    'Compra actual: 200 unidades por pedido',
  ];
  context.fillStyle = '#0f172a';
  lines.forEach((line, index) => context.fillText(line, 60, 195 + index * 45));
  context.fillStyle = '#eef2ff';
  context.fillRect(60, 455, 980, 60);
  context.fillStyle = '#312e81';
  context.font = 'bold 22px Arial';
  context.fillText('Desde (unidades)', 85, 492);
  context.fillText('Hasta (unidades)', 400, 492);
  context.fillText('Precio por unidad', 725, 492);
  context.font = '24px monospace';
  [['0', '199', 'PEN 20.00'], ['200', '499', 'PEN 19.60'], ['500', 'En adelante', 'PEN 19.20']].forEach((row, index) => {
    const y = 565 + index * 75;
    context.fillStyle = '#0f172a';
    row.forEach((value, column) => context.fillText(value, [85, 400, 725][column], y));
    context.strokeStyle = '#cbd5e1';
    context.beginPath(); context.moveTo(60, y + 25); context.lineTo(1040, y + 25); context.stroke();
  });
  context.font = '20px Arial';
  context.fillStyle = '#475569';
  context.fillText('Descuento aplicado a todas las unidades de cada pedido.', 60, 835);
  context.fillText('Revisa períodos, mantenimiento y niveles de precio antes de calcular.', 60, 875);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => {
    if (value) resolve(value);
    else reject(new Error('No pudimos preparar la imagen de prueba. Intenta seleccionar otra fotografía.'));
  }, 'image/png'));
  return new File([blob], 'cotizacion-demo.png', { type: 'image/png' });
}

