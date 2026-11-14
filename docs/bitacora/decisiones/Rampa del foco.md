---
tipo: decision
tema: cumplimiento
fecha: 2026-11-14
tags: [decision, cumplimiento]
---
# Rampa del foco

- **Propuesta de Dremy (2026-11-14):** el umbral de foco debe subir con los días para formar el hábito.
- El foco para "cumplido" empieza en un valor inicial y sube un paso cada 7 días hasta una meta. Por defecto: 40 % → 70 %, +4 puntos por semana (llega en 8 semanas).
- **No retrocede si fallo:** solo depende de la fecha. **Cada día se evalúa con el umbral de su fecha.**
- En el plan: `umbrales.rampas_foco`, una lista de versiones `{aplica_desde, rampa: {inicio, valor_inicial, meta, paso_por_semana}}` (así cambiarla no reescribe el pasado). Motor: `web/motor/rampa.js` (`umbralFoco(umbrales, fecha)`), 13 pruebas.
- Se configura en Ajustes: pedir más foco vale hoy; pedir menos espera a mañana.
- **Foco fijo (2026-11-14, pedido de Dremy):** bajar "Foco para cumplido" en Ajustes también espera al día siguiente; subirlo vale en el acto. Versiones en `umbrales.focos_cumplido` (`proponerFocoCumplido`), arquitectura v6.5.
- **Viene desactivada:** hasta activarla vale el 70 % fijo. Arquitectura v6.4 (§6.7, §8, §9, §19). Commit: `dc3708d`.

Ver: [[Umbrales y niveles]] · [[F4-09]] · [[V-01]] · [[2026-11-14]]
