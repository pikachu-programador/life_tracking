// Pruebas del clasificador (web/motor/clasificador.js, H-01): el criterio de categorías de AW (§7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilarReglas, categorizar, categorizarEventos, claseDeCategoria } from '../web/motor/clasificador.js';

/** Congela un objeto y todo lo que contiene: si una función lo intenta modificar, lanza un error. */
function congelar(valor) {
  if (valor && typeof valor === 'object') {
    Object.values(valor).forEach(congelar);
    Object.freeze(valor);
  }
  return valor;
}

const regla = (name, regex, extra = {}) => ({ name, rule: { type: 'regex', regex, ...extra } });

// ── compilarReglas ──

test('compilarReglas salta los padres (none, null), las regex vacías y las reglas sin rule', () => {
  const { reglas, errores } = compilarReglas([
    { name: ['Estudio'], rule: { type: 'none' } },
    { name: ['Otro'], rule: { type: null } },
    { name: ['Vacía'], rule: { type: 'regex', regex: '   ' } },
    { name: ['Sin regex'], rule: { type: 'regex' } },
    { name: ['Sin regla'] },
    regla(['Estudio', 'Inglés'], 'English'),
  ]);
  assert.equal(reglas.length, 1);
  assert.deepEqual(reglas[0].categoria, ['Estudio', 'Inglés']);
  assert.equal(reglas[0].indice, 5); // la posición en `classes`, no en la lista compilada
  assert.deepEqual(errores, []);
});

test('compilarReglas calcula el rango: priority si es número; si no, profundidad × 10', () => {
  const { reglas } = compilarReglas([
    regla(['A'], 'a'),
    regla(['A', 'B'], 'b'),
    regla(['A', 'B', 'C'], 'c'),
    regla(['IA'], 'claude', { priority: 30 }),
    regla(['Cero'], 'x', { priority: 0 }),
    regla(['Texto'], 'y', { priority: '50' }), // no es número: se usa la profundidad
  ]);
  assert.deepEqual(reglas.map((r) => r.rango), [10, 20, 30, 30, 0, 10]);
});

test('compilarReglas: select_keys vacío equivale a no tenerlo; la regex no lleva las banderas g ni y', () => {
  const { reglas } = compilarReglas([
    regla(['A'], 'a', { select_keys: [] }),
    regla(['B'], 'b', { select_keys: ['app'] }),
    regla(['C'], 'c', { ignore_case: true }),
  ]);
  assert.equal(reglas[0].claves, null);
  assert.deepEqual(reglas[1].claves, ['app']);
  assert.ok(reglas[2].regex.flags.includes('i'));
  for (const r of reglas) assert.ok(!r.regex.global && !r.regex.sticky);
});

test('compilarReglas manda a errores las regex que no compilan y los nombres inválidos, y sigue con las demás', () => {
  const { reglas, errores } = compilarReglas([
    regla(['Rota'], '(sin cerrar'),
    regla(['Verbosa'], '(?x) a b'),
    { name: 'Estudio', rule: { type: 'regex', regex: 'x' } },
    { name: [], rule: { type: 'regex', regex: 'y' } },
    regla(['Buena'], 'bien'),
  ]);
  assert.deepEqual(reglas.map((r) => r.categoria), [['Buena']]);
  assert.equal(errores.length, 4);
  assert.deepEqual(errores[0].categoria, ['Rota']);
  assert.equal(errores[0].regex, '(sin cerrar');
  assert.match(errores[0].mensaje, /no compila/);
  assert.match(errores[1].mensaje, /verboso/);
  assert.match(errores[2].mensaje, /nombre/);
});

test('compilarReglas no modifica su entrada y acepta entradas vacías o raras', () => {
  const classes = congelar([regla(['A', 'B'], 'a', { select_keys: ['app'] })]);
  compilarReglas(classes); // lanzaría si intentara modificar algo congelado
  assert.deepEqual(compilarReglas([]), { reglas: [], errores: [] });
  assert.deepEqual(compilarReglas(null), { reglas: [], errores: [] });
  assert.deepEqual(compilarReglas(undefined), { reglas: [], errores: [] });
  assert.deepEqual(compilarReglas([null, 5, 'x']), { reglas: [], errores: [] });
});

// ── categorizar ──

test('categorizar busca la regex (no exige coincidencia completa) en todos los campos de texto', () => {
  const c = compilarReglas([regla(['Estudio', 'Programación'], 'warp\\.exe'), regla(['Distracción', 'Video'], 'netflix\\.com')]);
  assert.deepEqual(categorizar({ app: 'warp.exe', title: 'turnos-app' }, c), ['Estudio', 'Programación']);
  // La URL también es un campo de texto (eventos web y el agente, §7).
  assert.deepEqual(categorizar({ app: 'chrome.exe', title: 'Netflix', url: 'https://www.netflix.com/watch/1' }, c), ['Distracción', 'Video']);
  assert.deepEqual(categorizar({ app: 'chrome.exe', title: 'Netflix' }, c), ['Uncategorized']);
});

test('categorizar con select_keys solo mira esas claves', () => {
  const c = compilarReglas([regla(['Neutral', 'Sistema'], 'explorer', { select_keys: ['app'] })]);
  assert.deepEqual(categorizar({ app: 'explorer.exe', title: 'Descargas' }, c), ['Neutral', 'Sistema']);
  assert.deepEqual(categorizar({ app: 'chrome.exe', title: 'explorer de archivos' }, c), ['Uncategorized']);
  assert.deepEqual(categorizar({ title: 'explorer' }, c), ['Uncategorized']); // la clave no está
});

test('categorizar ignora los valores que no son texto', () => {
  const c = compilarReglas([regla(['Números'], '5'), regla(['Verdad'], 'true')]);
  assert.deepEqual(categorizar({ tabCount: 5, audible: true, $category: ['5'] }, c), ['Uncategorized']);
  assert.deepEqual(categorizar({ title: 'pestaña 5' }, c), ['Números']);
});

test('categorizar: gana la más profunda; en empate, la posterior; priority gana a la profundidad', () => {
  const c = compilarReglas([
    regla(['Neutral', 'Otros'], 'YouTube'),
    regla(['Estudio'], 'SQL'),                  // rango 10
    regla(['Estudio', 'Programación'], 'SQL'),  // rango 20: le gana a la de arriba
    regla(['IA'], 'Gemini', { priority: 30 }),
  ]);
  const yt = (titulo) => categorizar({ app: 'chrome.exe', title: `${titulo} - YouTube - Google Chrome` }, c);
  assert.deepEqual(yt('Top 10 combos'), ['Neutral', 'Otros']);
  // Mismo rango (20) que YouTube y va después en la lista: gana Estudio (§7).
  assert.deepEqual(yt('SQL JOIN explicado'), ['Estudio', 'Programación']);
  // IA (priority 30) gana aunque el título tenga palabras de un área.
  assert.deepEqual(yt('Gemini explica SQL'), ['IA']);

  // Si la de Estudio fuera ANTES que YouTube, en el empate ganaría YouTube.
  const alReves = compilarReglas([regla(['Estudio', 'Programación'], 'SQL'), regla(['Neutral', 'Otros'], 'YouTube')]);
  assert.deepEqual(categorizar({ title: 'SQL - YouTube' }, alReves), ['Neutral', 'Otros']);
});

test('categorizar: una priority baja pierde contra una regla menos profunda', () => {
  const c = compilarReglas([regla(['A', 'B', 'C'], 'x', { priority: 5 }), regla(['D'], 'x')]);
  assert.deepEqual(categorizar({ title: 'x' }, c), ['D']);
});

test('categorizar respeta ignore_case y entiende \\b con tildes (regex de Python o Rust)', () => {
  const c = compilarReglas([
    regla(['Estudio', 'Inglés'], 'english', { ignore_case: true }),
    regla(['Estudio', 'Matemáticas'], '\\bmétodos\\b'),
    regla(['Sensible'], 'Claude'),
  ]);
  assert.deepEqual(categorizar({ title: 'ENGLISH practice' }, c), ['Estudio', 'Inglés']);
  assert.deepEqual(categorizar({ title: 'Clase de métodos numéricos' }, c), ['Estudio', 'Matemáticas']);
  assert.deepEqual(categorizar({ title: 'submétodos' }, c), ['Uncategorized']);
  assert.deepEqual(categorizar({ title: 'claude' }, c), ['Uncategorized']); // sin ignore_case
});

test('categorizar con datos vacíos o nulos da Uncategorized, y devuelve una copia', () => {
  const c = compilarReglas([regla(['A'], 'a')]);
  assert.deepEqual(categorizar({}, c), ['Uncategorized']);
  assert.deepEqual(categorizar(null, c), ['Uncategorized']);
  assert.deepEqual(categorizar(undefined, c), ['Uncategorized']);
  assert.deepEqual(categorizar({ app: 'a' }, { reglas: [], errores: [] }), ['Uncategorized']);
  const primera = categorizar({ app: 'a' }, c);
  primera.push('modificada');
  assert.deepEqual(categorizar({ app: 'a' }, c), ['A']);
  assert.deepEqual(c.reglas[0].categoria, ['A']);
});

test('categorizar no depende del orden de compiladas.reglas: usa rango e índice', () => {
  const c = compilarReglas([regla(['A', 'B'], 'x'), regla(['C', 'D'], 'x')]);
  const desordenadas = { reglas: [...c.reglas].reverse(), errores: [] };
  assert.deepEqual(categorizar({ title: 'x' }, desordenadas), ['C', 'D']); // la de índice mayor
});

// ── categorizarEventos ──

test('categorizarEventos devuelve copias con data.$category y no toca los originales', () => {
  const c = compilarReglas([regla(['IA'], 'claude', { ignore_case: true, priority: 30 })]);
  const eventos = congelar([
    { id: 1, timestamp: '2026-10-05T12:00:00Z', duration: 10, data: { app: 'claude.exe', title: 'Claude' } },
    { id: 2, timestamp: '2026-10-05T12:00:10Z', duration: 5, data: { app: 'explorer.exe', title: 'Descargas' } },
    { id: 3, timestamp: '2026-10-05T12:00:15Z', duration: 5, data: { app: 'claude.exe', title: 'Claude' } },
    { id: 4, timestamp: '2026-10-05T12:00:20Z', duration: 1 },
  ]);
  const salida = categorizarEventos(eventos, c);
  assert.deepEqual(salida.map((e) => e.data.$category), [['IA'], ['Uncategorized'], ['IA'], ['Uncategorized']]);
  assert.deepEqual(salida[0], { ...eventos[0], data: { app: 'claude.exe', title: 'Claude', $category: ['IA'] } });
  assert.equal(eventos[0].data.$category, undefined);
  // Cada evento tiene su propia lista (los iguales no comparten la misma).
  salida[0].data.$category.push('x');
  assert.deepEqual(salida[2].data.$category, ['IA']);
});

test('categorizarEventos recategoriza un evento que ya traía $category', () => {
  const c = compilarReglas([regla(['A'], 'a')]);
  const [e] = categorizarEventos([{ timestamp: 't', duration: 1, data: { app: 'a', $category: ['Vieja'] } }], c);
  assert.deepEqual(e.data.$category, ['A']);
});

test('categorizarEventos con una lista vacía o nula devuelve []', () => {
  const c = compilarReglas([]);
  assert.deepEqual(categorizarEventos([], c), []);
  assert.deepEqual(categorizarEventos(null, c), []);
});

test('categorizarEventos clasifica 1500 eventos con 30 reglas en poco tiempo', () => {
  const classes = Array.from({ length: 30 }, (_, i) => regla(['Clase', `Sub${i}`], `palabra${i}\\b|app${i}\\.exe`, { ignore_case: true }));
  const c = compilarReglas(classes);
  const eventos = Array.from({ length: 1500 }, (_, i) => ({
    timestamp: '2026-10-05T12:00:00Z', duration: 1, data: { app: `app${i % 40}.exe`, title: `Título ${i} con palabra${i % 50}` },
  }));
  // La primera pasada incluye lo que V8 tarda en compilar cada regex la primera vez que la usa
  // (las clases Unicode de regex.js con ignore_case son caras: ~3 ms por regla, una sola vez).
  let t0 = performance.now();
  const salida = categorizarEventos(eventos, c);
  const primera = performance.now() - t0;
  t0 = performance.now();
  categorizarEventos(eventos, c);
  const segunda = performance.now() - t0;
  assert.equal(salida.length, 1500);
  assert.ok(primera < 2000, `la primera pasada tardó ${primera.toFixed(0)} ms`);
  assert.ok(segunda < 250, `la segunda pasada tardó ${segunda.toFixed(0)} ms`);
});

// ── claseDeCategoria ──

test('claseDeCategoria: primer nivel → clase; lo desconocido → sin-clasificar', () => {
  assert.equal(claseDeCategoria(['Estudio', 'Inglés']), 'estudio');
  assert.equal(claseDeCategoria(['Estudio']), 'estudio');
  assert.equal(claseDeCategoria(['Distracción', 'Video']), 'distraccion');
  assert.equal(claseDeCategoria(['Neutral', 'Otros']), 'neutral');
  assert.equal(claseDeCategoria(['IA']), 'ia');
  assert.equal(claseDeCategoria(['Uncategorized']), 'sin-clasificar');
  assert.equal(claseDeCategoria(['Trabajo', 'Otra']), 'sin-clasificar');
  assert.equal(claseDeCategoria(['estudio']), 'sin-clasificar'); // AW distingue mayúsculas
  assert.equal(claseDeCategoria(['constructor']), 'sin-clasificar'); // nada heredado de Object
  assert.equal(claseDeCategoria([]), 'sin-clasificar');
  assert.equal(claseDeCategoria(null), 'sin-clasificar');
  assert.equal(claseDeCategoria(undefined), 'sin-clasificar');
  assert.equal(claseDeCategoria('Estudio > Inglés'), 'estudio');
});
