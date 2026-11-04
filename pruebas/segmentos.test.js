// Pruebas de web/motor/segmentos.js (F1-05): datos de un día de AW → segmentos que cubren el rango sin huecos ni solapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  segmentar, recortarSegmentos, unirSegmentos, sumarPorEstado, esNavegador, dominioDe, duracionSeg,
} from '../web/motor/segmentos.js';
import { ESTADOS, SIN_AREA } from '../web/motor/tipos.js';
import { horaLocal, inicioDelDia, instanteLocal, sumarDias } from '../web/motor/fechas.js';
import { eventosEjemplo } from './ayudantes/ejemplo.js';

// ── Ayudantes para armar DatosDiaAW a mano ──

const F = '2026-10-20';
/** Instante de una hora de Lima ('HH:MM') del día F (o de otra fecha). */
const h = (hora, fecha = F) => instanteLocal(fecha, hora);
/** Evento de AW de [desde, hasta) con esos datos (timestamp ISO y duración en segundos, como en AW). */
const evento = (desde, hasta, data) => ({ timestamp: new Date(desde).toISOString(), duration: (hasta - desde) / 1000, data });
const ventana = (desde, hasta, app, title = 't', $category = ['Neutral', 'Otros']) => evento(desde, hasta, { app, title, $category });
const periodo = (desde, hasta, status = 'not-afk') => evento(desde, hasta, { status });
const pestaña = (desde, hasta, url, extra = {}) =>
  evento(desde, hasta, { url, title: 'pestaña', audible: false, incognito: false, tabCount: 3, ...extra });

/** Vista corta de los segmentos para comparar: [desde, hasta, clase, app]. */
const corto = (segmentos) => segmentos.map((s) => [horaLocal(s.inicio), horaLocal(s.fin), s.clase, s.app]);

/** La lista cubre [inicio, fin) exacto: empieza y termina ahí, cada uno empieza donde termina el anterior. */
function comprobarCobertura(segmentos, inicio, fin) {
  assert.ok(segmentos.length > 0);
  assert.equal(segmentos[0].inicio, inicio);
  assert.equal(segmentos.at(-1).fin, fin);
  let totalMs = 0;
  segmentos.forEach((s, i) => {
    assert.ok(s.fin > s.inicio, `el segmento ${i} tiene duración`);
    if (i > 0) assert.equal(s.inicio, segmentos[i - 1].fin, `sin hueco ni solape antes del segmento ${i}`);
    assert.ok(ESTADOS.includes(s.clase));
    totalMs += s.fin - s.inicio;
  });
  assert.equal(totalMs, fin - inicio); // la suma da la duración del rango
  const porEstado = sumarPorEstado(segmentos);
  assert.equal(Object.values(porEstado).reduce((a, b) => a + b, 0), (fin - inicio) / 1000);
}

// ── segmentar ──

test('segmentar cubre el rango exacto: ventanas, AFK, PC en uso sin ventana y sin PC', () => {
  const datos = {
    eventos: [
      ventana(h('09:00'), h('09:30'), 'Code.exe', 'motor.js', ['Estudio', 'Programación']),
      ventana(h('09:30'), h('10:30'), 'Spotify.exe', 'lista', ['Distracción', 'Video']),
      ventana(h('12:00'), h('12:30'), 'claude.exe', 'chat', ['IA']),
    ],
    navegador: [],
    no_afk: [periodo(h('09:00'), h('11:00')), periodo(h('12:00'), h('13:00'))],
    afk: [periodo(h('11:00'), h('12:00'), 'afk')],
  };
  const segmentos = segmentar(datos, { inicio: h('08:00'), fin: h('14:00') });
  comprobarCobertura(segmentos, h('08:00'), h('14:00'));
  assert.deepEqual(corto(segmentos), [
    ['08:00', '09:00', 'sin-pc', null],
    ['09:00', '09:30', 'estudio', 'Code.exe'],
    ['09:30', '10:30', 'distraccion', 'Spotify.exe'],
    ['10:30', '11:00', 'sin-clasificar', null],   // en uso, pero sin evento de ventana
    ['11:00', '12:00', 'afk', null],
    ['12:00', '12:30', 'ia', 'claude.exe'],
    ['12:30', '13:00', 'sin-clasificar', null],
    ['13:00', '14:00', 'sin-pc', null],
  ]);
  // Forma completa de un segmento de ventana y de los huecos.
  assert.deepEqual(segmentos[1], {
    inicio: h('09:00'), fin: h('09:30'), clase: 'estudio', categoria: ['Estudio', 'Programación'], area: 'Programación',
    app: 'Code.exe', titulo: 'motor.js', url: null, dominio: null, audible: false, incognito: false,
  });
  assert.deepEqual(segmentos[3].categoria, ['Uncategorized']);
  assert.equal(segmentos[3].titulo, null);
  for (const i of [0, 4, 7]) {
    assert.equal(segmentos[i].categoria, null);
    assert.equal(segmentos[i].area, null);
  }
});

test('segmentar: si un hueco está en un periodo AFK y en uno no AFK, gana AFK', () => {
  const datos = {
    eventos: [],
    no_afk: [periodo(h('10:00'), h('12:00'))],
    afk: [periodo(h('11:00'), h('11:30'), 'afk')],
  };
  assert.deepEqual(corto(segmentar(datos, { inicio: h('10:00'), fin: h('12:00') })), [
    ['10:00', '11:00', 'sin-clasificar', null],
    ['11:00', '11:30', 'afk', null],
    ['11:30', '12:00', 'sin-clasificar', null],
  ]);
});

test('segmentar: solapes, manda el que empezó antes; uno tapado entero se descarta', () => {
  const datos = {
    eventos: [
      ventana(h('10:20'), h('10:40'), 'B.exe'),          // empieza dentro de A: se recorta a 10:30–10:40
      ventana(h('10:00'), h('10:30'), 'A.exe'),
      ventana(h('10:05'), h('10:10'), 'C.exe'),          // dentro de A: se descarta
    ],
  };
  assert.deepEqual(corto(segmentar(datos, { inicio: h('10:00'), fin: h('10:40') })), [
    ['10:00', '10:30', 'neutral', 'A.exe'],
    ['10:30', '10:40', 'neutral', 'B.exe'],
  ]);
});

test('segmentar: eventos repetidos con la misma marca de tiempo y eventos de duración 0', () => {
  const datos = {
    eventos: [
      ventana(h('09:00'), h('09:00'), 'Cero.exe'),       // duración 0, con la misma marca que los siguientes
      ventana(h('09:00'), h('09:10'), 'A.exe'),
      ventana(h('09:00'), h('09:10'), 'A.exe'),          // repetido exacto
      ventana(h('09:10'), h('09:12'), 'Corto.exe'),
      ventana(h('09:10'), h('09:20'), 'Largo.exe'),      // misma marca: manda el más largo
      ventana(h('09:25'), h('09:25'), 'Cero.exe'),       // duración 0 en un hueco
    ],
    no_afk: [periodo(h('09:00'), h('09:30'))],
  };
  const segmentos = segmentar(datos, { inicio: h('09:00'), fin: h('09:30') });
  assert.deepEqual(corto(segmentos), [
    ['09:00', '09:10', 'neutral', 'A.exe'],
    ['09:10', '09:20', 'neutral', 'Largo.exe'],
    ['09:20', '09:30', 'sin-clasificar', null],
  ]);
});

test('segmentar: los eventos que salen del rango se recortan; las duraciones con decimales se redondean al ms', () => {
  const datos = {
    eventos: [
      ventana(h('07:50'), h('08:10'), 'Antes.exe'),
      { timestamp: new Date(h('08:10')).toISOString(), duration: 33.5434, data: { app: 'Decimal.exe', title: 't', $category: ['Neutral'] } },
      ventana(h('08:50'), h('09:10'), 'Despues.exe'),
    ],
  };
  const segmentos = segmentar(datos, { inicio: h('08:00'), fin: h('09:00') });
  comprobarCobertura(segmentos, h('08:00'), h('09:00'));
  assert.equal(segmentos[0].app, 'Antes.exe');
  assert.equal(segmentos[0].inicio, h('08:00'));
  assert.equal(segmentos[1].fin - segmentos[1].inicio, 33543);
  assert.equal(segmentos.at(-1).app, 'Despues.exe');
});

test('segmentar: recorta en ahora (hoy) y devuelve [] si ahora ≤ inicio o el rango está vacío', () => {
  const datos = { eventos: [ventana(h('10:00'), h('11:00'), 'A.exe')], no_afk: [periodo(h('10:00'), h('11:00'))] };
  const segmentos = segmentar(datos, { inicio: h('09:00'), fin: h('12:00'), ahora: h('10:15') });
  comprobarCobertura(segmentos, h('09:00'), h('10:15'));
  assert.deepEqual(corto(segmentos), [['09:00', '10:00', 'sin-pc', null], ['10:00', '10:15', 'neutral', 'A.exe']]);
  assert.deepEqual(segmentar(datos, { inicio: h('09:00'), fin: h('12:00'), ahora: h('09:00') }), []);
  assert.deepEqual(segmentar(datos, { inicio: h('09:00'), fin: h('12:00'), ahora: h('08:00') }), []);
  assert.deepEqual(segmentar(datos, { inicio: h('12:00'), fin: h('12:00') }), []);
});

test('segmentar: clase y área según la categoría de AW', () => {
  const categorias = [
    [['Estudio', 'Matemáticas'], 'estudio', 'Matemáticas'],
    [['Estudio'], 'estudio', SIN_AREA],
    [['Distracción', 'Redes'], 'distraccion', null],
    [['Neutral', 'Sistema'], 'neutral', null],
    [['IA'], 'ia', null],
    [['Uncategorized'], 'sin-clasificar', null],
    [['Juegos'], 'sin-clasificar', null],        // primer nivel desconocido
    [['constructor'], 'sin-clasificar', null],   // no confundir con lo heredado de Object
    [[], 'sin-clasificar', null],
    [undefined, 'sin-clasificar', null],         // sin $category
  ];
  categorias.forEach(([categoria, clase, area], i) => {
    const datos = { eventos: [evento(h('10:00'), h('10:10'), { app: 'x.exe', title: 't', $category: categoria })] };
    const [segmento] = segmentar(datos, { inicio: h('10:00'), fin: h('10:10') });
    assert.equal(segmento.clase, clase, `caso ${i}`);
    assert.equal(segmento.area, area, `caso ${i}`);
  });
});

test('segmentar: en un navegador, url, dominio, audible e incognito de la pestaña con más solape', () => {
  const datos = {
    eventos: [
      ventana(h('10:00'), h('10:30'), 'chrome.exe', 'Video - YouTube'),
      ventana(h('10:30'), h('10:40'), 'chrome.exe', 'Nueva pestaña'),   // sin evento web
      ventana(h('10:40'), h('10:50'), 'Code.exe', 'motor.js'),         // no es navegador
    ],
    navegador: [
      pestaña(h('09:55'), h('10:05'), 'https://ejemplo.org/a'),                                    // 5 min
      pestaña(h('10:05'), h('10:30'), 'https://www.YouTube.com/watch?v=1', { audible: true, incognito: true }), // 25 min
      pestaña(h('10:40'), h('10:50'), 'https://ejemplo.org/b'),
    ],
  };
  const [youtube, sinWeb, code] = segmentar(datos, { inicio: h('10:00'), fin: h('10:50') });
  assert.equal(youtube.url, 'https://www.YouTube.com/watch?v=1');
  assert.equal(youtube.dominio, 'youtube.com');
  assert.equal(youtube.audible, true);
  assert.equal(youtube.incognito, true);
  assert.equal(youtube.titulo, 'Video - YouTube'); // el título es el de la ventana
  assert.deepEqual([sinWeb.url, sinWeb.dominio, sinWeb.audible, sinWeb.incognito], [null, null, false, false]);
  assert.deepEqual([code.url, code.dominio, code.audible], [null, null, false]);
});

test('segmentar: segmentos iguales que se tocan se unen; con otro título u otra url, no', () => {
  const datos = {
    eventos: [
      ventana(h('10:00'), h('10:05'), 'Code.exe', 'a.js'),
      ventana(h('10:05'), h('10:10'), 'Code.exe', 'a.js'),   // igual al anterior: se une
      ventana(h('10:10'), h('10:15'), 'Code.exe', 'b.js'),   // otro título
      ventana(h('10:15'), h('10:20'), 'chrome.exe', 'Docs'),
      ventana(h('10:20'), h('10:25'), 'chrome.exe', 'Docs'), // misma ventana, otra url
    ],
    navegador: [pestaña(h('10:15'), h('10:20'), 'https://a.org/1'), pestaña(h('10:20'), h('10:25'), 'https://a.org/2')],
    afk: [periodo(h('10:25'), h('10:40'), 'afk'), periodo(h('10:40'), h('11:00'), 'afk')], // dos AFK seguidos: uno solo
  };
  const segmentos = segmentar(datos, { inicio: h('10:00'), fin: h('11:00') });
  assert.deepEqual(segmentos.map((s) => [horaLocal(s.inicio), horaLocal(s.fin), s.titulo, s.url]), [
    ['10:00', '10:10', 'a.js', null],
    ['10:10', '10:15', 'b.js', null],
    ['10:15', '10:20', 'Docs', 'https://a.org/1'],
    ['10:20', '10:25', 'Docs', 'https://a.org/2'],
    ['10:25', '11:00', null, null],
  ]);
});

test('segmentar: si faltan afk, no_afk o navegador cuentan como listas vacías; sin datos, todo es sin PC', () => {
  const soloEventos = segmentar({ eventos: [ventana(h('10:00'), h('10:30'), 'chrome.exe')] }, { inicio: h('09:00'), fin: h('11:00') });
  assert.deepEqual(corto(soloEventos), [
    ['09:00', '10:00', 'sin-pc', null], ['10:00', '10:30', 'neutral', 'chrome.exe'], ['10:30', '11:00', 'sin-pc', null],
  ]);
  assert.deepEqual(corto(segmentar(null, { inicio: h('09:00'), fin: h('11:00') })), [['09:00', '11:00', 'sin-pc', null]]);
  assert.deepEqual(corto(segmentar({}, { inicio: h('09:00'), fin: h('11:00') })), [['09:00', '11:00', 'sin-pc', null]]);
});

test('segmentar no modifica sus entradas', () => {
  const datos = {
    eventos: [ventana(h('10:20'), h('10:40'), 'chrome.exe'), ventana(h('10:00'), h('10:30'), 'chrome.exe')],
    navegador: [pestaña(h('10:00'), h('10:40'), 'https://a.org')],
    no_afk: [periodo(h('10:00'), h('11:00'))],
    afk: [periodo(h('11:00'), h('11:10'), 'afk')],
  };
  const copia = structuredClone(datos);
  const segmentos = segmentar(datos, { inicio: h('10:00'), fin: h('12:00') });
  assert.deepEqual(datos, copia);
  segmentos[0].categoria.push('cambiado');
  assert.deepEqual(datos, copia); // la categoría del segmento es una copia
});

test('segmentar con muchos eventos: un solo recorrido (no compara cada ventana con cada pestaña)', () => {
  const n = 40000;
  const inicio = h('00:00');
  const eventos = [];
  const navegador = [];
  for (let i = 0; i < n; i++) {
    eventos.push(ventana(inicio + i * 2000, inicio + i * 2000 + 2000, 'chrome.exe', `t${i}`));
    navegador.push(pestaña(inicio + i * 2000, inicio + i * 2000 + 2000, `https://a.org/${i}`));
  }
  const antes = performance.now();
  const segmentos = segmentar({ eventos, navegador }, { inicio, fin: inicio + n * 2000 });
  const ms = performance.now() - antes;
  assert.equal(segmentos.length, n);
  assert.equal(segmentos[n - 1].url, `https://a.org/${n - 1}`);
  assert.ok(ms < 1500, `tardó ${Math.round(ms)} ms`);
});

test('segmentar con el día 10-15 de ejemplo (duración 0 y marcas repetidas): cubre el día sin solapes', () => {
  const fecha = '2026-10-15';
  const afk = eventosEjemplo('aw-watcher-afk_ejemplo');
  const datos = {
    eventos: eventosEjemplo('aw-watcher-window_ejemplo').map((e) => ({ ...e, data: { ...e.data, $category: ['Uncategorized'] } })),
    navegador: eventosEjemplo('aw-watcher-web-chrome_ejemplo'),
    no_afk: afk.filter((e) => e.data.status === 'not-afk'),
    afk: afk.filter((e) => e.data.status === 'afk'),
  };
  const inicio = inicioDelDia(fecha);
  const fin = inicioDelDia(sumarDias(fecha, 1));
  const segmentos = segmentar(datos, { inicio, fin });
  comprobarCobertura(segmentos, inicio, fin);
  assert.ok(segmentos.some((s) => s.url !== null && s.dominio !== null), 'hay segmentos de Chrome con url');
});

// ── recortarSegmentos ──

const seg = (desde, hasta, clase = 'neutral', app = 'x.exe') => ({
  inicio: desde, fin: hasta, clase, categoria: clase === 'sin-pc' || clase === 'afk' ? null : ['Neutral'], area: null,
  app: clase === 'sin-pc' || clase === 'afk' ? null : app, titulo: null, url: null, dominio: null, audible: false, incognito: false,
});

test('recortarSegmentos recorta al rango y rellena con sin PC lo que falte', () => {
  const segmentos = [seg(h('08:00'), h('10:00'), 'neutral', 'A.exe'), seg(h('11:00'), h('13:00'), 'estudio', 'B.exe')];
  const recortados = recortarSegmentos(segmentos, h('09:00'), h('14:00'));
  comprobarCobertura(recortados, h('09:00'), h('14:00'));
  assert.deepEqual(corto(recortados), [
    ['09:00', '10:00', 'neutral', 'A.exe'],
    ['10:00', '11:00', 'sin-pc', null],
    ['11:00', '13:00', 'estudio', 'B.exe'],
    ['13:00', '14:00', 'sin-pc', null],
  ]);
  // Un sin PC del relleno se une con uno que ya estaba.
  const conSinPc = recortarSegmentos([seg(h('09:00'), h('10:00'), 'sin-pc')], h('08:00'), h('11:00'));
  assert.deepEqual(corto(conSinPc), [['08:00', '11:00', 'sin-pc', null]]);
  assert.deepEqual(segmentos[0].inicio, h('08:00')); // no modifica la entrada
});

test('recortarSegmentos: lista vacía → un solo sin PC; fin ≤ inicio → []', () => {
  assert.deepEqual(corto(recortarSegmentos([], h('09:00'), h('10:00'))), [['09:00', '10:00', 'sin-pc', null]]);
  assert.deepEqual(recortarSegmentos([seg(h('09:00'), h('10:00'))], h('10:00'), h('10:00')), []);
  assert.deepEqual(recortarSegmentos([seg(h('09:00'), h('10:00'))], h('11:00'), h('10:00')), []);
});

// ── unirSegmentos ──

test('unirSegmentos une las listas de días seguidos y los segmentos iguales que se tocan (sin PC que cruza las 04:00)', () => {
  const D = sumarDias(F, 1);
  const S = inicioDelDia(D); // las 04:00 entre F y D
  const dia1 = [seg(h('20:00'), h('23:00'), 'neutral', 'A.exe'), seg(h('23:00'), S, 'sin-pc')];
  const dia2 = [seg(S, h('09:00', D), 'sin-pc'), seg(h('09:00', D), h('10:00', D), 'neutral', 'A.exe')];
  const unidos = unirSegmentos(dia2, dia1); // en desorden: se ordenan
  assert.deepEqual(unidos.map((s) => [s.inicio, s.fin, s.clase]), [
    [h('20:00'), h('23:00'), 'neutral'],
    [h('23:00'), h('09:00', D), 'sin-pc'],
    [h('09:00', D), h('10:00', D), 'neutral'],
  ]);
  assert.equal(dia1[1].fin, S); // no modifica las entradas
  assert.deepEqual(unirSegmentos(), []);
  assert.deepEqual(unirSegmentos([], null, undefined), []);
});

test('unirSegmentos: si dos listas se solapan, manda el que empezó antes', () => {
  const unidos = unirSegmentos([seg(h('09:00'), h('10:00'), 'neutral', 'A.exe')], [seg(h('09:30'), h('11:00'), 'neutral', 'B.exe')]);
  assert.deepEqual(corto(unidos), [['09:00', '10:00', 'neutral', 'A.exe'], ['10:00', '11:00', 'neutral', 'B.exe']]);
});

// ── sumarPorEstado y ayudantes ──

test('sumarPorEstado: las 7 claves, en segundos', () => {
  const vacio = sumarPorEstado([]);
  assert.deepEqual(Object.keys(vacio), ESTADOS);
  assert.ok(Object.values(vacio).every((v) => v === 0));
  const sumas = sumarPorEstado([
    seg(h('09:00'), h('09:30'), 'estudio'), seg(h('09:30'), h('09:45'), 'afk'), seg(h('10:00'), h('10:30'), 'estudio'),
    seg(h('10:30'), h('10:30') + 1500, 'sin-pc'),
  ]);
  assert.equal(sumas.estudio, 3600);
  assert.equal(sumas.afk, 900);
  assert.equal(sumas['sin-pc'], 1.5);
  assert.equal(sumas.ia, 0);
});

test('esNavegador reconoce los navegadores de REGEX_APP_NAVEGADOR', () => {
  for (const app of ['chrome.exe', 'Google Chrome', 'msedge.exe', 'firefox.exe', 'brave.exe', 'vivaldi.exe', 'opera.exe']) {
    assert.ok(esNavegador(app), app);
  }
  for (const app of ['Code.exe', 'explorer.exe', '', null, undefined]) assert.ok(!esNavegador(app), String(app));
});

test('dominioDe: hostname en minúsculas, sin "www."; null si no hay', () => {
  assert.equal(dominioDe('https://www.YouTube.com/watch?v=1'), 'youtube.com');
  assert.equal(dominioDe('https://docs.ejemplo.org:8080/a'), 'docs.ejemplo.org');
  assert.equal(dominioDe('http://localhost:5600/pages/rastreador/'), 'localhost');
  assert.equal(dominioDe('ejemplo.org/sin-protocolo'), 'ejemplo.org');
  assert.equal(dominioDe('about:blank'), null);
  assert.equal(dominioDe('file:///C:/notas.txt'), null);
  assert.equal(dominioDe(''), null);
  assert.equal(dominioDe(null), null);
});

test('duracionSeg', () => {
  assert.equal(duracionSeg({ inicio: 1000, fin: 61000 }), 60);
  assert.equal(duracionSeg({ inicio: 0, fin: 1500 }), 1.5);
});
