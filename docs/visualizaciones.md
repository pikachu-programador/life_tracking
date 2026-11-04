---
proyecto: Rastreador de tiempo + modo meta
documento: Visualizaciones
version: 2
actualizado: 2026-11-04
---

# Visualizaciones y métricas

> Amplía §13 de [arquitectura.md](arquitectura.md). Define qué se mide, cómo se calcula y con qué gráfico se muestra. Las tareas `V-xx` de este archivo se suman a [tareas.md](tareas.md).

## 1. Principio: resumen diario primero

Todo período (semana, mes, rango) se calcula **sumando resúmenes diarios**, nunca releyendo eventos crudos.

- `resumirDia(segmentos, plan, checkins, dia)` → un objeto con todas las métricas de un día lógico (§3). Es una función pura del motor.
- `agregarPeriodo(resumenes, desde, hasta)` → totales, promedios, mediana, máximos, rachas y comparación con el período anterior.
- Los resúmenes de días terminados se guardan en caché; hoy siempre se recalcula.

Así una vista de un mes pide 30 resúmenes pequeños, no miles de eventos.

## 2. Períodos y comparaciones

- **Selector de período:** Día · Semana (lunes a domingo) · Mes · Rango personalizado. Flechas para ir al anterior y al siguiente.
- **Comparación:** cada número muestra la diferencia con el período anterior del mismo largo (por ejemplo: "+2 h 10 min frente a la semana pasada").
- **Promedios:** por defecto, **por día con datos**. Un interruptor permite incluir los días sin datos (cuentan como 0). La vista dice siempre cuál se usa.
- **Día de la semana promedio:** promedio de todos los lunes, martes, etc., del período.

## 3. Métricas

| Métrica | Cómo se calcula | Fuente |
|---|---|---|
| Tiempo por clase | Estudio, Distracción, Neutral, IA, Sin clasificar (solo tiempo activo) | Segmentos |
| Tiempo por área | Subcategorías de Estudio (Programación, Matemáticas, Inglés, Humanidades) | Segmentos |
| Tiempo por curso | Estudio dentro de los bloques de ese curso (§9 de la arquitectura); fuera de los bloques solo hay áreas | Segmentos + plan |
| Tiempo por actividad | Cualquier categoría, app, dominio o palabra del título/URL (filtro libre) | Segmentos + eventos web |
| Tiempo activo en la PC | No AFK | AFK |
| AFK | PC encendida sin uso (separando estudio en papel y video sonando) | AFK + plan |
| Sin PC | Sin datos dentro del día lógico | Huecos |
| Horas despierto | Fin − inicio del día lógico | Día lógico |
| **Tiempo en clases** | Clases del plan en ese día, menos excepciones. Si hay check-in de asistencia, solo cuentan las marcadas | Plan + check-ins |
| Estudio en papel | Bloques `estudio_papel` con check-in "hecho" | Plan + check-ins |
| Tiempo de estudio total | Estudio en PC + estudio en papel + (opcional) clases | Todo lo anterior |
| Cumplimiento | §9 de la arquitectura | Motor |
| Puntualidad | Minutos de retraso al empezar cada bloque | Motor |
| Racha | Días seguidos cumpliendo (día cumplido, rutina o meta de un curso) | Resúmenes |
| Cambios de contexto | Cambios de app por hora activa | Segmentos |
| Foco más largo | El tramo continuo de Estudio más largo del día | Segmentos |

**Estadísticos por período:** total, promedio por día, mediana, máximo (con su fecha), mínimo y desviación estándar (para la regularidad de horarios).

**Sueño: fuera de alcance por ahora.** Con los datos de la PC no se distingue dormir de estar lejos de la PC (AFK o PC apagada). No se muestra ninguna métrica de sueño hasta tener una fuente confiable (por ejemplo, check-ins de dormir y despertar bien adoptados).

## 4. Vistas

### 4.1 Hoy (ya definida en §13)
Se le agrega: tiempo en clases de hoy y "estudio total" (PC + papel + clases).

### 4.2 Resumen del período (nueva)
- **Fila de KPIs** con comparación: estudio total, distracción, tiempo en clases, cumplimiento, racha actual.
- **Barras apiladas por día** (clase, área o curso), con línea de meta diaria.
- **Línea de estudio** con media móvil de 7 días.
- **Horas por curso contra su meta,** en barras horizontales con la meta marcada.
- **Calendario mensual** (estilo GitHub), coloreado por cumplimiento o por horas de estudio (a elegir).
- **Día de la semana promedio:** barras lunes a domingo.

### 4.3 Día típico (nueva)
Una franja de 24 h dividida en tramos de 15 min. Cada tramo muestra el estado más frecuente del período: clase, estudio, IA, distracción, neutral, AFK, sin PC. No se etiqueta nada como "dormido". Responde "¿cómo es mi semana o mi mes promedio?". Debajo, la misma franja del plan, para comparar.

### 4.4 Explorador de actividad (nueva)
Eliges cualquier cosa (categoría, app, dominio o palabra) y ves:
- su serie diaria en el período;
- a qué horas del día ocurre (barras 0–23);
- sus URLs y títulos más frecuentes, con tiempo.

Por ejemplo: "YouTube", "Arduino", "inglés" o "instagram.com".

### 4.5 Comparar
Dos períodos lado a lado (semana A contra semana B, este mes contra el anterior) con las mismas métricas y sus diferencias.

### 4.6 Horas del día, Cumplimiento, Simulador, Clasificación y Diario
Siguen como en §13. Todas usan el mismo selector de período.

## 5. Diseño

- **Tres propuestas de estilo** como temas intercambiables (archivos de tokens distintos), mostradas en la página de muestra con datos de ejemplo. Dremy elige una, o mezcla.
- Cada clase y estado tiene **un color fijo en todas las vistas.** Nunca depender solo del color: añadir etiqueta o patrón.
- Modo claro y modo oscuro.
- Todo gráfico tiene un estado vacío ("sin datos en este período"), un estado de carga y un detalle al pasar el mouse.
- Debe verse bien a 1366×768 (laptop) y a 1920×1080.

## 6. Tareas nuevas

| ID | Tarea | Depende de | Dif. | Tamaño |
|---|---|---|---|---|
| V-01 | `resumirDia` y su caché (§1, §3) | F1-05, F2-01, F3-03 | 4 | L |
| V-02 | `agregarPeriodo`: totales, promedios, mediana, desviación estándar, rachas, comparación | V-01 | 3 | M |
| V-03 | Tiempo en clases (plan + check-ins de asistencia) | V-01 | 2 | S |
| V-04 | Selector de período compartido por todas las vistas | F1-01 | 2 | S |
| V-05 | Vista Resumen del período (§4.2) | V-02, V-03, V-04, F1-06 | 3 | L |
| V-06 | Vista Día típico (§4.3) | V-02 | 3 | M |
| V-08 | Explorador de actividad (§4.4) | V-02, F1-06 | 3 | L |
| V-09 | Vista Comparar (§4.5) | V-05 | 2 | M |
| V-10 | Tres temas de estilo y página de muestra (§5) | F1-02 | 2 | M |

**Hecho cuando** (para todas): las cifras de cada vista coinciden con `datos-ejemplo/verdad.json` cuando aplica (`minutos_por_clase_y_area`); hay pruebas del motor; hay capturas de la vista con los datos de ejemplo en modo claro y oscuro.
