// Pruebas de las piezas puras del AW falso (H-01): transformaciones (las funciones de consulta de AW),
// el lector de literales y el reconocedor de la consulta canónica. Casos armados a mano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isoDeAW, aInterno, aEventoAW, igualesJSON, recortarAlPeriodo, primeroDesde, flood, filterKeyvals,
  filterKeyvalsRegex, filterPeriodIntersect, periodUnion, partirUrl, splitUrlEvents, sortByTimestamp, concat, categorize,
} from '../herramientas/aw-falso/transformaciones.js';
import { leerLiteral, leerLiteralCompleto, leerTexto, ErrorLiteral } from '../herramientas/aw-falso/literales.js';
import {
  partirSentencias, reconocerConsulta, compilarReglasDeConsulta, ejecutarConsulta, ErrorConsulta,
} from '../herramientas/aw-falso/consulta.js';
import { crearAlmacen } from '../herramientas/aw-falso/almacen.js';
import { regexDeAW } from '../web/motor/regex.js';
import { compilarReglas } from '../web/motor/clasificador.js';
import { REGEX_APP_NAVEGADOR } from '../web/motor/tipos.js';
import { aTextoDeConsulta, consultaCanonica, reglasParaConsulta } from '../web/js/consultas.js';
import { clasesEjemplo } from './ayudantes/dia-ejemplo.js';

// Eventos internos de prueba: inicio y fin en SEGUNDOS desde un origen, para leer los casos fácil.
const T0 = Date.parse('2026-10-05T12:00:00Z');
const ev = (desde, hasta, data = {}, id) => ({ ...(id === undefined ? {} : { id }), inicio: T0 + desde * 1000, fin: T0 + hasta * 1000, data });
/** [desde, hasta] en segundos (y data si se pide) para comparar fácil. */
const tramos = (eventos, conDatos = false) => eventos.map((e) => {
  const t = [(e.inicio - T0) / 1000, (e.fin - T0) / 1000];
  return conDatos ? [...t, e.data] : t;
});

function congelar(valor) {
  if (valor && typeof valor === 'object') { Object.values(valor).forEach(congelar); Object.freeze(valor); }
  return valor;
}

// ── Conversión ──

test('aInterno y aEventoAW van y vuelven entre la forma de AW y la interna', () => {
  const aw = { id: 7, timestamp: '2026-10-05T11:55:00.000000+00:00', duration: 33.543, data: { app: 'explorer.exe' } };
  const interno = aInterno(aw);
  assert.deepEqual(interno, { id: 7, inicio: Date.parse('2026-10-05T11:55:00Z'), fin: Date.parse('2026-10-05T11:55:33.543Z'), data: aw.data });
  assert.deepEqual(aEventoAW(interno), aw);
  assert.equal(isoDeAW(Date.parse('2026-10-05T11:55:00.120Z')), '2026-10-05T11:55:00.120000+00:00');
  // Sin duración ni data: 0 y {}; sin id: no se inventa.
  assert.deepEqual(aInterno({ timestamp: '2026-10-05T12:00:00Z' }), { inicio: T0, fin: T0, data: {} });
  assert.throws(() => aInterno({ timestamp: 'ayer' }), /timestamp/);
  assert.throws(() => aInterno({ timestamp: '2026-10-05T12:00:00Z', duration: -1 }), /duration/);
  assert.throws(() => aInterno({ timestamp: '2026-10-05T12:00:00Z', duration: '5' }), /duration/);
});

test('igualesJSON compara por contenido, sin importar el orden de las claves', () => {
  assert.ok(igualesJSON({ app: 'a', title: 'b' }, { title: 'b', app: 'a' }));
  assert.ok(igualesJSON({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }));
  assert.ok(!igualesJSON({ a: [1, 2] }, { a: [2, 1] }));
  assert.ok(!igualesJSON({ a: 1 }, { a: 1, b: 2 }));
  assert.ok(!igualesJSON({ a: null }, { a: {} }));
  assert.ok(igualesJSON(true, 1)); // como en Python
  assert.ok(!igualesJSON('1', 1));
});

// ── query_bucket ──

test('recortarAlPeriodo: solapes con bordes incluidos, recortados, del más nuevo al más viejo', () => {
  const eventos = [ev(0, 10, { n: 1 }), ev(10, 20, { n: 2 }), ev(15, 15, { n: 3 }), ev(25, 40, { n: 4 }), ev(50, 60, { n: 5 })];
  const salida = recortarAlPeriodo(eventos, T0 + 10_000, T0 + 30_000, 15_000);
  assert.deepEqual(tramos(salida, true), [[25, 30, { n: 4 }], [15, 15, { n: 3 }], [10, 20, { n: 2 }], [10, 10, { n: 1 }]]);
  // Sin acotar la duración máxima da lo mismo.
  assert.deepEqual(recortarAlPeriodo(eventos, T0 + 10_000, T0 + 30_000), salida);
  assert.deepEqual(recortarAlPeriodo([], T0, T0 + 1000), []);
  assert.equal(primeroDesde(eventos, T0 + 12_000), 2);
  assert.equal(eventos[0].inicio, T0); // no modifica la entrada
});

// ── flood ──

test('flood: un hueco chico lo rellena el evento más largo; uno grande no se toca', () => {
  const a = { app: 'a' };
  const b = { app: 'b' };
  assert.deepEqual(tramos(flood([ev(0, 10, a), ev(13, 15, b)])), [[0, 13], [13, 15]]); // e1 más largo
  assert.deepEqual(tramos(flood([ev(0, 2, a), ev(5, 15, b)])), [[0, 2], [2, 15]]);     // e2 más largo
  assert.deepEqual(tramos(flood([ev(0, 10, a), ev(16, 20, b)])), [[0, 10], [16, 20]]); // 6 s > 5 s
  assert.deepEqual(tramos(flood([ev(0, 10, a), ev(16, 20, b)], 10)), [[0, 16], [16, 20]]); // otro pulsetime
});

test('flood une los eventos seguidos con los mismos datos y descarta los de duración 0', () => {
  const a = { app: 'a', title: 'x' };
  assert.deepEqual(tramos(flood([ev(0, 10, a), ev(12, 15, { title: 'x', app: 'a' })])), [[0, 15]]);
  assert.deepEqual(tramos(flood([ev(0, 2, a), ev(4, 15, a)])), [[0, 15]]);
  assert.deepEqual(tramos(flood([ev(0, 0, a), ev(30, 30, a), ev(40, 41, a)])), [[40, 41]]);
  // Hueco exacto de 0: no se unen (como en AW).
  assert.deepEqual(tramos(flood([ev(0, 10, a), ev(10, 20, a)])), [[0, 10], [10, 20]]);
});

test('flood: solapes con los mismos datos se unen; con datos distintos, solo si son menores que 0,1 s', () => {
  const a = { app: 'a' };
  const b = { app: 'b' };
  assert.deepEqual(tramos(flood([ev(0, 10, a), ev(5, 12, a)])), [[0, 12]]);
  assert.deepEqual(tramos(flood([ev(0, 10, a), ev(9.95, 12, b)])), [[0, 9.95], [9.95, 12]]);
  assert.deepEqual(tramos(flood([ev(0, 10, a), ev(5, 12, b)])), [[0, 10], [5, 12]]); // AW no lo arregla
});

test('flood deja limpios los "parpadeos" y las marcas de tiempo repetidas de los datos de ejemplo', () => {
  const a = { app: 'Code.exe', title: 'x' };
  // Como en generar.mjs: un evento de duración 0, el evento real y una copia exacta, todos en el mismo instante.
  const entrada = congelar([ev(10, 20, a), ev(10, 10, a), ev(10, 20, a), ev(20, 30, { app: 'b' })]);
  assert.deepEqual(tramos(flood(entrada)), [[10, 20], [20, 30]]);
  assert.equal(entrada[0].fin, T0 + 20_000); // no modifica la entrada
});

// ── Filtros ──

test('filterKeyvals y filterKeyvalsRegex', () => {
  const eventos = [ev(0, 1, { status: 'afk' }), ev(1, 2, { status: 'not-afk' }), ev(2, 3, { audible: true }), ev(3, 4, { app: 'Chrome.exe' }), ev(4, 5, { app: 5 })];
  assert.deepEqual(tramos(filterKeyvals(eventos, 'status', ['not-afk'])), [[1, 2]]);
  assert.deepEqual(tramos(filterKeyvals(eventos, 'audible', [true])), [[2, 3]]);
  assert.deepEqual(filterKeyvals(eventos, 'falta', [undefined]), []);
  const chrome = regexDeAW(REGEX_APP_NAVEGADOR.chrome);
  assert.deepEqual(tramos(filterKeyvalsRegex(eventos, 'app', chrome)), [[3, 4]]); // (?i): mayúsculas da igual
});

test('filterPeriodIntersect: el ejemplo de AW, y un evento que cruza varios periodos da varias partes', () => {
  // AW (aw_transform/filter_period_intersect.py):
  //   events1 |   =======        ======== |
  //   events2 | ------  ---  ---   ----   |
  //   result  |   ====  =          ====   |
  const eventos = [ev(2, 9, { e: 1 }, 11), ev(17, 25, { e: 2 }, 12)];
  const filtro = [ev(0, 6), ev(8, 11), ev(13, 16), ev(19, 23)];
  assert.deepEqual(tramos(filterPeriodIntersect(eventos, filtro), true), [[2, 6, { e: 1 }], [8, 9, { e: 1 }], [19, 23, { e: 2 }]]);
  assert.deepEqual(filterPeriodIntersect(eventos, filtro).map((e) => e.id), [11, 11, 12]); // conservan el id
  // Periodos del filtro que se solapan no cuentan dos veces; los que solo se tocan no dan partes vacías.
  assert.deepEqual(tramos(filterPeriodIntersect([ev(0, 10)], [ev(2, 6), ev(4, 8)])), [[2, 8]]);
  assert.deepEqual(tramos(filterPeriodIntersect([ev(0, 10)], [ev(10, 12), ev(-5, 0)])), []);
  assert.deepEqual(filterPeriodIntersect([], [ev(0, 1)]), []);
  assert.deepEqual(filterPeriodIntersect([ev(0, 1)], []), []);
});

test('periodUnion: el ejemplo de AW, sin solapes y con data vacío', () => {
  //   events1 |   -------       --------- |
  //   events2 | ------  ---  --    ----   |
  //   result  | -----------  -- --------- |
  const uno = [ev(2, 9, { a: 1 }), ev(16, 25, { a: 2 })];
  const dos = [ev(0, 6, { b: 1 }), ev(8, 11), ev(13, 15), ev(19, 23)];
  assert.deepEqual(tramos(periodUnion(uno, dos), true), [[0, 11, {}], [13, 15, {}], [16, 25, {}]]);
  assert.deepEqual(tramos(periodUnion([ev(0, 5)], [ev(5, 7)])), [[0, 7]]); // se tocan: se unen
  assert.deepEqual(periodUnion([], []), []);
  assert.deepEqual(uno[0].data, { a: 1 }); // no modifica la entrada
});

// ── split_url_events ──

test('partirUrl parte como urllib.parse.urlparse de Python', () => {
  assert.deepEqual(partirUrl('https://www.youtube.com/watch?v=ej1#t=30'),
    { esquema: 'https', red: 'www.youtube.com', ruta: '/watch', parametros: '', consulta: 'v=ej1', fragmento: 't=30' });
  assert.deepEqual(partirUrl('http://localhost:8080/'), { esquema: 'http', red: 'localhost:8080', ruta: '/', parametros: '', consulta: '', fragmento: '' });
  assert.deepEqual(partirUrl('file:///C:/Users/usuario/guia.pdf'), { esquema: 'file', red: '', ruta: '/C:/Users/usuario/guia.pdf', parametros: '', consulta: '', fragmento: '' });
  assert.deepEqual(partirUrl('chrome://newtab/'), { esquema: 'chrome', red: 'newtab', ruta: '/', parametros: '', consulta: '', fragmento: '' });
  assert.equal(partirUrl('https://ej.org/a;b/c;tipo=x?q').parametros, 'tipo=x');
  assert.equal(partirUrl('HTTPS://Ej.org').esquema, 'https');
  assert.deepEqual(partirUrl('sin-esquema/ruta'), { esquema: '', red: '', ruta: 'sin-esquema/ruta', parametros: '', consulta: '', fragmento: '' });
});

test('splitUrlEvents agrega $protocol, $domain (sin www.), $path, $params, $options e $identifier', () => {
  const entrada = congelar([ev(0, 1, { url: 'https://www.youtube.com/watch?v=ej1', title: 'x' }), ev(1, 2, { title: 'sin url' })]);
  const [conUrl, sinUrl] = splitUrlEvents(entrada);
  assert.deepEqual(conUrl.data, {
    url: 'https://www.youtube.com/watch?v=ej1', title: 'x', $protocol: 'https', $domain: 'youtube.com',
    $path: '/watch', $params: '', $options: 'v=ej1', $identifier: '',
  });
  assert.equal(sinUrl, entrada[1]);
  assert.equal(entrada[0].data.$domain, undefined);
});

test('sortByTimestamp, concat y categorize', () => {
  assert.deepEqual(tramos(sortByTimestamp([ev(5, 6), ev(1, 2), ev(3, 4)])), [[1, 2], [3, 4], [5, 6]]);
  assert.deepEqual(tramos(concat([ev(0, 1)], [], [ev(2, 3)])), [[0, 1], [2, 3]]);
  const compiladas = compilarReglas([{ name: ['IA'], rule: { type: 'regex', regex: 'claude', ignore_case: true, priority: 30 } }]);
  const [e] = categorize([ev(0, 1, { app: 'claude.exe' })], compiladas);
  assert.deepEqual(e.data, { app: 'claude.exe', $category: ['IA'] });
});

// ── Lector de literales ──

test('leerLiteral deja las barras de las regex tal cual (como el lenguaje de AW)', () => {
  // Así viaja en la consulta: aTextoDeConsulta() deja UNA barra ("warp\.exe$"), que no es JSON válido.
  const texto = '[[["Estudio","Programación"],{"type":"regex","regex":"warp\\.exe$|C\\+\\+|\\bSQL\\b","ignore_case":true}]]';
  assert.throws(() => JSON.parse(texto));
  assert.deepEqual(leerLiteralCompleto(texto), [[['Estudio', 'Programación'], { type: 'regex', regex: 'warp\\.exe$|C\\+\\+|\\bSQL\\b', ignore_case: true }]]);
  // Solo \" se des-escapa; una barra antes de otra cosa queda.
  assert.equal(leerLiteralCompleto('"dijo \\"hola\\" en \\n"'), 'dijo "hola" en \\n');
  assert.equal(leerLiteralCompleto("'comilla \\' simple'"), "comilla ' simple");
  assert.equal(leerTexto('x"abc"y', 1).fin, 6);
});

test('leerLiteral lee números, true, false, null, listas y objetos con espacios', () => {
  assert.deepEqual(leerLiteralCompleto(' { "a" : [1, -2.5, 3e2, true, false, null], "b": {}, "c": [] } '),
    { a: [1, -2.5, 300, true, false, null], b: {}, c: [] });
  assert.deepEqual(leerLiteral('[1, 2] resto'), { valor: [1, 2], fin: 6 });
  const raro = leerLiteralCompleto('{"__proto__": 1}');
  assert.equal(Object.getPrototypeOf(raro), Object.prototype); // la clave no cambia el prototipo
  assert.equal(raro.__proto__, 1);
});

test('leerLiteral rechaza lo que no es un literal', () => {
  for (const malo of ['events', '[1, 2', '"sin cerrar', '{"a" 1}', '{a: 1}', '[1 2]', 'trueno', '', '[1] x']) {
    assert.throws(() => leerLiteralCompleto(malo), ErrorLiteral, malo);
  }
});

test('las reglas de ejemplo van y vuelven por aTextoDeConsulta y el lector sin cambiar', () => {
  const pares = reglasParaConsulta(clasesEjemplo());
  assert.deepEqual(leerLiteralCompleto(aTextoDeConsulta(pares)), pares);
});

// ── Consulta canónica ──

const consultaDePrueba = (opciones = {}) => consultaCanonica({
  bucketVentana: 'aw-watcher-window_PC',
  bucketAfk: 'aw-watcher-afk_PC',
  navegadores: [{ navegador: 'chrome', id: 'aw-watcher-web-chrome_PC' }, { navegador: 'edge', id: 'aw-watcher-web-edge_PC' }],
  reglas: [[['IA'], { type: 'regex', regex: 'claude\\.exe', priority: 30 }]],
  ...opciones,
});

test('partirSentencias corta en los ";" que no están dentro de un texto', () => {
  assert.deepEqual(partirSentencias(['a = "x;y";', '  b = 1;  ', ';']), ['a = "x;y"', 'b = 1']);
  assert.deepEqual(partirSentencias('a = 1; b = \'p;q\''), ['a = 1', "b = 'p;q'"]);
});

test('reconocerConsulta extrae buckets, navegadores, audio, reglas y RETURN de la consulta canónica', () => {
  const plan = reconocerConsulta(consultaDePrueba());
  assert.equal(plan.bucketVentana, 'aw-watcher-window_PC');
  assert.equal(plan.bucketAfk, 'aw-watcher-afk_PC');
  assert.equal(plan.bucketAfkAparte, 'aw-watcher-afk_PC');
  assert.deepEqual(plan.navegadores, [
    { variable: 'chrome', bucket: 'aw-watcher-web-chrome_PC', regex: REGEX_APP_NAVEGADOR.chrome },
    { variable: 'edge', bucket: 'aw-watcher-web-edge_PC', regex: REGEX_APP_NAVEGADOR.edge },
  ]);
  assert.equal(plan.audible, true);
  assert.deepEqual(leerLiteralCompleto(plan.reglasTexto), [[['IA'], { type: 'regex', regex: 'claude\\.exe', priority: 30 }]]);
  assert.deepEqual(plan.retorno, [['eventos', 'events'], ['navegador', 'browser_events'], ['no_afk', 'not_afk'], ['afk', 'afk']]);

  // Sin navegadores y sin audio también es canónica.
  const simple = reconocerConsulta(consultaDePrueba({ navegadores: [], incluirAudible: false }));
  assert.deepEqual(simple.navegadores, []);
  assert.equal(simple.audible, false);
  // Como texto único (AW une las sentencias) y con otros espacios, también.
  const texto = consultaDePrueba().join('').replace(/, /g, ' ,  ').replace(/ = /g, '=');
  assert.deepEqual(reconocerConsulta(texto), plan);
});

test('reconocerConsulta rechaza cualquier otra consulta con un error 400 claro', () => {
  const canonica = consultaDePrueba();
  const casos = {
    'otra consulta': ['events = query_bucket("x");', 'RETURN = sum_durations(events);'],
    'vacía': [],
    'filtro cambiado': canonica.map((s) => s.replace('["not-afk"]', '["afk"]')),
    'sentencia de más': [...canonica.slice(0, -1), 'events = merge_events_by_keys(events, ["app"]);', canonica.at(-1)],
    'sin RETURN': canonica.slice(0, -1),
    'navegador desconocido': canonica.map((s) => s.replaceAll('chrome', 'netscape')),
    // La forma de la sentencia es válida, pero no coincide con la que arma consultaCanonica().
    'regex de navegador cambiada': canonica.map((s) => s.replace(REGEX_APP_NAVEGADOR.edge, 'edge')),
    'RETURN con otra variable': [...canonica.slice(0, -1), 'RETURN = {"eventos": otra};'],
    'texto sin cerrar': ['events = flood(query_bucket("aw);'],
  };
  for (const [nombre, consulta] of Object.entries(casos)) {
    assert.throws(() => reconocerConsulta(consulta), (e) => {
      assert.ok(e instanceof ErrorConsulta, nombre);
      assert.equal(e.estado, 400, nombre);
      assert.match(e.message, /solo entiende la consulta canónica de web\/js\/consultas\.js/, nombre);
      return true;
    }, nombre);
  }
});

test('compilarReglasDeConsulta lee el literal de categorize y rechaza otra forma', () => {
  const compiladas = compilarReglasDeConsulta('[[["IA"],{"type":"regex","regex":"claude\\.exe"}], [["Estudio"],{"type":"none"}]]');
  assert.equal(compiladas.reglas.length, 1);
  assert.ok(compiladas.reglas[0].regex.test('claude.exe'));
  assert.ok(!compiladas.reglas[0].regex.test('claudeXexe')); // la barra llegó: "." es literal
  assert.throws(() => compilarReglasDeConsulta('[["IA", "regla"]]'), ErrorConsulta);
  assert.throws(() => compilarReglasDeConsulta('{"a": 1}'), ErrorConsulta);
  assert.throws(() => compilarReglasDeConsulta('[[["IA"], {"type": regex}]]'), ErrorConsulta);
});

test('ejecutarConsulta valida el cuerpo, los periodos y que existan los buckets', () => {
  const almacen = crearAlmacen();
  const query = consultaDePrueba();
  const errores = [
    [null, /timeperiods/],
    [{ query }, /timeperiods/],
    [{ timeperiods: ['2026-10-05T09:00:00Z/2026-10-06T09:00:00Z'] }, /query/],
    [{ timeperiods: ['ayer/hoy'], query }, /Periodo inválido/],
    [{ timeperiods: ['2026-10-06T09:00:00Z/2026-10-05T09:00:00Z'], query }, /al revés/],
    [{ timeperiods: ['2026-10-05T09:00:00Z/2026-10-06T09:00:00Z'], query }, /No existe el bucket «aw-watcher-window_PC»/],
  ];
  for (const [cuerpo, mensaje] of errores) {
    assert.throws(() => ejecutarConsulta(cuerpo, almacen), (e) => e instanceof ErrorConsulta && e.estado === 400 && mensaje.test(e.message));
  }
});

test('ejecutarConsulta da un resultado por periodo, y un periodo sin datos da listas vacías', () => {
  const almacen = crearAlmacen();
  const query = consultaCanonica({
    bucketVentana: 'aw-watcher-window_ejemplo', bucketAfk: 'aw-watcher-afk_ejemplo',
    navegadores: [{ navegador: 'chrome', id: 'aw-watcher-web-chrome_ejemplo' }], reglas: reglasParaConsulta(clasesEjemplo()),
  });
  const [lunes, sinDatos] = ejecutarConsulta({
    timeperiods: ['2026-10-05T09:00:00Z/2026-10-06T09:00:00Z', '2026-10-13T09:00:00Z/2026-10-14T09:00:00Z'], query,
  }, almacen);
  assert.ok(lunes.eventos.length > 100);
  assert.deepEqual(sinDatos, { eventos: [], navegador: [], no_afk: [], afk: [] });
});
