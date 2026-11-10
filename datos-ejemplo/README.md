# datos-ejemplo

Datos **inventados** de ActivityWatch para las pruebas del motor y para el modo ejemplo del dashboard.
Imitan el ritmo de una exportación real (madrugadas, cambios de ventana cada pocos segundos, ~20 % de eventos de duración 0), pero todos los títulos y URLs son ficticios. Sí son reales los nombres de apps de Windows y de sitios grandes (`chrome.exe`, `youtube.com`, etc.).

- Host: `ejemplo` · Zona: America/Lima (UTC−5) · Fechas: lunes 5 a domingo 18 de octubre de 2026.
- Se regeneran idénticos con `node datos-ejemplo/generar.mjs` (semilla fija).

## Archivos

| Archivo | Qué es |
|---|---|
| `aw-bucket-export-aw-watcher-window_ejemplo.json` | Ventanas: `app` y `title` (mismo formato que "Export bucket" de AW) |
| `aw-bucket-export-aw-watcher-web-chrome_ejemplo.json` | Pestañas de Chrome: `url`, `title`, `audible`, `incognito`, `tabCount` |
| `aw-bucket-export-aw-watcher-afk_ejemplo.json` | `afk` / `not-afk` |
| `rastreador-checkins_ejemplo.json` | Check-ins de ejemplo (formato §12) |
| `clases-ejemplo.json` | Reglas de categorías de ejemplo (formato del ajuste `classes` de AW, taxonomía v3); las usa el AW falso (H-01). Los Shorts de YouTube son `Distracción > Video > Shorts` por una regla de URL (`youtube\.com/shorts/`, decisión de Dremy del 2026-11-10): solo coincide donde hay URL (segmentos del dashboard y el agente), no en los eventos de ventana |
| `plan-ejemplo.json` | Plan de clases, rutinas, bloques y excepciones que coincide con estos días (campos §8) |
| `verdad.json` | La "respuesta correcta" de cada día: segmentos, casos y minutos por intención real |
| `generar.mjs` | El generador |

En `verdad.json` hay dos vistas de lo que **de verdad** se hizo cada día:

- `minutos_por_intencion`: por curso (por ejemplo, un tutorial de Spring en YouTube cuenta como `Estudio/DBP`).
- `minutos_por_clase_y_area`: lo mismo con la taxonomía de la arquitectura v3 (Estudio por **áreas**, clase **IA** aparte, Obsidian en Neutral). Cursos → áreas: BD I, DBP, Prog III y PI2 → Programación; Estadística y EDO → Matemáticas; Inglés → Inglés.

Sirven para medir qué tan bien clasifican las reglas, no para copiar lo que las reglas devuelven. Los modos `(afk)`, `(papel)` y `(video)` son tramos sin teclado; en la vista por área, papel y video aparecen como `Estudio (sin teclado)`.

## Casos por día

| Fecha | Día | Casos |
|---|---|---|
| 10-05 | lun | Día casi perfecto |
| 10-06 | mar | Día malo; bloque que cruza la medianoche (23:30–00:30); trasnoche hasta las 3 |
| 10-07 | mié | Trasnoche hasta las 2:30 (pertenece al miércoles); EDO en papel cumplido |
| 10-08 | jue | Feriado (excepción del plan): mucha distracción en tiempo libre, que no es fallo |
| 10-09 | vie | Huecos sin PC; EDO en papel cumplido |
| 10-10 | sáb | YouTube de estudio contra entretenimiento; clase grabada sonando 90 min sin teclado (AFK pero `audible`) |
| 10-11 | dom | Sin bloques; PI2 fuera de horario; 15 min en incógnito |
| 10-12 | lun | Bloque de BD I empieza 20 min tarde, con buen foco |
| 10-13 | mar | Sin datos: ningún evento en todo el día |
| 10-14 | mié | Día bueno |
| 10-15 | jue | Eventos raros: duración 0, marcas de tiempo repetidas, títulos con símbolos de regex |
| 10-16 | vie | EDO en papel con 20 min de redes en medio |
| 10-17 | sáb | Examen de BD I en nivel total (14:00–17:00) |
| 10-18 | dom | Activo hasta las 4:30, después del inicio de día de AW (04:00), sin hueco de 3 h |

Detalles: Edge (`msedge.exe`) aparece sin extensión, así que solo tiene eventos de ventana. Durante el estudio en papel, la PC queda encendida con la guía abierta y en AFK.
