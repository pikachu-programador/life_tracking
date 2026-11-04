// Prueba contra la verdad (H-01, paso 3): ¿qué tan bien clasifican las reglas de ejemplo
// (datos-ejemplo/clases-ejemplo.json) los eventos de ejemplo?
//
// Se clasifican los eventos como los da la consulta canónica (ventana ∩ no AFK, con el AW falso: ver
// pruebas/ayudantes/dia-ejemplo.js) y se comparan, día por día, los minutos por clase y área con
// `minutos_por_clase_y_area` de datos-ejemplo/verdad.json.
//
// Cómo se compara:
//   - verdad.json agrupa por el día del GENERADOR, que puede pasar de las 24:00 (el 10-18 llega a las 04:30
//     del 19). Por eso cada evento se reparte entre los tramos "act" (uso con teclado) de cada día de verdad.
//     Así tampoco se cuentan los tramos sin teclado ("(afk)" y "Estudio (sin teclado)": modos afk, papel y
//     video), que verdad.json registra aparte.
//   - Claves: en Estudio, por área ("Estudio/Programación"); Distracción y Neutral, solo por clase; IA y
//     Sin clasificar tal cual.
//   - % correcto = Σ por clave min(nuestros, verdad) ÷ total de verdad.
//
// Diferencias EXPLICADAS (se miden aparte y se muestran; no se esconden):
//   1. YouTube de entretenimiento. verdad.json registra la intención y cuenta "Reacción al final de
//      temporada", "Top 10 combos imposibles" y los Shorts como Distracción/Video. Pero la decisión v3 de
//      Dremy (arquitectura §7) pone YouTube en Neutral (se usa para todo); solo un video con palabras de un
//      área cuenta como Estudio. Ese tiempo sale Neutral a propósito.
//   2. VS Code con un título raro. El día de "eventos raros" (10-15) el generador abre en Code.exe un título
//      lleno de símbolos de regex ("a+b*(c?) ^raro$ .|\ - Visual Studio Code") y lo anota como Sin clasificar:
//      solo sirve para probar que los símbolos no rompen nada. Las reglas, como las escribiría una persona,
//      cuentan cualquier ventana de VS Code (Code.exe) como Programación.
// Lo que queda después de descontarlas es redondeo: verdad.json redondea cada intención al minuto.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilarReglas, categorizar } from '../web/motor/clasificador.js';
import { datosDiaEjemplo, clasesEjemplo } from './ayudantes/dia-ejemplo.js';
import { verdadEjemplo, FECHAS_EJEMPLO } from './ayudantes/ejemplo.js';
import { sumarDias } from '../web/motor/fechas.js';

const META = 0.95;
const MS_MIN = 60 * 1000;

/** Títulos de YouTube de entretenimiento del catálogo de datos-ejemplo/generar.mjs ("Distracción/Video"). */
const YOUTUBE_ENTRETENIMIENTO = new Set([
  'Reacción al final de temporada - YouTube - Google Chrome',
  'Top 10 combos imposibles - YouTube - Google Chrome',
  'Shorts - YouTube - Google Chrome',
]);
/** El título raro de VS Code (RAROS de generar.mjs), con intención "Sin clasificar". */
const VSCODE_RARO = 'a+b*(c?) ^raro$ .|\\ - Visual Studio Code';

/** Hora del generador ("25:30" = 01:30 del día siguiente) → ms. Lima = UTC−5. */
function instanteVerdad(fecha, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return Date.parse(`${fecha}T00:00:00Z`) + (h * 60 + m + 5 * 60) * MS_MIN;
}

/** Clave de comparación de una categoría de AW. */
function claveDeCategoria(categoria) {
  if (categoria[0] === 'Estudio') return `Estudio/${categoria[1] ?? 'Sin área'}`;
  if (categoria[0] === 'Uncategorized') return 'Sin clasificar';
  return categoria[0]; // Distracción, Neutral, IA (o una clase desconocida)
}

/** Clave de comparación de una clave de verdad.json ("Distracción/Video" → "Distracción"). */
function claveDeVerdad(clave) {
  return clave.startsWith('Estudio/') ? clave : clave.split('/')[0];
}

const sumarEn = (objeto, clave, valor) => { objeto[clave] = (objeto[clave] ?? 0) + valor; };
const totalDe = (objeto) => Object.values(objeto).reduce((s, v) => s + v, 0);
const acierto = (nuestros, verdad) =>
  Object.entries(verdad).reduce((s, [k, m]) => s + Math.min(m, nuestros[k] ?? 0), 0) / totalDe(verdad);

/** Todos los eventos clasificados de los días de AW que cubren los datos (10-05 al 10-19). */
function todosLosEventos() {
  const fechas = [...FECHAS_EJEMPLO, sumarDias(FECHAS_EJEMPLO.at(-1), 1)];
  return fechas.flatMap((f) => datosDiaEjemplo(f).eventos)
    .map((e) => ({ inicio: Date.parse(e.timestamp), fin: Date.parse(e.timestamp) + e.duration * 1000, data: e.data }));
}

/** Compara un día de verdad.json con nuestros eventos. Minutos con decimales. */
function compararDia(dia, eventos) {
  const tramos = dia.segmentos.filter((s) => s.modo === 'act')
    .map((s) => [instanteVerdad(dia.fecha, s.de), instanteVerdad(dia.fecha, s.a)]);

  const nuestros = {};
  const explicado = { youtube: 0, vscode: 0 };
  for (const e of eventos) {
    let ms = 0;
    for (const [a, b] of tramos) ms += Math.max(0, Math.min(e.fin, b) - Math.max(e.inicio, a));
    if (ms === 0) continue;
    const clave = claveDeCategoria(e.data.$category);
    sumarEn(nuestros, clave, ms / MS_MIN);
    if (YOUTUBE_ENTRETENIMIENTO.has(e.data.title) && clave === 'Neutral') explicado.youtube += ms / MS_MIN;
    if (e.data.app === 'Code.exe' && e.data.title === VSCODE_RARO && clave === 'Estudio/Programación') explicado.vscode += ms / MS_MIN;
  }

  const verdad = {};
  for (const [k, m] of Object.entries(dia.minutos_por_clase_y_area)) {
    if (k === '(afk)' || k === 'Estudio (sin teclado)') continue;
    sumarEn(verdad, claveDeVerdad(k), m);
  }

  // Nuestros minutos "corregidos" con las diferencias explicadas, para ver qué queda sin explicar.
  const ajustados = { ...nuestros };
  sumarEn(ajustados, 'Neutral', -explicado.youtube);
  sumarEn(ajustados, 'Distracción', explicado.youtube);
  sumarEn(ajustados, 'Estudio/Programación', -explicado.vscode);
  sumarEn(ajustados, 'Sin clasificar', explicado.vscode);

  const claves = [...new Set([...Object.keys(verdad), ...Object.keys(ajustados)])];
  const restantes = claves.map((k) => [k, (ajustados[k] ?? 0) - (verdad[k] ?? 0)])
    .filter(([, d]) => Math.abs(d) >= 0.5)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  return {
    fecha: dia.fecha,
    totalMin: totalDe(verdad),
    nuestrosMin: totalDe(nuestros),
    correcto: totalDe(verdad) ? acierto(nuestros, verdad) : null,
    ajustado: totalDe(verdad) ? acierto(ajustados, verdad) : null,
    explicado,
    restantes,
  };
}

const pct = (x) => (x === null ? '—' : `${(x * 100).toFixed(1)} %`);

// ── Las reglas de ejemplo ──

test('clases-ejemplo.json sigue la taxonomía v3 (§7) y todas sus regex compilan', () => {
  const classes = clasesEjemplo();
  const ids = classes.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'ids repetidos');
  for (const c of classes) assert.deepEqual(Object.keys(c).sort(), ['data', 'id', 'name', 'rule']);

  const hijos = (padre) => classes.filter((c) => c.name.length === 2 && c.name[0] === padre).map((c) => c.name[1]);
  assert.deepEqual(hijos('Estudio'), ['Programación', 'Matemáticas', 'Inglés', 'Humanidades']);
  assert.deepEqual(hijos('Distracción'), ['Video', 'Redes', 'Juegos', 'Otros']);
  assert.deepEqual(hijos('Neutral'), ['Comunicación', 'Sistema', 'Otros']);
  assert.deepEqual(hijos('IA'), []);

  // Los padres no tienen regex (type 'none'); IA es una sola regla con prioridad 30.
  for (const padre of ['Estudio', 'Distracción', 'Neutral']) {
    assert.equal(classes.find((c) => c.name.length === 1 && c.name[0] === padre).rule.type, 'none');
  }
  const ia = classes.filter((c) => c.name[0] === 'IA');
  assert.equal(ia.length, 1);
  assert.equal(ia[0].rule.priority, 30);

  // Las áreas de Estudio van DESPUÉS de Neutral > Otros (YouTube): en el empate de rango 20 gana Estudio.
  const indice = (nombre) => classes.findIndex((c) => c.name.join('/') === nombre);
  for (const area of hijos('Estudio')) assert.ok(indice(`Estudio/${area}`) > indice('Neutral/Otros'), area);

  const { reglas, errores } = compilarReglas(classes);
  assert.deepEqual(errores, []);
  assert.equal(reglas.length, 12);
});

test('las reglas de ejemplo respetan las decisiones de Dremy (§7)', () => {
  const c = compilarReglas(clasesEjemplo());
  const cat = (app, title) => categorizar({ app, title }, c).join(' > ');
  const chrome = (titulo) => cat('chrome.exe', `${titulo} - Google Chrome`);

  // YouTube en Neutral > Otros; con palabras de un área, Estudio de esa área.
  assert.equal(chrome('Top 10 combos imposibles - YouTube'), 'Neutral > Otros');
  assert.equal(chrome('Shorts - YouTube'), 'Neutral > Otros');
  assert.equal(chrome('SQL JOIN explicado con ejemplos - YouTube'), 'Estudio > Programación');
  assert.equal(chrome('Variación de parámetros - Ecuaciones diferenciales - YouTube'), 'Estudio > Matemáticas');
  assert.equal(chrome('English listening practice A1 - YouTube'), 'Estudio > Inglés');
  // Obsidian y Spotify en Neutral > Otros; terminales en Programación.
  assert.equal(cat('Obsidian.exe', 'bitácora - life_tracking - Obsidian'), 'Neutral > Otros');
  assert.equal(cat('Spotify.exe', 'Spotify Premium'), 'Neutral > Otros');
  assert.equal(cat('warp.exe', 'turnos-app — warp'), 'Estudio > Programación');
  assert.equal(cat('WindowsTerminal.exe', 'PowerShell'), 'Estudio > Programación');
  // IA gana siempre (prioridad 30), aunque el título nombre un área.
  assert.equal(cat('claude.exe', 'Claude'), 'IA');
  assert.equal(chrome('Gemini'), 'IA');
  assert.equal(chrome('ChatGPT - Ayuda con integrales'), 'IA');
  // Palabras pedidas por Dremy.
  for (const palabra of ['resolución', 'integral', 'métodos']) assert.equal(chrome(`Guía de ${palabra}`), 'Estudio > Matemáticas', palabra);
  for (const palabra of ['listen', 'speak', 'speaking', 'listening']) assert.equal(chrome(`Practice ${palabra} now`), 'Estudio > Inglés', palabra);
  // Lo que ninguna regla reconoce.
  assert.equal(chrome('Nueva pestaña'), 'Uncategorized');
  assert.equal(cat('msedge.exe', 'Inicio - Microsoft Edge'), 'Uncategorized');
  // Reddit es Distracción aunque el subreddit sea de programación (no hay palabras de área en inglés).
  assert.equal(chrome('r/learnprogramming - Reddit'), 'Distracción > Redes');
  // "Hojas de cálculo" no es Matemáticas (por eso la regla no usa "cálculo").
  assert.equal(chrome('Mediciones PI2 - Hojas de cálculo de Google'), 'Estudio > Programación');
});

// ── Contra la verdad ──

test(`cada día de ejemplo clasifica al menos el ${META * 100} % del tiempo con teclado en la clase correcta`, (t) => {
  const eventos = todosLosEventos();
  const verdad = verdadEjemplo();
  const filas = verdad.dias.map((dia) => compararDia(dia, eventos));

  t.diagnostic('fecha       total  correcto  explicado(YT+VSCode)  ajustado  diferencias restantes');
  for (const f of filas) {
    const explicadoPct = f.correcto === null ? '—' : `${((f.ajustado - f.correcto) * 100).toFixed(1)} % (${Math.round(f.explicado.youtube)}+${Math.round(f.explicado.vscode)} min)`;
    const restantes = f.restantes.slice(0, 3).map(([k, d]) => `${k} ${d > 0 ? '+' : ''}${d.toFixed(1)}`).join(', ') || 'ninguna';
    t.diagnostic(`${f.fecha}  ${String(Math.round(f.totalMin)).padStart(4)}  ${pct(f.correcto).padStart(8)}  ${explicadoPct.padEnd(20)}  ${pct(f.ajustado).padStart(8)}  ${restantes}`);
  }

  for (const f of filas) {
    if (f.fecha === '2026-10-13') {
      // Día sin datos: ni verdad ni eventos.
      assert.equal(f.totalMin, 0);
      assert.equal(f.nuestrosMin, 0);
      continue;
    }
    assert.ok(f.ajustado >= META, `${f.fecha}: ${pct(f.ajustado)} después de descontar las diferencias explicadas`);
    // Lo que queda es redondeo de verdad.json (minutos enteros por intención): nunca más de 2 min por clave.
    for (const [clave, diferencia] of f.restantes) assert.ok(Math.abs(diferencia) < 2, `${f.fecha} ${clave}: ${diferencia.toFixed(1)} min`);
    // Se clasificó todo el tiempo con teclado (ni más ni menos, salvo el redondeo).
    assert.ok(Math.abs(f.nuestrosMin - f.totalMin) < 3, `${f.fecha}: ${f.nuestrosMin.toFixed(1)} min contra ${f.totalMin}`);
  }

  // Las diferencias explicadas existen de verdad (si desaparecieran, habría que revisar esta prueba).
  assert.ok(filas.every((f) => f.totalMin === 0 || f.explicado.youtube > 0), 'todos los días con datos tienen YouTube de entretenimiento');
  assert.ok(filas.find((f) => f.fecha === '2026-10-15').explicado.vscode > 0);
  assert.ok(filas.filter((f) => f.fecha !== '2026-10-15').every((f) => f.explicado.vscode === 0));
});
