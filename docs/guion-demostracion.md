# Guion de demostración — SIOP, Rubén

Este recorrido conserva el orden de «Revisión del sprint» del README y utiliza la API real. La calculadora no depende de credenciales de IA.

## Preparación

- Iniciar backend y frontend con los comandos de la sección 13 del README y abrir la URL mostrada por Vite.
- Verificar «Motor conectado» en el encabezado. Los casos del selector son entradas de ejemplo calculadas por Python.
- Configurar clave y modelo de Gemini en `apps/api/.env` antes de demostrar las respuestas de IA. Sin credenciales, mostrar el error recuperable y continuar con la calculadora; registrar estos pasos como pendientes.
- Usar localhost o HTTPS para el micrófono y disponer de una imagen PNG/JPEG/WebP de hasta 5 MB y un audio WebM/MP3/WAV/M4A de hasta 10 MB.

## Paso 1. Caso manual y verificación de referencias

1. Mostrar los campos de producto, ventas y períodos, costo de pedido, almacenamiento y precios por volumen.
2. Cargar **Caso ILY** y revisar manualmente: demanda `10000/año`, pedido `9 USD`, mantenimiento `10% anual`, base de `365 días` y precios `20`, `18`, `15` desde `0`, `250`, `1000` unidades. Presionar **Calcular mejor compra**.
3. Verificar **1000 unidades** y **150,840.00 USD de costo anual**.
4. Cargar **Caso Wohl**: demanda `5000/año`, pedido `49 USD`, mantenimiento `20% anual` y precios `5`, `4.80`, `4.75` desde `0`, `1000`, `2000` unidades. Calcular y comprobar **1000 unidades** y **24,725.00 USD anuales**.
5. Editar un mínimo o un precio inválido para mostrar la validación; corregirlo. Si ya hay resultados, observar el aviso ámbar y su atenuación hasta recalcular.

**Evidencia esperada:** coincidencia de cantidades y costos con los cuatro casos de referencia calculados por la API.

## Paso 2. Explicación de la mejor alternativa

1. Volver a **Caso ILY** y calcular.
2. Diferenciar **15,000.00 USD de desembolso por cada pedido** de **150,840.00 USD de costo total anual**. Este último incluye compra, pedidos y mantenimiento.
3. Mostrar la tabla de alternativas, la fila **Mejor opción** y el gráfico. Pasar el cursor o navegar con teclado para revisar el desglose del tooltip.
4. Abrir **Asistente IA (Texto, Foto y Voz)** y usar **Explícame el resultado** con los datos vigentes. La explicación no modifica el formulario.

**Evidencia esperada:** el usuario puede distinguir una inversión por pedido de un costo anual y relacionar la explicación con el resultado enviado al asistente.

## Paso 3. Cambio de mantenimiento en vivo

1. Cargar **Sensibilidad A (Mant. = 5)** y calcular. Confirmar mantenimiento **fijo por unidad al año**, demanda `2400/año` y base de `360 días`.
2. Comprobar **Q = 500 unidades** y **47,522.00 PEN anuales**.
3. Presionar **Probar Mantenimiento = 10**. El formulario se actualiza y solicita otro análisis.
4. Comprobar **Q = 200 unidades** y **48,520.00 PEN anuales**, como en **Sensibilidad B**.
5. Mostrar **Antes vs. Después** con la compra actual del formulario. Probar también una demanda nueva: todos los cambios se envían al motor real.

**Evidencia esperada:** aumentar el mantenimiento cambia la cantidad recomendada y conserva la correspondencia entre cantidad, precio y costos.

## Paso 4. Fotografía y revisión del borrador

1. En el asistente, elegir **Fotografía** y cargar una fotografía propia o una cotización preparada por el equipo.
2. Mostrar la vista previa y, si hace falta, escribir **Contexto adicional de la foto**. Presionar **Extraer datos de la fotografía**.
3. Señalar que el formulario confirmado conserva sus datos mientras aparece **BORRADOR INTERPRETADO POR IA — REVISA ANTES DE APLICAR**.
4. Revisar moneda, demanda, períodos, mantenimiento y cada precio. Editar un número dentro del borrador; comprobar que todavía no cambió el formulario.
5. Usar **Aplicar datos al formulario y calcular** para confirmar la propuesta; también demostrar que **Descartar propuesta** conserva los datos anteriores.

**Evidencia esperada:** fotografía → propuesta editable → confirmación explícita → cálculo. Requiere credenciales de Gemini y permanece pendiente de validación con el proveedor.

## Paso 5. Voz, edición de la transcripción y aplicación

1. Elegir **Voz** y presionar **Grabar mensaje de voz**. Autorizar el micrófono y comprobar el indicador rojo y el contador de segundos.
2. Dictar: «Vendo 200 unidades al mes. Hacer un pedido cuesta 40 soles y guardar cada unidad cuesta 5 soles al año. Los precios son 20 soles, 19.60 desde 200 unidades y 19.20 desde 500. Uso 360 días al año».
3. Presionar **Detener y transcribir**. El micrófono debe liberarse inmediatamente, antes de esperar la respuesta del servicio.
4. Si no se puede grabar, usar **Subir archivo de audio (.webm, .mp3, .wav, .m4a)**. La aplicación conserva la revisión humana para el audio cargado y no ofrece transcripciones simuladas.
5. En **Revisa o corrige la transcripción antes de enviarla al asistente:** corregir una palabra o un número. Confirmar que recibir la transcripción no envió todavía un mensaje ni modificó el formulario.
6. Presionar **Enviar texto revisado al asistente**. El texto recorre el mismo servicio de mensajes que la pestaña Texto.
7. Revisar el nuevo borrador, corregir los datos necesarios y presionar **Aplicar datos al formulario y calcular**. La demanda `200/mes` equivale a `2400/año` en el caso de referencia.
8. Comprobar también **Cancelar**, el cambio de pestaña y el cierre del asistente: la grabación se detiene y el micrófono queda libre. Un rechazo de permisos o un fallo de transcripción permite reintentar, subir otro audio o continuar manualmente.

**Evidencia esperada:** audio → transcripción editable → envío explícito → borrador revisable → confirmación → análisis. Registrar navegador, formato y proveedor utilizados. La grabación se detiene automáticamente a los 60 segundos.

## Paso 6. Procedimiento matemático y supuestos

1. Abrir **Ver procedimiento matemático, fórmulas y supuestos del modelo**.
2. Explicar los símbolos, la normalización anual de demanda y mantenimiento, y el costo por pedido.
3. Mostrar `Q* = √((2 × D × S) / H)` y `CT(Q) = D·P + (D/Q)·S + (Q/2)·H`, seguidos por la sustitución y los valores del caso.
4. Revisar los supuestos: demanda constante, descuento aplicado a todas las unidades, inventario promedio, reposición sin faltantes y comparación anual con compra incluida.

**Evidencia esperada:** el procedimiento y el resumen pertenecen al mismo análisis. El frontend presenta la respuesta del servicio; no implementa el cálculo oficial de EOQ.

## Registro de cierre de Rubén

- Backend organizado en `apps/api/`, cliente conectado por HTTP y controles de simulación retirados.
- Comprobaciones y evidencia vigentes: [integracion-backend-frontend.md](integracion-backend-frontend.md).
- El recorrido automatizado usa el motor real y captura WebM con el dispositivo de pruebas de Chrome. Esto comprueba el transporte y el manejo de falta de configuración, sin acreditar un micrófono físico ni una transcripción exitosa con Gemini.
- Para aceptar los pasos de IA, registrar respuestas reales del proveedor después de configurar clave/modelo, además de la revisión de Jelibeth y la evidencia de WinQSB cuando esté disponible.
