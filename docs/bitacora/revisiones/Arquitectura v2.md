---
tipo: revision
version: 2
commit: 881f8cc
fecha: 2026-11-01
tags: [revision, arquitectura]
---
# Arquitectura v2

Incluida en el commit de [[F0-01]].

- Regex de AW contra todos los campos de texto de `data`; el dashboard muestra la URL completa (§7, §13, F2-03, F2-07).
- Bloques previos a `startOfDay` (04:00) caen en la madrugada siguiente (§8).
- Cambios de nivel pendientes con `aplica_desde` (§11, F4-04). Ver [[Umbrales y niveles]].
- Latido de la extensión cada 30 s; 1 min sin latido = "sin extensión" (§6.4, §11, F7-03).
- CORS y "nunca bloquear" incluyen `localhost:5600` y `127.0.0.1:5600`.
- `datos-reales/` ignorada en git (§15). Ver [[Organización del repositorio]].
- Riesgo MIME de `.js` → probado en [[F0-05]].

Siguiente: [[Arquitectura v3]] · [[00 Índice]] · [[arquitectura]]
