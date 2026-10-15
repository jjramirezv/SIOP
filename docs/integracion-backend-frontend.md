# Integración de SIOP — 15 de octubre de 2026

El frontend usa el motor de Python y los endpoints reales de FastAPI. Se preservó la distribución de «Mesa de decisión». La clave y el modelo ya se cargan desde el `.env` de la raíz. Se comprobaron respuestas reales de texto, fotografía y audio; el proveedor presentó saturación intermitente. El registro de esta comprobación está en [pruebas-gemini.md](pruebas-gemini.md).

## Organización y conservación de archivos

| Ubicación anterior | Ubicación actual |
| --- | --- |
| `app/` | `apps/api/app/` |
| `requirements.txt` | `apps/api/requirements.txt` |
| `tools/export_contract.py` | `apps/api/tools/export_contract.py` |
| `tests/test_analysis_engine.py` | `apps/api/tests/unit/test_analysis_engine.py` |
| `tests/test_contracts.py` | `apps/api/tests/integration/test_contracts.py` |
| `tests/test_assistant.py`, `tests/test_transcription.py` | `apps/api/tests/assistant/` |
| `apps/web/src/mocks/reference-cases.ts` | `apps/web/tests/fixtures/reference-cases.ts` |
| `apps/web/tests/browser-redesign.cjs` | `apps/web/design/legacy/browser-redesign.cjs` |

No se eliminaron archivos de código no vacíos. Los archivos trasladados pueden aparecer como eliminaciones y altas hasta que Git detecte sus nuevos destinos. Los bytecodes y cachés existentes se conservaron físicamente dentro del backend y siguen sujetos al `.gitignore`.

Se añadieron `pyproject.toml`, configuración de pytest, ejemplos de entorno, los cuatro fixtures compartidos, ejemplos JSON y el contrato OpenAPI exportable. La carpeta `apps/api/app/domain/` continúa independiente de FastAPI y del proveedor de IA.

## Conexiones

- Navegador → `/api/v1` → proxy de Vite → FastAPI en `127.0.0.1:8000`.
- `api-client.ts` realiza exclusivamente HTTP. No importa mocks, no contiene banderas de simulación y no sustituye un fallo por datos de ejemplo.
- `api-adapters.ts` valida el contrato anidado de la API y lo traduce a los campos de las vistas. Inversión, frecuencia, ciclo y costos de cada alternativa llegan calculados por Python. Un tramo excluido muestra su motivo sin cantidad ni costos inventados.
- El selector conserva entradas ILY, Wohl y Sensibilidad como ejemplos. Todos los resultados, incluidos cambios arbitrarios, se solicitan a `/analyses`.
- El asistente envía borrador, historial y entrada del análisis vigente. El servidor recalcula esa entrada para explicar un resultado verificado. Los resultados desactualizados no se ofrecen como contexto vigente.
- Fotografía envía `file`, `context` y borrador JSON por multipart. Audio envía el archivo por multipart y conserva la transcripción editable antes del flujo común de texto.
- Propuestas de IA siempre pasan por `DraftReviewCard`. Recibirlas no cambia el formulario; aplicarlas explícitamente fusiona los datos revisados y solicita otro cálculo.
- El micrófono se libera al detener, cancelar, desmontar, cerrar o cambiar de pestaña. La grabación tiene un máximo de 60 segundos; archivos de imagen hasta 5 MB y audio hasta 10 MB.

## Verificación

Los comandos reproducibles están en la sección 13 del [README](../README.md). El recorrido del navegador se encuentra en `tests/e2e/integracion-real.cjs` y usa Chrome con un dispositivo de captura de prueba, sin interceptar ni simular solicitudes HTTP.

Resultado final comprobado:

- `pytest -q`: 148 pruebas aprobadas.
- `npm test`: 111 pruebas aprobadas en 7 archivos.
- `npm run build`: compilación correcta, cero errores o avisos de TypeScript.
- `npm ci`: instalación reproducible completada; auditoría de npm con cero vulnerabilidades conocidas.
- `npm run test:e2e`: 15 comprobaciones aprobadas en `http://localhost:5173/`, sin errores JavaScript.

| Escenario real | Cantidad recomendada | Costo anual |
| --- | ---: | ---: |
| ILY | 1000 | USD 150840.00 |
| Wohl | 1000 | USD 24725.00 |
| Sensibilidad A, mantenimiento 5 | 500 | PEN 47522.00 |
| Sensibilidad B, mantenimiento 10 | 200 | PEN 48520.00 |
| Demanda arbitraria: 237/mes, mantenimiento 5 | 500 | PEN 56082.32 |

También se verificaron demanda mensual equivalente a anual, compra actual, señal de resultados desactualizados, procedimiento, tablas en 1366/390/320 px sin desbordamiento y ausencia de errores JavaScript.

En la verificación inicial, antes de configurar la clave, con `ai_available=false`, texto y fotografía llegaron a sus endpoints y devolvieron 503. MediaRecorder produjo WebM que pasó la validación de formato y llegó al servicio de transcripción, que devolvió el mismo error controlado de configuración. La calculadora siguió operativa. Los éxitos y errores del proveedor se cubren en pruebas aisladas con dobles; eso no acredita acceso real a Gemini.

Informe del navegador: [integracion-real.json](../apps/web/design/evidencia/integracion-real.json). Capturas: [escritorio](../apps/web/design/evidencia/integracion-1366.png), [móvil](../apps/web/design/evidencia/integracion-390.png) y [asistente](../apps/web/design/evidencia/integracion-asistente.png).

## Estado posterior a configurar Gemini

El archivo adjuntado como `.env.txt` se renombró a `.env` y la API se reinició. Las variables `GEMINI_API_KEY` y `GEMINI_TEXT_MODEL` se cargaron correctamente. El archivo sigue ignorado por Git y la clave no aparece en los bundles ni en los archivos públicos del proyecto.

Se comprobaron respuestas 200 de los tres canales y de explicación/escenario, además de un cálculo correcto desde la transcripción. El recorrido continuo del navegador encontró respuestas 503 de Gemini; los puntos afectados se comprobaron posteriormente por API. No se presenta ese recorrido continuo como una suite completamente aprobada. Ver [el detalle y la evidencia](pruebas-gemini.md).

`GET /health` informa configuración, no una prueba de acceso al proveedor. La captura con micrófono físico, la revisión conjunta del equipo y WinQSB siguen pendientes. El WAV usado contiene voz sintetizada localmente en español.

## Avisos de dependencias

El build de Vite puede mostrar dos avisos de Rollup sobre comentarios de anotación en Zod. pytest informa una deprecación de Starlette sobre su integración con httpx. No son errores del proyecto ni diagnósticos de TypeScript. Vitest se actualizó a 4.1.11 después de la auditoría de dependencias; npm informó cero vulnerabilidades conocidas tras esa actualización.

Referencias técnicas consultadas: [Gemini: salida estructurada](https://ai.google.dev/gemini-api/docs/structured-output), [FastAPI: CORS](https://fastapi.tiangolo.com/tutorial/cors/) y [Vitest 4: migración](https://v4.vitest.dev/guide/migration.html).
