// Pruebas de web/motor/simulador.js: simular y compararNiveles (§11).
//
// El día de prueba está armado a mano y se parece al martes 10-06 de datos-ejemplo/README.md ("día malo"):
// bloque de DBP (17:00–19:00, fricción en el plan) con mucha distracción, y bloque de Prog III que cruza la
// medianoche (23:30–00:30, aviso en el plan) con 40 min de YouTube al final.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simular, compararNiveles } from '../web/motor/simulador.js';
import { configuracionVigente } from '../web/motor/niveles.js';
import { instanteLocal } from '../web/motor/fechas.js';

const F = '2026-10-06';
const F2 = '2026-10-07';
const MIN = 60; // un minuto, en segundos
const t = (hhmm, fecha = F) => instanteLocal(fecha, hhmm);

/** Congela un objeto entero: si el código lo modifica, la prueba falla con TypeError. */
function congelar(objeto) {
  for (const valor of Object.values(objeto)) if (valor && typeof valor === 'object') congelar(valor);
  return Object.freeze(objeto);
}

// ── Actividades ──
const YT = { clase: 'distraccion', categoria: ['Distracción', 'Video'], app: 'chrome.exe', titulo: 'Video - YouTube', url: 'https://www.youtube.com/watch?v=1', dominio: 'youtube.com' };
const X = { clase: 'distraccion', categoria: ['Distracción', 'Redes'], app: 'chrome.exe', titulo: 'Inicio / X', url: 'https://x.com/home', dominio: 'x.com' };
const CODE = { clase: 'estudio', categoria: ['Estudio', 'Programación'], area: 'Programación', app: 'Code.exe', titulo: 'app.js', url: null, dominio: null };
const CLAUDE = { clase: 'ia', categoria: ['IA'], app: 'chrome.exe', titulo: 'Claude', url: 'https://claude.ai/chat/1', dominio: 'claude.ai' };
const HERR = { clase: 'sin-clasificar', categoria: ['Uncategorized'], app: 'herramienta.exe', titulo: 'Ventana', url: null, dominio: null };
const EDGE = { clase: 'estudio', categoria: ['Estudio', 'Programación'], area: 'Programación', app: 'msedge.exe', titulo: 'Guía de Spring - Edge', url: null, dominio: null };
const JUEGO = { clase: 'distraccion', categoria: ['Distracción', 'Juegos'], app: 'juego.exe', titulo: 'Juego', url: null, dominio: null };
const AFK = { clase: 'afk', categoria: null, app: null, titulo: null, url: null, dominio: null };

const ID_DBP = `b-dbp-mar@${F}`;
const ID_P3 = `b-p3-mar-noche@${F}`;
const ID_LAB = `c-dbp-mar-1400@${F}`;

/** SegmentoConContexto armado a mano. */
function seg(inicio, fin, actividad, { bloqueId = null, claseId = null, cursoId = null } = {}) {
  return {
    inicio, fin, area: null, audible: false, incognito: false, ...actividad,
    contexto: bloqueId ? 'bloque' : claseId ? 'clase' : 'libre', bloqueId, cursoId, claseId, rutinaId: null,
  };
}
const enDbp = { bloqueId: ID_DBP, cursoId: 'dbp' };
const enP3 = { bloqueId: ID_P3, cursoId: 'p3' };

/** BloqueDia armado a mano. */
function bloque(id, bloqueId, curso, inicio, fin, nivel) {
  return {
    id, bloqueId, tipo: 'estudio_pc', curso, inicio, fin, finPlan: fin, nivel, subidoPorExcepcion: false,
    objetivo: '', porQue: '', terminadoAntes: null,
  };
}

const ITEMS = {
  fecha: F,
  enCiclo: true,
  excepciones: [],
  bloques: [
    bloque(ID_DBP, 'b-dbp-mar', 'dbp', t('17:00'), t('19:00'), 'friccion'),
    bloque(ID_P3, 'b-p3-mar-noche', 'p3', t('23:30'), t('00:30', F2), 'aviso'),
  ],
  clases: [{ id: ID_LAB, claseId: 'c-dbp-mar-1400', curso: 'dbp', tipo: 'laboratorio', inicio: t('14:00'), fin: t('16:00'), lugar: 'UTEC', usaPc: false }],
  rutinas: [],
};

const SEGMENTOS = [
  seg(t('14:30'), t('15:00'), YT, { claseId: ID_LAB, cursoId: 'dbp' }), // clase sin PC: no se interviene
  seg(t('16:30'), t('17:00'), YT),                                     // libre: solo se mide
  seg(t('17:00'), t('17:25'), YT, enDbp),
  seg(t('17:25'), t('17:40'), X, enDbp),
  seg(t('17:40'), t('18:20'), CODE, enDbp),
  seg(t('18:20'), t('18:25'), CLAUDE, enDbp),
  seg(t('18:25'), t('18:45'), YT, enDbp),
  seg(t('18:45'), t('18:50'), HERR, enDbp),
  seg(t('18:50'), t('18:55'), EDGE, enDbp),                            // Edge sin extensión (sin URL)
  seg(t('18:55'), t('19:00'), CODE, enDbp),
  seg(t('19:00'), t('20:00'), JUEGO),
  seg(t('20:00'), t('23:30'), AFK),
  seg(t('23:30'), t('23:50'), CODE, enP3),
  seg(t('23:50'), t('00:30', F2), YT, enP3),                           // 40 min seguidos: los permisos vencen dentro
  seg(t('00:30', F2), t('01:00', F2), YT),
];

const CONFIG = configuracionVigente(null, F);
const ENTRADA = congelar({ segmentos: SEGMENTOS, items: ITEMS, config: CONFIG });

/** [acción, hora local] de las intervenciones de un ítem, para comparar fácil. */
function linea(resultado, itemId) {
  return resultado.intervenciones
    .filter((i) => (i.bloqueId ?? i.claseId) === itemId)
    .map((i) => [i.accion, new Date(i.instante - 5 * 3600 * 1000).toISOString().slice(11, 16)]);
}

// ── Cada nivel sobre el día de prueba ──

test('nivel del plan: DBP en fricción gasta los 5 comodines; Prog III en aviso escala y después corta', () => {
  const r = simular(ENTRADA);
  assert.equal(r.nivel, 'plan');
  assert.deepEqual(linea(r, ID_DBP), [
    ['friccion', '17:00'], ['pase', '17:00'], ['friccion', '17:10'], ['pase', '17:10'], ['friccion', '17:20'], ['pase', '17:20'],
    ['friccion', '17:25'], ['pase', '17:25'], ['friccion', '17:35'], ['pase', '17:35'],
    ['friccion', '18:25'], // sin comodines: se corta
  ]);
  // Los permisos de 5 min vencen dentro del segmento de 40 min: 3 avisos, escalamiento y fricción.
  assert.deepEqual(linea(r, ID_P3), [
    ['aviso', '23:50'], ['aviso', '23:55'], ['aviso', '00:00'], ['escalamiento', '00:00'], ['friccion', '00:05'],
  ]);
  assert.deepEqual(r.porItem[ID_DBP], { avisos: 0, fricciones: 6, bloqueos: 0, pases: 5, escalo: false, cortadoSeg: 20 * MIN });
  assert.deepEqual(r.porItem[ID_P3], { avisos: 3, fricciones: 1, bloqueos: 0, pases: 0, escalo: true, cortadoSeg: 25 * MIN });
  assert.deepEqual(r.totales, { avisos: 3, fricciones: 7, bloqueos: 0, pases: 5, comodinesUsados: 5, cortadoSeg: 45 * MIN });
  assert.equal(r.cortadoSeg, 45 * MIN);
  assert.deepEqual(r.cortes, [
    { inicio: t('18:25'), fin: t('18:45'), itemId: ID_DBP, objetivo: 'web:youtube.com' },
    { inicio: t('00:05', F2), fin: t('00:30', F2), itemId: ID_P3, objetivo: 'web:youtube.com' },
  ]);
  // La clase sin PC no aparece en porItem ni tiene intervenciones.
  assert.equal(r.porItem[ID_LAB], undefined);
  assert.deepEqual(linea(r, ID_LAB), []);
});

test('pase de fricción: la intervención guarda el motivo, el bloque y la actividad', () => {
  const pase = simular(ENTRADA).intervenciones.find((i) => i.accion === 'pase');
  assert.deepEqual(pase, {
    instante: t('17:00'), bloqueId: ID_DBP, claseId: null, nivel: 'friccion', accion: 'pase', objetivo: 'web:youtube.com',
    app: 'chrome.exe', url: 'https://www.youtube.com/watch?v=1', titulo: 'Video - YouTube', motivo: 'Pase simulado',
  });
});

test('nivel aviso forzado: los dos bloques escalan; solo se corta cuando ya no quedan comodines', () => {
  const r = simular({ ...ENTRADA, nivel: 'aviso' });
  assert.equal(r.nivel, 'aviso');
  assert.deepEqual(linea(r, ID_DBP), [
    ['aviso', '17:00'], ['aviso', '17:05'], ['aviso', '17:10'], ['escalamiento', '17:10'],
    ['friccion', '17:15'], ['pase', '17:15'],
    ['friccion', '17:25'], ['pase', '17:25'], ['friccion', '17:35'], ['pase', '17:35'],
    ['friccion', '18:25'], ['pase', '18:25'], ['friccion', '18:35'], ['pase', '18:35'],
  ]);
  assert.deepEqual(r.porItem[ID_DBP], { avisos: 3, fricciones: 5, bloqueos: 0, pases: 5, escalo: true, cortadoSeg: 0 });
  assert.deepEqual(r.porItem[ID_P3], { avisos: 3, fricciones: 1, bloqueos: 0, pases: 0, escalo: true, cortadoSeg: 25 * MIN });
  assert.deepEqual(r.totales, { avisos: 6, fricciones: 6, bloqueos: 0, pases: 5, comodinesUsados: 5, cortadoSeg: 25 * MIN });
});

test('nivel fricción forzado: igual que el plan en DBP; Prog III se corta entero', () => {
  const r = simular({ ...ENTRADA, nivel: 'friccion' });
  assert.deepEqual(r.porItem[ID_DBP], { avisos: 0, fricciones: 6, bloqueos: 0, pases: 5, escalo: false, cortadoSeg: 20 * MIN });
  assert.deepEqual(r.porItem[ID_P3], { avisos: 0, fricciones: 1, bloqueos: 0, pases: 0, escalo: false, cortadoSeg: 40 * MIN });
  assert.deepEqual(r.totales, { avisos: 0, fricciones: 7, bloqueos: 0, pases: 5, comodinesUsados: 5, cortadoSeg: 60 * MIN });
});

test('nivel total forzado: se corta la distracción, lo sin clasificar y Edge sin extensión; la IA y el estudio no', () => {
  const r = simular({ ...ENTRADA, nivel: 'total' });
  assert.deepEqual(r.cortes, [
    { inicio: t('17:00'), fin: t('17:25'), itemId: ID_DBP, objetivo: 'web:youtube.com' },
    { inicio: t('17:25'), fin: t('17:40'), itemId: ID_DBP, objetivo: 'web:x.com' },
    { inicio: t('18:25'), fin: t('18:45'), itemId: ID_DBP, objetivo: 'web:youtube.com' },
    { inicio: t('18:45'), fin: t('18:50'), itemId: ID_DBP, objetivo: 'app:herramienta.exe' },
    { inicio: t('18:50'), fin: t('18:55'), itemId: ID_DBP, objetivo: 'app:msedge.exe' },
    { inicio: t('23:50'), fin: t('00:30', F2), itemId: ID_P3, objetivo: 'web:youtube.com' },
  ]);
  assert.deepEqual(r.intervenciones.filter((i) => i.bloqueId === ID_DBP).map((i) => i.motivo),
    ['distraccion', 'distraccion', 'distraccion', 'sin_clasificar', 'sin_extension']);
  assert.deepEqual(r.porItem[ID_DBP], { avisos: 0, fricciones: 0, bloqueos: 5, pases: 0, escalo: false, cortadoSeg: 70 * MIN });
  assert.deepEqual(r.porItem[ID_P3], { avisos: 0, fricciones: 0, bloqueos: 1, pases: 0, escalo: false, cortadoSeg: 40 * MIN });
  assert.deepEqual(r.totales, { avisos: 0, fricciones: 0, bloqueos: 6, pases: 0, comodinesUsados: 0, cortadoSeg: 110 * MIN });
});

test('nivel ninguno forzado: no hay intervenciones', () => {
  const r = simular({ ...ENTRADA, nivel: 'ninguno' });
  assert.deepEqual(r.intervenciones, []);
  assert.equal(r.cortadoSeg, 0);
  assert.deepEqual(Object.keys(r.porItem).sort(), [ID_DBP, ID_P3].sort());
});

// ── compararNiveles ──

test('compararNiveles: los tres niveles del mismo día, de menos a más tiempo cortado', () => {
  const c = compararNiveles(ENTRADA);
  assert.deepEqual(Object.keys(c), ['aviso', 'friccion', 'total']);
  assert.equal(c.aviso.nivel, 'aviso');
  assert.equal(c.friccion.nivel, 'friccion');
  assert.equal(c.total.nivel, 'total');
  assert.deepEqual([c.aviso.cortadoSeg, c.friccion.cortadoSeg, c.total.cortadoSeg], [25 * MIN, 60 * MIN, 110 * MIN]);
  assert.deepEqual(c.aviso, simular({ ...ENTRADA, nivel: 'aviso' }));
  // El nivel que traiga la entrada se ignora.
  assert.deepEqual(compararNiveles({ ...ENTRADA, nivel: 'total' }), c);
});

// ── Determinismo y entradas ──

test('el mismo día con el mismo nivel da siempre el mismo resultado y no modifica la entrada', () => {
  // ENTRADA está congelada: si simular la modificara, lanzaría TypeError.
  for (const nivel of ['plan', 'aviso', 'friccion', 'total']) {
    assert.deepEqual(simular({ ...ENTRADA, nivel }), simular({ ...ENTRADA, nivel }));
  }
  assert.deepEqual(compararNiveles(ENTRADA), compararNiveles(ENTRADA));
  // El orden en que llegan los segmentos no cambia el resultado.
  const desordenados = { ...ENTRADA, segmentos: [...SEGMENTOS].reverse() };
  assert.deepEqual(simular(desordenados), simular(ENTRADA));
});

test('con nivel plan respeta el nivel elegido por bloque y las excepciones; un nivel forzado los ignora', () => {
  const config = { ...structuredClone(CONFIG), bloques: { 'b-dbp-mar': 'total' } };
  assert.equal(simular({ ...ENTRADA, config }).porItem[ID_DBP].bloqueos, 5);
  assert.equal(simular({ ...ENTRADA, config, nivel: 'aviso' }).porItem[ID_DBP].bloqueos, 0);

  const items = { ...ITEMS, bloques: ITEMS.bloques.map((b) => (b.id === ID_P3 ? { ...b, subidoPorExcepcion: true } : b)) };
  assert.equal(simular({ ...ENTRADA, items }).porItem[ID_P3].bloqueos, 1);
  assert.equal(simular({ ...ENTRADA, items, nivel: 'aviso' }).porItem[ID_P3].bloqueos, 0);
});

// ── Política y comodines ──

test('sin continuar tras el aviso: se corta todo el tiempo en ese objetivo', () => {
  const r = simular({ ...ENTRADA, nivel: 'aviso', politica: { continuarAviso: false } });
  assert.deepEqual(linea(r, ID_DBP), [['aviso', '17:00'], ['aviso', '17:25'], ['aviso', '18:25'], ['escalamiento', '18:25']]);
  assert.deepEqual(linea(r, ID_P3), [['aviso', '23:50']]);
  assert.equal(r.porItem[ID_DBP].cortadoSeg, (25 + 15 + 20) * MIN);
  assert.equal(r.porItem[ID_P3].cortadoSeg, 40 * MIN);
  assert.equal(r.totales.pases, 0);
});

test('sin usar pases en fricción: se corta como si no hubiera comodines', () => {
  const r = simular({ ...ENTRADA, nivel: 'friccion', politica: { usarPases: false } });
  assert.equal(r.totales.pases, 0);
  assert.equal(r.totales.comodinesUsados, 0);
  assert.equal(r.porItem[ID_DBP].cortadoSeg, (25 + 15 + 20) * MIN);
  assert.equal(r.cortadoSeg, (25 + 15 + 20 + 40) * MIN);
  assert.deepEqual(simular({ ...ENTRADA, nivel: 'friccion', comodines: 0 }).cortes, r.cortes);
});

test('con pocos comodines: se usan los que hay y después se corta', () => {
  const r = simular({ ...ENTRADA, nivel: 'friccion', comodines: 2 });
  assert.equal(r.totales.pases, 2);
  assert.equal(r.totales.comodinesUsados, 2);
  // 17:00 y 17:10 con pase; a las 17:20 ya no quedan: se cortan 5 min de YouTube, 15 de X, 20 de YouTube y 40 en Prog III.
  assert.deepEqual(r.cortes[0], { inicio: t('17:20'), fin: t('17:25'), itemId: ID_DBP, objetivo: 'web:youtube.com' });
  assert.equal(r.cortadoSeg, (5 + 15 + 20 + 40) * MIN);
});

test('el permiso y el pase duran lo que dice la configuración', () => {
  const config = { ...structuredClone(CONFIG), aviso: { permiso_min: 20 }, friccion: { ...CONFIG.friccion, pase_min: 30 } };
  const r = simular({ ...ENTRADA, config, nivel: 'aviso' });
  // P3: aviso a las 23:50 con permiso de 20 min; el segundo a las 00:10 (y el permiso llega al fin del bloque).
  assert.deepEqual(linea(r, ID_P3), [['aviso', '23:50'], ['aviso', '00:10']]);
  const f = simular({ ...ENTRADA, config, nivel: 'friccion' });
  // DBP: un pase de 30 min a las 17:00 cubre todo el primer YouTube.
  assert.deepEqual(linea(f, ID_DBP).slice(0, 4), [['friccion', '17:00'], ['pase', '17:00'], ['friccion', '17:25'], ['pase', '17:25']]);
});

// ── Clases y casos borde ──

test('en una clase con PC solo hay avisos: cada vez que vence el permiso, otro aviso, sin escalar', () => {
  const idClase = `c-ing-sab-1500@${F}`;
  const items = {
    ...ITEMS, bloques: [],
    clases: [{ id: idClase, claseId: 'c-ing-sab-1500', curso: 'ing', tipo: 'teoria', inicio: t('15:00'), fin: t('17:00'), lugar: 'UTEC', usaPc: true }],
  };
  const segmentos = [seg(t('15:00'), t('16:00'), YT, { claseId: idClase, cursoId: 'ing' })];
  for (const nivel of ['plan', 'total']) {
    const r = simular({ segmentos, items, config: CONFIG, nivel });
    assert.equal(r.porItem[idClase].avisos, 12, nivel); // 15:00, 15:05, …, 15:55
    assert.equal(r.porItem[idClase].escalo, false);
    assert.equal(r.totales.fricciones + r.totales.bloqueos, 0);
    assert.equal(r.cortadoSeg, 0);
    assert.ok(r.intervenciones.every((i) => i.claseId === idClase && i.bloqueId === null));
  }
});

test('AFK y Sin PC dentro de un bloque no se deciden (ni siquiera en total)', () => {
  const segmentos = [
    seg(t('17:00'), t('18:00'), AFK, enDbp),
    seg(t('18:00'), t('19:00'), { ...AFK, clase: 'sin-pc' }, enDbp),
  ];
  const r = simular({ segmentos, items: ITEMS, config: CONFIG, nivel: 'total' });
  assert.deepEqual(r.intervenciones, []);
  assert.equal(r.cortadoSeg, 0);
});

test('un corte que sigue en el mismo objetivo se une con el anterior', () => {
  const segmentos = [
    seg(t('17:00'), t('17:10'), YT, enDbp),
    seg(t('17:10'), t('17:20'), { ...YT, titulo: 'Otro video', url: 'https://www.youtube.com/watch?v=2' }, enDbp),
  ];
  const r = simular({ segmentos, items: ITEMS, config: CONFIG, nivel: 'total' });
  assert.equal(r.totales.bloqueos, 1); // quedarse en la página de bloqueo no suma bloqueos
  assert.deepEqual(r.cortes, [{ inicio: t('17:00'), fin: t('17:20'), itemId: ID_DBP, objetivo: 'web:youtube.com' }]);
});

test('día sin segmentos, sin items o con segmentos de duración 0', () => {
  const vacio = simular({ segmentos: [], items: null, config: CONFIG });
  assert.deepEqual(vacio, {
    nivel: 'plan', intervenciones: [], cortes: [], cortadoSeg: 0, porItem: {},
    totales: { avisos: 0, fricciones: 0, bloqueos: 0, pases: 0, comodinesUsados: 0, cortadoSeg: 0 },
  });
  const cero = simular({ segmentos: [seg(t('17:00'), t('17:00'), YT, enDbp)], items: ITEMS, config: CONFIG, nivel: 'total' });
  assert.deepEqual(cero.intervenciones, []);
  // Sin config se usa la base inicial.
  assert.equal(simular({ segmentos: SEGMENTOS, items: ITEMS }).totales.comodinesUsados, 5);
});

test('un segmento con un bloque que no está en items cuenta como tiempo libre', () => {
  const segmentos = [seg(t('17:00'), t('17:30'), YT, { bloqueId: 'b-inexistente@2026-10-06' })];
  const r = simular({ segmentos, items: ITEMS, config: CONFIG, nivel: 'total' });
  assert.deepEqual(r.intervenciones, []);
});

test('un nivel desconocido lanza un error', () => {
  assert.throws(() => simular({ ...ENTRADA, nivel: 'maximo' }), /Nivel de simulación desconocido/);
});

test('cortadoSeg es exacto aunque los bordes no caigan en segundos redondos', () => {
  const segmentos = [
    seg(t('17:00') + 100, t('17:00') + 400, YT, enDbp),
    seg(t('17:00') + 400, t('17:00') + 600, X, enDbp),
  ];
  const r = simular({ segmentos, items: ITEMS, config: CONFIG, nivel: 'total' });
  assert.equal(r.cortadoSeg, 0.5);
  assert.equal(r.porItem[ID_DBP].cortadoSeg, 0.5);
});
