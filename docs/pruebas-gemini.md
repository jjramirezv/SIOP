# Pruebas con la clave real — 15 de octubre de 2026

Se encontró el archivo adjuntado como `.env.txt` en la raíz, se renombró a `.env` y se inició FastAPI con esa configuración. La clave se carga correctamente y el modelo configurado es `gemini-3.8-flash`. No se imprimió ni se incorporó la clave a los artefactos de prueba.

## Resultados observados

| Prueba | Resultado |
| --- | --- |
| Salud | HTTP 200, `ai_available=true`; indica configuración presente. |
| Texto completo | HTTP 200 de Gemini. Borrador con demanda 200/mes y mantenimiento 5/año. El formulario permaneció intacto hasta confirmar. |
| Revisión del borrador | Se editó mantenimiento a 10 y se confirmó en la interfaz. FastAPI calculó Q=200 y costo anual PEN 48520. |
| Texto incompleto | HTTP 200. Pidió moneda, costos y tramos faltantes, sin inventar los valores. |
| Explicación vigente | HTTP 200. Explicó Q=200 y PEN 48520 a partir de la entrada recalculada por el servidor. |
| Escenario alternativo | El chip pidió concretar qué cambiar. Una petición explícita de mantenimiento=10 produjo HTTP 200 y propuesta con confirmación obligatoria. |
| Fotografía | HTTP 200. Extrajo exactamente mínimos 0/200/500, precios 20/19.60/19.20 y mantenimiento fijo=5. No cambió el formulario hasta aplicar. |
| Aplicación de la fotografía | Confirmación en la interfaz y cálculo real: Q=500, costo anual PEN 47522. |
| Audio hablado en español | HTTP 200. Transcribió fielmente el WAV de prueba y lo mostró como texto editable antes de enviar. |
| Interpretación del texto de voz | El envío desde la interfaz encontró saturación. La comprobación posterior por el mismo endpoint devolvió HTTP 200, demanda 200/mes y datos que calcularon Q=500 y PEN 47522. |

El WAV se generó con Microsoft Sabina, una voz local de Windows. No se grabó el micrófono del usuario ni se utilizó hardware físico. La cotización es una imagen de prueba legible; sus números se interpretaron mediante el proveedor real, sin respuestas interceptadas.

## Incidencia del proveedor

Gemini devolvió respuestas HTTP 503 de alta demanda durante varias llamadas. Algunos reintentos funcionaron y otros dos intentos consecutivos fallaron. Esto también interrumpió el recorrido continuo del navegador: su informe conserva `completed=false`, no se declara una aprobación completa de ese recorrido.

Se corrigió el manejo del 503 del proveedor: ahora la API mantiene el estado 503 y muestra «Gemini está temporalmente saturado. Espera unos segundos y vuelve a intentarlo», en lugar de sugerir que el modelo está mal configurado. En esa verificación inicial la interfaz permitía reintentar manualmente y seguir usando la calculadora; el comportamiento posterior se describe abajo. La clave quedó validada por las respuestas 200; esta prueba no garantiza disponibilidad continua o cuota futura.

## Evidencia

- [Recorrido del navegador, con éxitos y errores temporales](../tests/e2e/evidencia-ia/gemini-real.json).
- [Comprobaciones posteriores del escenario y del texto de voz](../tests/e2e/evidencia-ia/continuacion-api.json).
- [Borrador de texto antes de confirmar](../tests/e2e/evidencia-ia/texto-borrador-revisable.png).
- [Borrador extraído de fotografía](../tests/e2e/evidencia-ia/fotografia-borrador-revisable.png).
- [Transcripción real en revisión](../tests/e2e/evidencia-ia/voz-transcripcion-editable.png).
- [Comprobación de protección de la clave](../tests/e2e/evidencia-ia/proteccion-credenciales.json).

El `.env` está ignorado por Git y no está versionado. La búsqueda de la clave literal en el bundle de producción y los archivos públicos del repositorio no encontró coincidencias. La calculadora no depende del proveedor de IA.

Regresión actual, ejecutada sin llamadas a Gemini: **152 pruebas de backend** y **127 pruebas de frontend** aprobadas. `npm run build` generó el bundle sin errores ni avisos de TypeScript. Persisten los avisos conocidos de dependencias Zod/Rollup y Starlette/httpx descritos en el registro de integración.

La lista actual de modelos y sus capacidades puede consultarse en la [documentación oficial de Gemini](https://ai.google.dev/gemini-api/docs/models).

## Actualización de la experiencia de espera

El asistente mantiene la carga durante fallos temporales, reintenta automáticamente con pausas crecientes y conserva el mensaje, contexto, fotografía o audio original. Después de ocho segundos muestra «Esto puede demorar más de lo esperado. Seguimos intentando; no necesitas volver a enviar tus datos».

La espera puede cancelarse. Hay un máximo de cinco intentos y un plazo total de tres minutos. Si no se completa, muestra un aviso discreto de solicitud conservada y permite reintentar sin volver a ingresar los datos. La conservación es en memoria durante la sesión de la página, no almacenamiento persistente. Los errores de configuración, permisos y archivos inválidos no se ocultan como carga.

El backend indica `retryable` y `retry_after_seconds` y transmite `Retry-After`. Respeta las indicaciones `RetryInfo`, las cuotas diarias y las esperas largas del proveedor. Cuando Gemini indica que hay que esperar varias horas, el cliente conserva la solicitud sin repetir llamadas ni simular una carga interminable.

En la comprobación real posterior, Gemini informó cuota diaria gratuita agotada (20 solicitudes para el modelo configurado) y un tiempo de recuperación de varias horas. Se registró el diagnóstico en [proveedor-real.json](../tests/e2e/evidencia-espera/proveedor-real.json). No se hicieron más pruebas con el proveedor después de identificar esta limitación. Una espera breve no restablece esa cuota.

La nueva experiencia se comprobó con fallos controlados, sin consumir cuota: texto, foto y audio recibieron dos errores temporales y se recuperaron automáticamente en el tercer intento; se verificaron los archivos completos, la nota, el contexto, una sola burbuja, cancelación y calculadora disponible. Ver [informe](../tests/e2e/evidencia-espera/espera-asistente.json) y [captura de la espera](../tests/e2e/evidencia-espera/texto-esperando.png).

Para repetir esta verificación con ambos servidores iniciados, desde la raíz:

```powershell
node tests/e2e/espera-asistente.cjs
```

Los reintentos acotados siguen la [guía oficial de recuperación de errores de Gemini](https://ai.google.dev/gemini-api/docs/troubleshooting). Los límites de cuota corresponden al proyecto y al modelo, como explica la [documentación de límites](https://ai.google.dev/gemini-api/docs/rate-limits).
