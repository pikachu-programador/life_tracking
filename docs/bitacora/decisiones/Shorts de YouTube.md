---
tipo: decision
tema: clasificacion
fecha: 2026-11-10
tags: [decision, clasificacion]
---
# Shorts de YouTube

- **Decisión de Dremy (2026-11-10):** los Shorts de YouTube son Distracción, con una regla de URL `youtube\.com/shorts/` (`Distracción > Video > Shorts`).
- Solo en el repo y en los datos de ejemplo (`datos-ejemplo/clases-ejemplo.json`); **Dremy carga sus reglas reales en AW**.
- Para que una regla de URL cuente, `segmentar` vuelve a categorizar con app, título y URL los segmentos de navegador (`datos.js` le pasa las reglas). Por eso los totales del dashboard pueden diferir de la vista Actividad de AW en eso (arquitectura §6.7 y §7, v6.3).
- El resto de YouTube sigue en Neutral ([[Categorías v3]]); la IA sigue ganando siempre.
- Commit: `986f6ec`.

Ver: [[Categorías v3]] · [[F1-05]] · [[F2-07]]
