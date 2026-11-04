// Pruebas de web/motor/agrupar.js (V-01, V-08): agruparPor y filtrarSegmentos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparPor, filtrarSegmentos } from '../web/motor/agrupar.js';
import { instanteLocal } from '../web/motor/fechas.js';

const FECHA = '2026-10-05';

/** Segmento de prueba de `desde` a `hasta` ('HH:MM' en Lima) del 5 de octubre. */
function seg(clase, desde, hasta, datos = {}) {
  const actividad = clase !== 'afk' && clase !== 'sin-pc';
  return {
    inicio: instanteLocal(FECHA, desde),
    fin: instanteLocal(FECHA, hasta),
    clase,
    categoria: null,
    area: null,
    app: actividad ? 'app.exe' : null,
    titulo: null,
    url: null,
    dominio: null,
    audible: false,
    incognito: false,
    ...datos,
  };
}

// Un día corto: 10:00–12:00 con estudio, YouTube, IA, AFK y un hueco sin PC.
const SEGMENTOS = [
  seg('estudio', '10:00', '10:30', { app: 'Code.exe', titulo: 'trie.cpp', categoria: ['Estudio', 'Programación'], area: 'Programación' }),
  seg('neutral', '10:30', '10:40', {
    app: 'chrome.exe', titulo: 'Música para estudiar - YouTube', url: 'https://www.youtube.com/watch?v=aaa',
    dominio: 'youtube.com', categoria: ['Neutral', 'Otros'],
  }),
  seg('distraccion', '10:40', '10:50', {
    app: 'chrome.exe', titulo: 'Gatos - YouTube', url: 'https://m.youtube.com/watch?v=bbb',
    dominio: 'm.youtube.com', categoria: ['Distracción', 'Video'],
  }),
  seg('afk', '10:50', '11:00'),
  seg('estudio', '11:00', '11:15', {
    app: 'chrome.exe', titulo: 'Inglés: phrasal verbs', url: 'https://ejemplo-ingles.test/leccion',
    dominio: 'ejemplo-ingles.test', categoria: ['Estudio', 'Inglés'], area: 'Inglés',
  }),
  seg('ia', '11:15', '11:20', { app: 'chrome.exe', titulo: 'Claude', url: 'https://claude.ai/chat', dominio: 'claude.ai', categoria: ['IA'] }),
  seg('sin-pc', '11:20', '11:40'),
  seg('estudio', '11:40', '12:00', { app: 'code.exe', titulo: 'trie.cpp', categoria: ['Estudio', 'Programación'], area: 'Programación' }),
  seg('sin-clasificar', '12:00', '12:05', { app: null, categoria: null }), // hueco de no_afk sin ventana
];

const MIN = 60;

test('agruparPor app: de mayor a menor, solo actividad, sin la app null', () => {
  const grupos = agruparPor(SEGMENTOS, 'app');
  // chrome.exe: 10 + 10 + 15 + 5 = 40 min; Code.exe: 30 min; code.exe: 20 min (la app distingue mayúsculas al agrupar).
  assert.deepEqual(grupos.map((g) => [g.clave, g.segundos]), [
    ['chrome.exe', 40 * MIN],
    ['Code.exe', 30 * MIN],
    ['code.exe', 20 * MIN],
  ]);
  const chrome = grupos[0];
  assert.deepEqual(chrome.porEstado, {
    'estudio': 15 * MIN, 'ia': 5 * MIN, 'neutral': 10 * MIN, 'distraccion': 10 * MIN, 'sin-clasificar': 0, 'afk': 0, 'sin-pc': 0,
  });
});

test('agruparPor categoria une la ruta con " > "', () => {
  const grupos = agruparPor(SEGMENTOS, 'categoria');
  assert.deepEqual(grupos.map((g) => [g.clave, g.segundos]), [
    ['Estudio > Programación', 50 * MIN],
    ['Estudio > Inglés', 15 * MIN],
    ['Distracción > Video', 10 * MIN],
    ['Neutral > Otros', 10 * MIN], // empate con Video: orden alfabético
    ['IA', 5 * MIN],
  ]);
});

test('agruparPor area, dominio, url y titulo', () => {
  assert.deepEqual(agruparPor(SEGMENTOS, 'area').map((g) => [g.clave, g.segundos]), [['Programación', 50 * MIN], ['Inglés', 15 * MIN]]);
  assert.deepEqual(agruparPor(SEGMENTOS, 'dominio').map((g) => g.clave), ['ejemplo-ingles.test', 'm.youtube.com', 'youtube.com', 'claude.ai']);
  assert.equal(agruparPor(SEGMENTOS, 'url').length, 4);
  // El mismo título en dos apps se suma.
  assert.deepEqual(agruparPor(SEGMENTOS, 'titulo')[0], {
    clave: 'trie.cpp', segundos: 50 * MIN,
    porEstado: { 'estudio': 50 * MIN, 'ia': 0, 'neutral': 0, 'distraccion': 0, 'sin-clasificar': 0, 'afk': 0, 'sin-pc': 0 },
  });
});

test('agruparPor con filtro', () => {
  const grupos = agruparPor(SEGMENTOS, 'app', { filtro: (s) => s.clase === 'estudio' });
  assert.deepEqual(grupos.map((g) => [g.clave, g.segundos]), [['Code.exe', 30 * MIN], ['code.exe', 20 * MIN], ['chrome.exe', 15 * MIN]]);
});

test('agruparPor: listas vacías, sin entrada y clave inválida', () => {
  assert.deepEqual(agruparPor([], 'app'), []);
  assert.deepEqual(agruparPor(undefined, 'app'), []);
  assert.deepEqual(agruparPor([seg('afk', '10:00', '11:00')], 'app'), []);
  assert.throws(() => agruparPor(SEGMENTOS, 'curso'), /No se puede agrupar por "curso"/);
});

test('agruparPor no modifica los segmentos', () => {
  const copia = structuredClone(SEGMENTOS);
  agruparPor(SEGMENTOS, 'categoria');
  filtrarSegmentos(SEGMENTOS, { tipo: 'palabra', valor: 'ingles' });
  assert.deepEqual(SEGMENTOS, copia);
});

test('filtrarSegmentos por categoría: prefijo de la ruta', () => {
  const titulos = (lista) => lista.map((s) => s.titulo);
  assert.deepEqual(titulos(filtrarSegmentos(SEGMENTOS, { tipo: 'categoria', valor: 'Estudio > Inglés' })), ['Inglés: phrasal verbs']);
  assert.equal(filtrarSegmentos(SEGMENTOS, { tipo: 'categoria', valor: 'Estudio' }).length, 3);
  assert.equal(filtrarSegmentos(SEGMENTOS, { tipo: 'categoria', valor: '  Estudio>Programación ' }).length, 2); // espacios de más
  // 'Estudio > Inglés > Gramática' es más profunda que la categoría del segmento: no coincide.
  assert.equal(filtrarSegmentos(SEGMENTOS, { tipo: 'categoria', valor: 'Estudio > Inglés > Gramática' }).length, 0);
  // Un prefijo de texto que no es una parte entera de la ruta no coincide.
  assert.equal(filtrarSegmentos(SEGMENTOS, { tipo: 'categoria', valor: 'Estu' }).length, 0);
});

test('filtrarSegmentos por app: sin distinguir mayúsculas', () => {
  assert.equal(filtrarSegmentos(SEGMENTOS, { tipo: 'app', valor: 'CODE.EXE' }).length, 2);
  assert.equal(filtrarSegmentos(SEGMENTOS, { tipo: 'app', valor: 'code' }).length, 0); // tiene que ser igual, no "contiene"
});

test('filtrarSegmentos por dominio: el dominio o un subdominio', () => {
  const urls = (valor) => filtrarSegmentos(SEGMENTOS, { tipo: 'dominio', valor }).map((s) => s.url);
  assert.deepEqual(urls('youtube.com'), ['https://www.youtube.com/watch?v=aaa', 'https://m.youtube.com/watch?v=bbb']);
  assert.deepEqual(urls('www.YouTube.com'), urls('youtube.com')); // "www." y mayúsculas no importan
  assert.deepEqual(urls('m.youtube.com'), ['https://m.youtube.com/watch?v=bbb']);
  assert.deepEqual(urls('tube.com'), []); // no es un subdominio
});

test('filtrarSegmentos por palabra: en título o URL, sin mayúsculas ni tildes', () => {
  const titulos = (valor) => filtrarSegmentos(SEGMENTOS, { tipo: 'palabra', valor }).map((s) => s.titulo);
  assert.deepEqual(titulos('INGLES'), ['Inglés: phrasal verbs']); // en el título, sin tilde
  assert.deepEqual(titulos('inglés'), ['Inglés: phrasal verbs']); // con tilde
  assert.deepEqual(titulos('watch?v'), ['Música para estudiar - YouTube', 'Gatos - YouTube']); // en la URL
  assert.deepEqual(titulos('musica'), ['Música para estudiar - YouTube']);
});

test('filtrarSegmentos: solo actividad, valor vacío y tipo inválido', () => {
  const conAfk = [seg('afk', '09:00', '10:00', { titulo: 'trie.cpp' }), ...SEGMENTOS];
  assert.equal(filtrarSegmentos(conAfk, { tipo: 'palabra', valor: 'trie' }).length, 2); // el AFK no cuenta
  assert.deepEqual(filtrarSegmentos(SEGMENTOS, { tipo: 'palabra', valor: '   ' }), []);
  assert.deepEqual(filtrarSegmentos(SEGMENTOS, { tipo: 'app', valor: '' }), []);
  assert.deepEqual(filtrarSegmentos([], { tipo: 'app', valor: 'code.exe' }), []);
  assert.throws(() => filtrarSegmentos(SEGMENTOS, { tipo: 'curso', valor: 'bd1' }), /Tipo de consulta desconocido/);
});
