# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado del repositorio

Rastreador de tiempo para Windows sobre **ActivityWatch (AW)**: compara el horario planificado con lo que realmente pasó y, durante los bloques de estudio, interviene (aviso, fricción o bloqueo total). Uso personal (Dremy), en español: responde y comenta en español.

- La especificación está en `docs/arquitectura.md` y el plan por fases (F0–F8, con dependencias y "Hecho cuando") en `docs/tareas.md`. `docs/` es un vault de Obsidian.
- Repositorio: `https://github.com/pikachu-programador/life_tracking.git`, rama `master`.
- **Comandos:** no hay build ni lint (el dashboard no tiene paso de build por diseño). Pruebas con el test runner nativo de Node:
  - `npm test`: pruebas del motor (se completan en F1-08).
  - `npm run test:aw`: integración del cliente de AW (`pruebas/integracion/*.integracion.js`) contra el AW real; necesita AW abierto. Crea y borra el bucket `rastreador-prueba_<host>` y escribe el ajuste `rastreador-prueba` (AW no permite borrar ajustes: responde 405).
  - Una sola prueba: `node --test --test-name-pattern="<texto del nombre>" <archivo>`.
  - `node --test` no acepta una carpeta como argumento: usa un patrón como `pruebas/integracion/*.integracion.js`.
- **Entorno:** está en `docs/arquitectura.md` §16. No supongas lo que falte: consulta `GET /info` o pregunta. Las preguntas abiertas están en §17.

## Flujo de trabajo

- Leer `docs/arquitectura.md` antes de cada tarea y respetar la columna "Depende de". Una tarea por vez: proponer un plan corto y esperar el OK (salvo que Dremy diga que no hace falta).
- **Al cerrar cada tarea:** comprobar su "Hecho cuando", marcar su casilla en `docs/tareas.md`, hacer un commit cuyo mensaje empiece con el ID (por ejemplo `F0-01: estructura del repositorio`) y hacer push. Nunca hacer commit de una tarea a medias ni de datos reales de AW. Nunca hacer force push. Lo que no se pueda comprobar sin Dremy (por ejemplo, cómo se ve algo en el navegador) se anota como "por comprobar" en la tarea.
- Después de cada tarea, y cuando Dremy decida algo sobre la arquitectura, avisar a la sesión `documentador`: qué se hizo, cómo se comprobó, el hash del commit, lo que se decidió y lo pendiente. Lo que necesite a Dremy (decisiones o pasos manuales) se le pasa para que lo anote en "Para Dremy".
- En `docs/` solo se tocan `arquitectura.md` y `tareas.md`. `docs/bitacora/` es del documentador. `docs/_por_borrar/` (ignorada en git) la borra Dremy.
- Dremy está aprendiendo HTML/CSS/JS (viene de C++): explicar de forma concisa, paso a paso. No reescribir ni recortar sus comentarios en el código.
- Si algo de la arquitectura no encaja, proponer el cambio y registrarlo en el registro de cambios (§19) de `docs/arquitectura.md`.
- **Privacidad:** no subir al repo datos reales de AW (van en `datos-reales/`, ignorada), tokens ni claves. Tampoco mostrar en la conversación títulos de ventana ni URLs reales: al inspeccionar datos reales, imprimir solo conteos, horas, duraciones o nombres de app. Las pruebas usan `datos-ejemplo/` anonimizado.
- **Config de AW:** copiar el archivo antes de editarlo; si tras reiniciar AW no vuelve a registrar, restaurar la copia.

## Skills

En `.claude/skills/` (copiadas de vercel-labs/agent-browser y emilkowalski/skills, con su `LICENSE`):

- **agent-browser**: verificar el dashboard en el navegador (capturas, clics, consola). Si no se instala (`npm i -g agent-browser && agent-browser install`), usar Playwright.
- **break-ui** y **emil-design-eng**: revisar la UI (datos extremos, detalles y movimiento). Las correcciones usan solo variables de `css/tokens.css`: no agregar colores ni fuentes fuera de ahí, y la paleta y la tipografía finales las decide Dremy.
- **prototype**: solo si Dremy lo pide (no se activa sola).

## Arquitectura (resumen; detalle en `docs/arquitectura.md`)

Cuatro capas: Interfaz (dashboard, páginas de bloqueo, notificaciones) → Ejecutores (agente Node.js, extensión MV3) → **Motor compartido** → Datos (AW en `:5600`).

- **Contratos (§6.7 de `docs/arquitectura.md` y `web/motor/tipos.js`).** Firmas del motor y formas de los datos (instantes en ms, duraciones en segundos, fechas `AAAA-MM-DD`). No se cambian sin actualizar primero ahí; las vistas solo hablan con `web/js/datos.js`.
- **Un solo motor.** `web/motor/` es JS puro (Horario, Clasificador, Día lógico, Cumplimiento, Resumen, Decisor, Simulador) usado tanto por el dashboard (simulación) como por el agente (bloqueo real). Sin DOM, red ni reloj del sistema: "ahora" y los datos entran por parámetros; cada función con pruebas. El `package.json` de la raíz tiene `"type": "module"` para que Node cargue estos archivos como módulos ES; los `import` llevan ruta relativa con extensión `.js` (lo exige el navegador).
- **AW es la única base de datos.** Plan en el ajuste `rastreador-plan`, niveles en `rastreador-niveles`, registros propios en buckets `rastreador-{sesiones,intervenciones,checkins,agente}_<host>` (`client` = `rastreador`). Las simulaciones no se guardan.
- **Dashboard sin frameworks ni build**: HTML/CSS/JS con módulos ES, única librería ECharts (archivo local en `web/lib/`), rutas con `#` (`#/hoy`). Se sirve desde AW en `http://localhost:5600/pages/rastreador/` (sección `custom_static` del config de AW) para compartir origen y evitar CORS. Colores y tipografía solo desde las variables de `css/tokens.css` (los temas de V-10 redefinen esas mismas variables); la paleta y la tipografía las decide Dremy (F1-02), no inventes el estilo final (si hace falta una provisional, márcala como tal).
- **Agente** (`agente/`, Node.js, arranca con Windows): importa `web/motor/`, lee la ventana activa directo de Windows (AW se retrasa ~10 s), API en `127.0.0.1:5650` con CORS solo para `http://localhost:5600`, `http://127.0.0.1:5600` y la extensión.
- **Extensión** (`extension/`, MV3): pregunta al agente en cada navegación (le pasa URL y título) y le manda un latido cada 30 s; nunca bloquea `localhost:5600` ni `127.0.0.1:5600`; si el agente no responde, mantiene la última decisión.

## Reglas de dominio que cruzan varios módulos

- La distracción solo es fallo **dentro de un bloque**; en tiempo libre solo se mide.
- Clasificación: las categorías de AW son la fuente única (primer nivel = clase: Estudio/Distracción/Neutral/IA/Sin clasificar). Estudio se divide por **áreas** estables (Programación, Matemáticas, Inglés, Humanidades), no por cursos: los cursos viven en el plan y apuntan a un área. IA (prioridad 30, gana siempre) se mide aparte: no cuenta como foco y no se bloquea. Cada regex se prueba contra **todos los campos de texto** de `data` (app, título y, en eventos web, URL), salvo que la regla traiga `select_keys`. Gana la regla de mayor rango (prioridad, o profundidad × 10; en empate, la posterior).
- El dashboard muestra las URLs completas (detalle de la línea de tiempo y más usados por dominio); son datos locales que nunca salen de la PC.
- **Día lógico** = de despertar a dormir (no 00:00–00:00); zona America/Lima. La actividad de la 1:00 a. m. cuenta para el día anterior. Un bloque del plan que empieza antes de `startOfDay` (04:00) ocurre en la madrugada siguiente.
- Cumplimiento: foco = minutos de Estudio ÷ duración del bloque (IA no cuenta); horas por curso = Estudio dentro de los bloques de ese curso, y fuera de los bloques solo por área; umbrales iniciales 70 % cumplido / 40 % parcial, tolerancia 10 min; % del día ponderado por duración (1 / 0,5 / 0). Las clases no cuentan para el %.
- Niveles: endurecer es inmediato, aflojar queda pendiente hasta el siguiente día lógico (se guarda con `aplica_desde` y el motor calcula lo vigente); 3 avisos en un bloque de estudio escalan a fricción (en las clases no hay escalamiento: siempre aviso). En aviso y fricción se bloquea la clase Distracción más los patrones de URL extra; en total, además, lo Sin clasificar. Nunca se bloquea ni se cierra el dashboard, las páginas de bloqueo, el agente, AW, los procesos del sistema ni lo de `nunca_bloquear`, y la salida de emergencia tiene que funcionar siempre.
- El simulador y el agente llaman al mismo Decisor: el mismo día con el mismo nivel debe dar las mismas intervenciones (F7-07 lo verifica).

## Notas sobre ActivityWatch

- **Regex en consultas:** `JSON.stringify` duplica las barras invertidas, pero el lenguaje de consultas de AW espera una sola; usar `aTextoDeConsulta()` de `web/js/consultas.js` (igual que aw-webui). Sin eso, reglas como `warp\.exe$` nunca coinciden.
- La consulta canónica (`web/js/consultas.js`) replica la vista Actividad de AW: ventana ∩ no AFK, pestañas con audio cuentan como actividad, buckets web del hostname (o "unknown" si no hay).
- Heartbeats exigen `pulsetime`; AW v0.14 cachea consultas de días terminados (pedir día por día).
- Hay dos servidores posibles (Python clásico o Rust/Tauri) con archivos de config distintos; `GET /info` indica cuál (versión terminada en "(rust)"). Reiniciar AW tras editar la config. Tabla completa en `docs/arquitectura.md` §14.
- Con el servidor Python, el tipo MIME de `.js` sale del registro de Windows; si es `text/plain`, los módulos ES no cargan (§14).
- Referencias del código fuente de AW para consultas/categorización: `aw-webui/src/queries.ts` (`canonicalEvents`) y `aw-server-rust/aw-transform/src/classify.rs`.
