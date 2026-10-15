# SIOP: propuesta de rediseño interactivo

Estado: investigación y conceptos para evaluación. No se ha modificado la interfaz de producción. Investigación consultada el 14 de octubre de 2026, hora de Lima.

## 1. Objetivo y alcance

Convertir la calculadora actual en una aplicación de decisión de compra: configurar con menos desplazamiento, entender la recomendación y explorar alternativas sin perder contexto. La prioridad expresada por el usuario es una experiencia más interactiva y dinámica.

El entregable de esta etapa es una propuesta evaluable, con tres conceptos navegables y una matriz de calificación. Las mejoras de tiempo o desplazamiento descritas abajo son objetivos por validar, no resultados medidos.

Se conservarán RF-01 a RF-10, el contrato y el cliente API. El motor del backend continuará siendo la fuente de cálculo. Este rediseño no incorpora cuentas, almacenamiento de escenarios, exportación, nuevos modelos matemáticos ni comparación de proveedores.

## 2. Diagnóstico del estado actual

La revisión se basa en README.md, CONTEXTO_AGENTE_RUBEN.md, las reglas frontend y el código de App, InventoryForm, resultados y asistente. Es una auditoría de estructura e interacción; no sustituye una prueba de uso ni una inspección visual con capturas del navegador.

| Hallazgo en el código | Consecuencia probable | Cambio propuesto |
| --- | --- | --- |
| Formulario largo con varios bloques abiertos y acción al final | Recorrer muchos campos para modificar un único parámetro | Inspector por grupos con acción persistente y resumen de los otros grupos |
| Demanda y mantenimiento aparecen en formulario y sensibilidad | Dudas sobre dónde editar y qué dato está vigente | Un único editor por campo; los accesos rápidos llevan a ese editor |
| Tabla y gráfico se muestran simultáneamente | Compiten por atención y alargan la página | Vistas alternables de la misma comparación |
| Tabla de resultados con ancho mínimo de 1400 px dentro de una columna | Desplazamiento horizontal y lectura fragmentada | Tabla en área principal, pocas columnas esenciales y detalle expandible |
| Tabla de precios con ancho mínimo de 590 px | Dificultad para editar en móvil o columna estrecha | Filas compactas en escritorio y pares cantidad/precio apilados en móvil |
| Apertura del asistente añade una columna de 460 px | Reduce el espacio de formulario y resultados | Reutilizar el área del inspector o disponer una vista secundaria según el ancho |
| Muchas tarjetas, etiquetas y controles tienen énfasis parecido | La recomendación pierde protagonismo | Jerarquía explícita: decisión, evidencia y configuración |
| Selector técnico y distintivo repiten el modo | Ocupan espacio del encabezado | Un selector compacto con texto visible «Demo» o «Motor real» |

Antes de implementar, medir el recorrido actual a 1366 × 768 y 390 × 844: distancia desplazada, acciones necesarias, errores y tiempo para cambiar mantenimiento. Guardar esos valores como línea base.

## 3. Investigación aplicada

Se consultaron fuentes originales de investigación UX, sistemas de diseño, accesibilidad y un caso oficial de producto. Las decisiones particulares para SIOP son inferencias de diseño y deberán comprobarse con el prototipo.

| Fuente | Qué aporta | Aplicación propuesta a SIOP |
| --- | --- | --- |
| [NN/g: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Presentar lo frecuente primero; advierte del exceso de niveles y de separar opciones interdependientes en pasos | Detalles secundarios bajo demanda. Mantener cerca configuración y resultado cuando se prueban cambios repetidos |
| [NN/g: Visual Hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/) | La escala, el contraste y la agrupación orientan la atención | Cantidad recomendada como ancla visual; inversión por pedido y costo anual con etiquetas propias |
| [NN/g: Accordions on Desktop](https://www.nngroup.com/articles/accordions-on-desktop/) | El contenido oculto añade costo de interacción | Reservar acordeones para procedimiento y detalle; no ocultar todo el formulario en acordeones anidados |
| [NN/g: Wizards](https://www.nngroup.com/articles/wizards/) | Los recorridos guiados ayudan a tareas iniciales, pero pueden dificultar ediciones frecuentes | Evaluar una ruta guiada como alternativa; no imponerla para cada simulación |
| [USWDS: Progress easily](https://designsystem.digital.gov/patterns/complete-a-complex-form/progress-easily/) | Grupos significativos, progreso comprensible y recuperación de errores | Organizar datos por tarea; conservar valores al navegar y llevar al error correspondiente |
| [IBM Carbon: Data table](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines) | Tablas con espacio adecuado y expansión de información secundaria | Comparación en el área principal, cuatro o cinco columnas y desglose al expandir una alternativa |
| [IBM Carbon: Motion choreography](https://www.carbondesignsystem.com/building-blocks/foundations/motion/choreography) | Movimiento coherente para mantener orientación | Transiciones cortas al abrir edición y al cambiar de vista; retroalimentación del cambio de estado |
| [Linear: A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh) | Caso de reducción del ruido acumulado y ubicación consistente de acciones | Menos bordes, iconos y distintivos; controles estables. Referencia de proceso, no prueba de mejora para SIOP |
| [Microsoft HAX: Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/) | Orientación sobre expectativas, errores y control en sistemas con IA | Propuestas identificadas, corrección y descarte visibles, continuidad del uso manual |
| [W3C: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | Reorganización del contenido a 320 píxeles CSS y al ampliar | Pasar a una columna; evitar desplazamiento horizontal de la página |
| [W3C: Contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | Contraste de texto normal 4.5:1 y grande 3:1 | Verificar colores sobre su superficie real, incluidos avisos y estados pendientes |
| [W3C: Target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) | Objetivos de 24 × 24 px o espaciado suficiente, con excepciones | Adoptar 44 px como objetivo propio para controles táctiles; no confundirlo con el mínimo AA |
| [W3C: Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum) | Las barras y paneles no deben ocultar el foco | Reservar espacio para acciones persistentes y comprobar navegación con teclado |
| [W3C: Animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions) | Permitir desactivar movimiento no esencial; criterio AAA | Respetar prefers-reduced-motion como decisión del proyecto |

La síntesis para este producto: una aplicación puede sentirse dinámica porque responde con claridad al usuario, aunque tenga pocos controles visibles. El efecto deseado surge de editar, comparar, revisar y confirmar sin perder la referencia del análisis.

## 4. Lluvia de ideas

| Idea | Interacción concreta | Prioridad / cautela |
| --- | --- | --- |
| Mesa de decisión | Inspector compacto a la izquierda y recomendación a la derecha | Concepto principal para uso frecuente |
| Recorrido guiado | Datos → precios → decisión, con pasos reversibles | Concepto para principiantes y demostración |
| Lienzo de tramos | Seleccionar cantidades candidatas sobre una secuencia de precios | Concepto más distintivo, ligado al dominio |
| Edición contextual | Pulsar «Editar mantenimiento» abre el campo exacto | Alta; evita un segundo editor del mismo dato |
| Comparador seleccionable | Elegir una alternativa cambia su detalle sin alterar la recomendación oficial | Alta; diferenciar selección de recomendación |
| Tabla / gráfico | Cambiar la representación en el mismo espacio | Alta; conserva ambas funciones sin duplicar altura |
| Resumen de configuración | Mostrar «2400 al año · mantenimiento fijo 5/año» con acceso a editar | Alta; mantener visibles período y base de cálculo |
| Revisión IA por diferencias | Resaltar los campos propuestos y editarlos antes de aplicar | Alta; nunca aplicar al recibir la respuesta |
| Precio como escalera | Representar los umbrales y el precio de cada tramo | Media; rangos legibles, sin sugerir escala proporcional si no la tiene |
| Transición de resultado | Señalar qué recomendación cambió después de una respuesta válida | Media; no inventar cálculos intermedios |
| Atajos de teclado | Accesos opcionales para calcular y abrir ayuda | Posterior a validar la navegación básica; nunca depender de ellos |
| Deslizadores de demanda | Exploración rápida con entrada numérica precisa alternativa | Baja: pueden dificultar precisión y dar falsa continuidad a los mocks |

Para esta ronda se descartan animaciones de entrada en cada tarjeta, fondos en movimiento, gráficos 3D y controles decorativos. No aportan a configurar o comprender la compra y añaden trabajo visual.

## 5. Tres conceptos para calificar

### Mesa de decisión

Sensación: herramienta de trabajo ágil. Un inspector reúne Ventas, Costos y Precios. Se puede cambiar de grupo libremente. La decisión mantiene una ubicación estable; el asistente utiliza el mismo espacio lateral cuando se solicita.

```text
SIOP       Caso de referencia                     Demo
┌─────────────────────┬──────────────────────────────────┐
│ Datos | Asistente   │ Comprar 1000 unidades             │
│ Ventas Costos Precios│ 15 000 por pedido · 150 840/año   │
│                     │                                  │
│ Campos del grupo    │ Resumen | Alternativas | Detalle │
│ Resumen del resto   │ Evidencia de la decisión         │
│ Calcular            │ Procedimiento bajo demanda       │
└─────────────────────┴──────────────────────────────────┘
```

Lo dinámico: edición sin abandonar el resultado, cambio tabla/gráfico, propuesta IA revisable, estado pendiente inmediato. En el concepto navegable se pueden cambiar casos, grupos de datos y revisar una propuesta de ejemplo.

Riesgo: demasiadas pestañas anidadas. Mitigación: máximo dos niveles con nombres estables, navegación por botones clara y resumen persistente del contexto. Validar si «Comparar» y «Procedimiento» funcionan mejor como acciones locales.

### Recorrido guiado

Sensación: una aplicación que acompaña a resolver el ejercicio. Tres etapas breves con avance visible y posibilidad de volver. El resumen del ejercicio permanece a un lado en escritorio.

```text
SIOP                                     Demo
       Datos ───── Precios ───── Decisión
┌────────────────────────────┬─────────────────┐
│ Preguntas de la etapa      │ Ejercicio       │
│                            │ Demanda y base  │
│ Campos y ayuda contextual  │ Costos          │
│ Volver          Continuar  │ 3 tramos        │
└────────────────────────────┴─────────────────┘
```

Lo dinámico: avance reversible, validación por etapa, revisión final antes de calcular. En el concepto se navegan las tres etapas y se modifica el mantenimiento entre los dos casos de sensibilidad.

Riesgo: navegar repetidamente para ajustar una variable. Mitigación: al llegar al resultado, «Editar mantenimiento» permite volver directamente al campo; no obliga a reiniciar el recorrido. La preferencia por este concepto requiere comprobar tareas de primer uso frente a uso repetido.

### Lienzo interactivo

Sensación: explorar una decisión de compra de forma visual. Los candidatos se muestran asociados a sus tramos. Al seleccionar uno se ve su inversión y costo anual; la recomendación conserva su distintivo.

```text
SIOP      Demanda 2400/año       Mantenimiento 5/año
┌──────────────────────────────────────────────────────┐
│ Hasta 199          Desde 200          Desde 500      │
│ Precio 20          Precio 19.60        Precio 19.20   │
│ Candidato 196      Candidato 200       Candidato 500 │
└──────────────────────────────────────────────────────┘
       Alternativa seleccionada y desglose anual
       Cambiar mantenimiento     Ver procedimiento
```

Lo dinámico: explorar candidatos y observar qué cambia entre Sensibilidad A y B con respuestas de referencia. La representación es una secuencia de tramos, no una curva continua ni un nuevo motor matemático.

Riesgo: confundir «seleccionada» con «recomendada» o creer que arrastrar produce cálculos instantáneos. Mitigación: términos explícitos, selección discreta de candidatos calculados, etiqueta de resultado pendiente al editar y recálculo por API.

## 6. Recomendación provisional

Priorizar Mesa de decisión como estructura y probar la exploración de tramos de Lienzo interactivo dentro de la vista Comparar. Esa combinación se ajusta a los dos problemas expresados: demasiados elementos simultáneos y demasiada distancia para configurar.

Es una hipótesis de diseño basada en que SIOP necesita alternar frecuentemente entre parámetros y resultados. No se han recogido todavía puntuaciones ni tiempos de usuarios. El recorrido guiado puede ganar si las pruebas muestran que el público necesita más acompañamiento que velocidad de edición.

No se propone implementar los tres modos completos: se elige una estructura principal después de esta evaluación.

## 7. Dirección visual inicial

Paleta base para evaluar: superficie #F7F9FC, panel #FFFFFF, texto #172B40, acción #2455DB, recomendación #087B62 y revisión #A45A00. En oscuro se usarán equivalentes específicos de superficie y contraste, no inversión automática de colores.

Tipografía: Inter para interfaz; JetBrains Mono para valores y fórmulas. Cuerpo 16 px, apoyo esencial al menos 14 px, cifra principal 40–48 px en escritorio y menor en móvil. Cifras alineadas a la derecha en tablas, texto a la izquierda. No convertir todas las etiquetas en monoespaciado ni mayúsculas.

Espaciado sobre base de 4 px; controles de altura coherente; radios 8–12 px para controles y 12–16 px en contenedores cuando ayuden a agrupar. Evitar una tarjeta individual para cada campo. La decisión y la escalera de precios serán los elementos distintivos del producto.

Estas medidas son tokens propuestos, no normas universales. Las reglas visuales previas de SIOP se ajustarán durante la implementación al rediseño elegido; se conservan sus restricciones de dominio, revisión humana y visibilidad del modo.

Movimiento propuesto: 120–180 ms para selección y 180–240 ms para transición de panel, sujeto a pruebas. Respetar reducción de movimiento. Mantener controles estables, no desplazar el foco con cada actualización y no animar cifras hacia valores que la API no ha devuelto.

## 8. Comportamiento que debe quedar especificado

| Área | Comportamiento requerido |
| --- | --- |
| Edición | Un estado canónico de formulario; conservar campos al cambiar de grupo; evitar dos editores simultáneos del mismo dato |
| Validación | Errores junto a campos; indicador en grupos con errores; al calcular, abrir el grupo inválido y enfocar el primer error |
| Resultado pendiente | Marcar que el análisis corresponde a los datos anteriores; mantener texto legible; bloquear explicaciones que aparenten usar datos nuevos |
| Recálculo | Actualizar decisión y comparación con la misma respuesta; descartar respuestas antiguas si las solicitudes se cruzan |
| Comparación | Separar cantidad recomendada, inversión por pedido y costo anual; seleccionar una alternativa nunca cambia cuál es la recomendada |
| Tabla | Cuatro o cinco columnas principales; compra, pedidos y mantenimiento en detalle expandible; vista amplia cuando se requiera |
| Gráfico | Comparar costos anuales de candidatos devueltos; valores y unidades explícitos; no sustituir todos los datos por color o hover |
| Asistente | Texto, fotografía y voz disponibles; propuesta editable con aplicar/descartar; el error del proveedor no deshabilita la calculadora |
| Voz | Revisión de transcripción antes de enviar; flujo de interpretación compartido; detener tracks al parar, cancelar y desmontar |
| Modo | «Demo / datos simulados» o «Motor real» siempre identificable; no presentar fixtures como cálculo real |
| Ajustes | Días por año y moneda con acceso claro; período de demanda y base del mantenimiento siempre explícitos |

En móvil el inspector y el análisis se convierten en vistas de una columna con navegación clara. Si se utiliza panel modal, incluir gestión de foco, cierre y retorno al disparador. En escritorio la ayuda no debe generar tres columnas estrechas. Con muchos tramos se admite desplazamiento del contenido; no se promete eliminar todo el scroll a cualquier zoom o cantidad de datos.

## 9. Flujo de ejecución

| Fase | Entrega concreta | Condición para avanzar |
| --- | --- | --- |
| Investigación y estructura | Este documento y tres conceptos interactivos | Calificación de alternativas y elección de estructura |
| Diseño detallado | Pantallas escritorio y móvil: vacío, resultado, pendiente, error, borrador IA y voz | Recorrido completo y jerarquía comprensibles |
| Primera implementación | Estructura principal + edición de mantenimiento + recomendación + comparación | Cambio de parámetro funciona de extremo a extremo |
| Migración de funciones | Resto del formulario, precios, procedimiento y asistente | RF-01 a RF-10 conservados |
| Verificación y acabado | Pruebas, revisión de teclado/zoom/móvil y comparación contra línea base | Metas de uso y regresión satisfechas |

Los cambios de producción se concentrarán en App, InventoryForm, componentes de resultados, AssistantPanel y estilos dentro de apps/web. Mantener api-client, contratos y fixtures salvo que una necesidad funcional real lo justifique. Reutilizar React Hook Form, Zod, Recharts y los iconos actuales; no añadir un framework visual para resolver esta etapa.

## 10. Cómo calificar los diseños

Probar las mismas tareas en cada concepto: localizar la compra recomendada, distinguir inversión de costo anual, encontrar mantenimiento, comparar un candidato y revisar una propuesta antes de aplicarla. Los conceptos son selectivos: muestran las interacciones diferenciadoras, no reemplazan todas las funciones de la aplicación.

| Criterio | Peso | Qué observar | Mesa | Guiado | Lienzo |
| --- | ---: | --- | --- | --- | --- |
| Menos saturación y desplazamiento | 25 % | Los campos y la decisión se localizan sin recorrer bloques irrelevantes | /5 | /5 | /5 |
| Interacción útil | 20 % | Cambiar, comparar y volver resulta evidente | /5 | /5 | /5 |
| Atractivo y personalidad | 20 % | Se siente profesional y propio de una herramienta de compra | /5 | /5 | /5 |
| Claridad financiera | 15 % | Se entienden cantidad, inversión por pedido y costo anual | /5 | /5 | /5 |
| Adaptación móvil | 10 % | Controles y lectura funcionan sin apretar la pantalla | /5 | /5 | /5 |
| Confianza y accesibilidad | 10 % | Estados, revisión, foco y contraste comprensibles | /5 | /5 | /5 |

Escala: 1 deficiente, 2 débil, 3 aceptable, 4 bueno y 5 excelente. Puntuación total = suma de (nota / 5 × peso). Umbral sugerido: 80/100 y ningún criterio esencial por debajo de 3. El umbral es una regla de decisión propuesta; no una validación estadística.

## 11. Metas verificables al implementar

- Medir y buscar al menos 40 % menos desplazamiento para configurar el caso típico de tres tramos frente a la línea base. Si el prototipo no mejora, corregir estructura antes del acabado.
- En escritorio de 1366 × 768, mostrar recomendación y acción de cálculo en la vista inicial del caso típico, sin reducir la legibilidad para lograrlo.
- Llegar al editor de mantenimiento en una o dos acciones desde el resultado; no volver a completar pasos anteriores.
- En una ronda cualitativa propuesta de cinco personas, observar si al menos cuatro localizan recomendación, inversión y costo anual en diez segundos. Es una señal de diseño, no garantía sobre toda la población.
- Comprobar 320 px CSS, 390 × 844, 1024 × 768, 1366 × 768 y 1440 × 900; zoom hasta 400 %, foco visible y ausencia de desbordamiento horizontal de la página.
- Conservar ILY: 1000 unidades y 150840/año; Wohl: 1000 y 24725/año; Sensibilidad A: H=5, 500 unidades; Sensibilidad B: H=10, 200 unidades.
- Conservar la equivalencia 200/mes = 2400/año y la comparación con cantidad actual.
- Probar error de IA recuperable, descarte de borrador, edición antes de aplicar y liberación del micrófono.
- Ejecutar npm run test y npm run build al modificar producción; adaptar las pruebas existentes y añadir pruebas de navegación, foco y estados que realmente cubran el rediseño.

## 12. Límites de esta entrega

Los conceptos navegables usan únicamente resultados precalculados de los casos de referencia. No calculan EOQ, no llaman a servicios ni graban audio. Se han preparado para comparar distribución e interacción. Las entradas disponibles en cada concepto están deliberadamente limitadas a esos ejemplos; la edición completa se diseñará tras seleccionar el enfoque.

Pendiente antes de dar por aceptado el rediseño: revisión visual en navegador de escritorio y móvil, contraste medido de tokens finales, pruebas con usuarios y regresión del frontend implementado. Ninguno de esos resultados se presenta como ya obtenido.

Verificación de los conceptos: ejecución en JSDOM sin errores de JavaScript; comprobación de cambio de casos, estado pendiente, vistas de resultados, descarte y aplicación explícita del borrador, navegación del recorrido y selección de candidatos. No equivale a una verificación visual de navegador. No se ejecutó un nuevo build porque esta entrega no modifica código de producción.
