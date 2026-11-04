---
tipo: decision
tema: repositorio
fecha: 2026-11-01
tags: [decision, repositorio]
---
# Organización del repositorio

- `arquitectura.md` y `tareas.md` viven en `docs/`; `aa.md` y `Sin nombre/` van a `docs/_por_borrar/` (ignorada en git) y Dremy los borra.
- `package.json` en la raíz (`"type": "module"`, `test` = `node --test`).
- `datos-reales/` ignorada en git; `CLAUDE.md` con regla de commit + push por tarea, sin force push, sin datos reales.
- Autorizó a @trabajador a avanzar sin esperar su OK (Fases 0 y 1).

Ver: [[F0-01]] · [[Arquitectura v2]] · [[Datos reales anonimizados]]
