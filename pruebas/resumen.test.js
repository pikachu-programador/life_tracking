// Pruebas de resumen.js para UN día (V-01 y V-03): las partes que salen de los segmentos, tiempoEnClases y resumirDia.
// Las de un período (agregarPeriodo, V-02) están en resumen-periodo.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  porEstado, porHora, tramos, tramosPlan, cambiosApp, focoMasLargo, porApp, porDominio, porCategoria,
  clasesContadas, tiempoEnClases, resumirDia, TRAMOS_POR_DIA,
} from '../web/motor/resumen.js';
import { instanteLocal, sumarDias } from '../web/motor/fechas.js';
import { ESTADOS, SIN_AREA } from '../web/motor/tipos.js';

const FECHA = '2026-10-05'; // lunes
const MIN = 60;
const H = 3600;

/** Instante de 'HH:MM' (o 'HH:MM:SS') en Lima; `dias` = cuántos días después de `fecha`. */
function t(hora, fecha = FECHA, dias = 0) {
  const [hh, mm, ss = '0'] = hora.split(':');
  return instanteLocal(sumarDias(fecha, dias), `${hh}:${mm}`) + Number(ss) * 1000;
}

/** Segmento (con contexto 'libre' salvo que se diga otra cosa). `desde` y `hasta` son instantes. */
function seg(clase, desde, hasta, datos = {}) {
  const actividad = clase !== 'afk' && clase !== 'sin-pc';
  return {
    inicio: desde, fin: hasta, clase, categoria: null, area: null, app: actividad ? 'app.exe' : null,
    titulo: null, url: null, dominio: null, audible: false, incognito: false,
    contexto: 'libre', bloqueId: null, cursoId: null, claseId: null, rutinaId: null,
    ...datos,
  };
}

/** Segmento de Estudio > Programación en Code.exe. */
function estudio(desde, hasta, datos = {}) {
  return seg('estudio', desde, hasta, { app: 'Code.exe', categoria: ['Estudio', 'Programación'], area: 'Programación', ...datos });
}

/** Tramo (0 a 95) que empieza a la hora 'HH:MM' local. */
function tramo(hora) {
  const [hh, mm] = hora.split(':').map(Number);
  return (hh * 60 + mm) / 15;
}

/** Suma de los valores de un objeto. */
function suma(objeto) {
  return Object.values(objeto).reduce((a, b) => a + b, 0);
}

// ── porEstado ──

test('porEstado: las 7 claves y suman lo que cubren los segmentos', () => {
  const lista = [
    seg('neutral', t('07:00'), t('08:00')),
    estudio(t('08:00'), t('09:30')),
    seg('afk', t('09:30'), t('10:00')),
    seg('sin-pc', t('10:00'), t('23:00')),
    seg('distraccion', t('23:00'), t('01:00', FECHA, 1)), // cruza la medianoche
  ];
  const e = porEstado(lista);
  assert.deepEqual(Object.keys(e), ESTADOS);
  assert.deepEqual(e, {
    'estudio': 1.5 * H, 'ia': 0, 'neutral': 1 * H, 'distraccion': 2 * H, 'sin-clasificar': 0, 'afk': 0.5 * H, 'sin-pc': 13 * H,
  });
  assert.equal(suma(e), 18 * H); // de 07:00 a 01:00
  assert.deepEqual(porEstado([]), Object.fromEntries(ESTADOS.map((x) => [x, 0])));
});

// ── porHora ──

test('porHora: un segmento que cruza horas se reparte y ninguna pasa de 3600', () => {
  const horas = porHora([
    estudio(t('10:30'), t('12:15'), { contexto: 'bloque', bloqueId: 'b-bd1@2026-10-05', cursoId: 'bd1' }),
    seg('ia', t('12:15'), t('12:45')),
  ]);
  assert.equal(horas.length, 24);
  assert.equal(horas[10].estados.estudio, 30 * MIN);
  assert.equal(horas[11].estados.estudio, 60 * MIN);
  assert.equal(horas[12].estados.estudio, 15 * MIN);
  assert.equal(horas[12].estados.ia, 30 * MIN);
  assert.deepEqual(horas[11].areas, { 'Programación': 60 * MIN });
  assert.deepEqual(horas[12].cursos, { bd1: 15 * MIN }); // solo el Estudio dentro del bloque
  assert.deepEqual(horas[9], { estados: Object.fromEntries(ESTADOS.map((x) => [x, 0])), areas: {}, cursos: {} });
});

test('porHora: un día lógico de 24 h justas llena cada hora hasta 3600, sin pasarse', () => {
  // De las 04:30 del 5 a las 04:30 del 6: la hora 4 junta 04:30–05:00 del 5 y 04:00–04:30 del 6.
  const horas = porHora([
    estudio(t('04:30'), t('05:00')),
    seg('neutral', t('05:00'), t('04:00', FECHA, 1)),
    seg('distraccion', t('04:00', FECHA, 1), t('04:30', FECHA, 1)),
  ]);
  for (const [h, hora] of horas.entries()) {
    const total = suma(hora.estados);
    assert.ok(total <= 3600, `la hora ${h} suma ${total}`);
    assert.equal(total, 3600, `la hora ${h} debería estar llena`);
  }
  assert.deepEqual([horas[4].estados.estudio, horas[4].estados.distraccion], [30 * MIN, 30 * MIN]);
  assert.equal(horas.reduce((tot, h) => tot + suma(h.estados), 0), 24 * H);
});

test('porHora: áreas y cursos', () => {
  const horas = porHora([
    estudio(t('15:00'), t('15:20'), { contexto: 'bloque', cursoId: 'bd1' }),
    estudio(t('15:20'), t('15:30'), { contexto: 'clase', cursoId: 'edo', area: 'Matemáticas' }), // en clase: sin curso
    estudio(t('15:30'), t('15:40'), { area: null }), // Estudio sin área → SIN_AREA
    seg('distraccion', t('15:40'), t('16:00'), { contexto: 'bloque', cursoId: 'bd1' }), // no es Estudio: no suma al curso
  ]);
  assert.deepEqual(horas[15].areas, { 'Programación': 20 * MIN, 'Matemáticas': 10 * MIN, [SIN_AREA]: 10 * MIN });
  assert.deepEqual(horas[15].cursos, { bd1: 20 * MIN });
});

// ── tramos ──

test('tramos: el estado con más tiempo, clase si la clase cubre la mitad, y sin-pc fuera del día', () => {
  const clases = [{ id: 'c-bd1@2026-10-05', claseId: 'c-bd1', curso: 'bd1', tipo: 'teoria', inicio: t('08:00'), fin: t('10:00'), lugar: '', usaPc: false }];
  const lista = [
    seg('neutral', t('07:05'), t('08:00')), // el día lógico empieza a las 07:05
    seg('afk', t('08:00'), t('10:00')), // en clase
    estudio(t('10:00'), t('10:20')),
    seg('distraccion', t('10:20'), t('10:30')),
    estudio(t('10:30'), t('10:37:30')), // 7,5 min de Estudio y 7,5 de IA: empate
    seg('ia', t('10:37:30'), t('10:45')),
    seg('neutral', t('10:45'), t('10:50')), // y el día termina a las 10:50
  ];
  const r = tramos(lista, clases);
  assert.equal(r.length, TRAMOS_POR_DIA);
  assert.equal(r[tramo('06:45')], 'sin-pc'); // antes del día lógico
  assert.equal(r[tramo('07:00')], 'neutral'); // 10 min neutral contra 5 min fuera del día
  assert.equal(r[tramo('07:45')], 'neutral');
  for (let i = tramo('08:00'); i < tramo('10:00'); i++) assert.equal(r[i], 'clase');
  assert.equal(r[tramo('10:00')], 'estudio');
  assert.equal(r[tramo('10:15')], 'distraccion'); // 10 min contra 5 de Estudio
  assert.equal(r[tramo('10:30')], 'estudio'); // empate: gana el primero de ESTADOS
  assert.equal(r[tramo('10:45')], 'sin-pc'); // 5 min neutral contra 10 fuera del día
  assert.equal(r[tramo('23:45')], 'sin-pc');
});

test('tramos: la clase cuenta desde la mitad del tramo; sin clases contadas, el estado', () => {
  const clase = (desde, hasta) => ({ id: 'c@x', claseId: 'c', curso: 'bd1', tipo: 'teoria', inicio: desde, fin: hasta, lugar: '', usaPc: true });
  const lista = [estudio(t('08:00'), t('09:00'))];
  // Clase de 08:00 a 08:07:30 → cubre justo la mitad del tramo de las 08:00.
  assert.equal(tramos(lista, [clase(t('08:00'), t('08:07:30'))])[tramo('08:00')], 'clase');
  assert.equal(tramos(lista, [clase(t('08:00'), t('08:07'))])[tramo('08:00')], 'estudio');
  // Sin clases (por ejemplo, marcada "falto") manda el estado.
  assert.equal(tramos(lista, [])[tramo('08:00')], 'estudio');
  assert.equal(tramos(lista)[tramo('08:00')], 'estudio');
});

test('tramos: un día lógico que cruza la medianoche usa la hora local', () => {
  const r = tramos([
    seg('neutral', t('20:00'), t('23:30')),
    estudio(t('23:30'), t('02:15', FECHA, 1)), // trasnoche
  ]);
  assert.equal(r[tramo('23:45')], 'estudio');
  assert.equal(r[tramo('00:00')], 'estudio');
  assert.equal(r[tramo('02:00')], 'estudio');
  assert.equal(r[tramo('02:15')], 'sin-pc');
  assert.equal(r[tramo('19:45')], 'sin-pc');
  assert.ok(tramos([]).every((x) => x === 'sin-pc')); // día sin datos
});

// ── tramosPlan ──

/** ItemsDelDia armado a mano (lo que daría expandirDia). */
function itemsDe({ fecha = FECHA, bloques = [], clases = [], rutinas = [] } = {}) {
  return { fecha, enCiclo: true, excepciones: [], bloques, clases, rutinas };
}
function bloqueDia(id, desde, hasta, curso = 'bd1', tipo = 'estudio_pc') {
  return {
    id: `${id}@${FECHA}`, bloqueId: id, tipo, curso, inicio: desde, fin: hasta, finPlan: hasta, nivel: 'friccion',
    subidoPorExcepcion: false, objetivo: '', porQue: '', terminadoAntes: null,
  };
}
function claseDia(claseId, desde, hasta, curso = 'bd1') {
  return { id: `${claseId}@${FECHA}`, claseId, curso, tipo: 'teoria', inicio: desde, fin: hasta, lugar: 'UTEC', usaPc: false };
}
function rutinaDia(rutinaId, medicion, desde, hasta) {
  return {
    id: `${rutinaId}@${FECHA}`, rutinaId, nombre: rutinaId, medicion, evento: null, inicio: desde, fin: hasta,
    categoria: null, minutosMeta: null, toleranciaMin: 10,
  };
}

test('tramosPlan: bloque > clase > rutina, y libre', () => {
  const r = tramosPlan(itemsDe({
    bloques: [bloqueDia('b-bd1', t('15:00'), t('17:00')), bloqueDia('b-p3', t('23:30'), t('00:30', FECHA, 1), 'p3')],
    clases: [claseDia('c-bd1', t('08:00'), t('10:00'))],
    rutinas: [
      rutinaDia('ingles-pc', 'pc', t('16:00'), t('18:00')), // se superpone con el bloque
      rutinaDia('despertar', 'dia_logico', t('07:00'), t('07:30')), // hora suelta: no es una franja
      rutinaDia('lectura', 'checkin', null, null), // sin franja: todo el día
    ],
  }));
  assert.equal(r.length, TRAMOS_POR_DIA);
  assert.equal(r[tramo('07:00')], 'libre');
  assert.equal(r[tramo('08:00')], 'clase');
  assert.equal(r[tramo('09:45')], 'clase');
  assert.equal(r[tramo('10:00')], 'libre');
  assert.equal(r[tramo('16:00')], 'bloque'); // bloque y rutina: gana el bloque
  assert.equal(r[tramo('17:00')], 'rutina');
  assert.equal(r[tramo('18:00')], 'libre');
  assert.deepEqual([r[tramo('23:30')], r[tramo('23:45')], r[tramo('00:00')], r[tramo('00:15')], r[tramo('00:30')]],
    ['bloque', 'bloque', 'bloque', 'bloque', 'libre']); // cruza la medianoche
  assert.equal(r.filter((x) => x === 'rutina').length, 4); // 17:00–18:00
});

test('tramosPlan: hace falta MÁS de la mitad del tramo', () => {
  assert.equal(tramosPlan(itemsDe({ bloques: [bloqueDia('b', t('10:00'), t('10:07:30'))] }))[tramo('10:00')], 'libre');
  assert.equal(tramosPlan(itemsDe({ bloques: [bloqueDia('b', t('10:00'), t('10:08'))] }))[tramo('10:00')], 'bloque');
  // Dos clases seguidas de 5 min en el mismo tramo: 10 min → clase.
  const dos = tramosPlan(itemsDe({ clases: [claseDia('a', t('10:00'), t('10:05')), claseDia('b', t('10:05'), t('10:10'))] }));
  assert.equal(dos[tramo('10:00')], 'clase');
  assert.ok(tramosPlan(itemsDe()).every((x) => x === 'libre'));
  assert.ok(tramosPlan(undefined).every((x) => x === 'libre'));
});

// ── cambiosApp ──

test('cambiosApp: salta AFK, Sin PC y los huecos sin app', () => {
  const lista = [
    estudio(t('10:00'), t('10:10'), { app: 'Code.exe' }),
    estudio(t('10:10'), t('10:20'), { app: 'Code.exe', titulo: 'otro archivo' }), // misma app: no cambia
    seg('neutral', t('10:20'), t('10:30'), { app: 'chrome.exe' }), // 1
    seg('afk', t('10:30'), t('10:40')),
    seg('neutral', t('10:40'), t('10:50'), { app: 'chrome.exe' }), // AFK en medio: no cambia
    seg('sin-clasificar', t('10:50'), t('10:55'), { app: null }), // hueco sin ventana: se salta
    estudio(t('10:55'), t('11:00'), { app: 'Code.exe' }), // 2
    seg('sin-pc', t('11:00'), t('12:00')),
    seg('ia', t('12:00'), t('12:10'), { app: 'chrome.exe' }), // 3
  ];
  assert.equal(cambiosApp(lista), 3);
  assert.equal(cambiosApp([]), 0);
  assert.equal(cambiosApp([estudio(t('10:00'), t('11:00'))]), 0);
});

// ── focoMasLargo ──

test('focoMasLargo: tolera cortes de menos de 2 min, que no suman', () => {
  const lista = [
    // Racha 1: 09:00–09:40 con un corte de 1 min de IA → 20 + 19 = 39 min de Estudio.
    estudio(t('09:00'), t('09:20')),
    seg('ia', t('09:20'), t('09:21')),
    estudio(t('09:21'), t('09:40')),
    seg('distraccion', t('09:40'), t('09:50')), // 10 min: corta
    // Racha 2: 09:50–10:40 con un corte de 1 min 59 s → 40 min + 8 min 1 s = 2881 s.
    estudio(t('09:50'), t('10:30')),
    seg('neutral', t('10:30'), t('10:31:59')),
    estudio(t('10:31:59'), t('10:40')),
    seg('afk', t('10:40'), t('10:42')), // 2 min justos: ya corta
    // Racha 3: 10:42–11:30 = 48 min = 2880 s (un segundo menos que la 2).
    estudio(t('10:42'), t('11:30')),
  ];
  assert.deepEqual(focoMasLargo(lista), { inicio: t('09:50'), fin: t('10:40'), seg: 2881 });
});

test('focoMasLargo: huecos sin segmentos, empates y días sin Estudio', () => {
  // Un hueco de 1 min (sin ningún segmento) entre dos tramos de Estudio no corta.
  assert.deepEqual(focoMasLargo([estudio(t('09:00'), t('09:10')), estudio(t('09:11'), t('09:21'))]),
    { inicio: t('09:00'), fin: t('09:21'), seg: 20 * MIN });
  // Dos rachas iguales: la primera.
  assert.deepEqual(focoMasLargo([estudio(t('09:00'), t('09:10')), seg('neutral', t('09:10'), t('09:20')), estudio(t('09:20'), t('09:30'))]),
    { inicio: t('09:00'), fin: t('09:10'), seg: 10 * MIN });
  assert.equal(focoMasLargo([seg('neutral', t('09:00'), t('10:00'))]), null);
  assert.equal(focoMasLargo([]), null);
});

// ── porApp, porDominio y porCategoria ──

test('porApp, porDominio y porCategoria: solo actividad, de mayor a menor', () => {
  const lista = [
    estudio(t('09:00'), t('10:00')),
    seg('distraccion', t('10:00'), t('10:30'), { app: 'chrome.exe', dominio: 'youtube.com', categoria: ['Distracción', 'Video'] }),
    seg('afk', t('10:30'), t('11:00')),
    seg('neutral', t('11:00'), t('12:30'), { app: 'chrome.exe', dominio: 'correo.ejemplo.test', categoria: ['Neutral', 'Comunicación'] }),
  ];
  assert.deepEqual(porApp(lista), { 'chrome.exe': 2 * H, 'Code.exe': 1 * H });
  assert.deepEqual(Object.keys(porApp(lista)), ['chrome.exe', 'Code.exe']);
  assert.deepEqual(porDominio(lista), { 'correo.ejemplo.test': 1.5 * H, 'youtube.com': 0.5 * H });
  assert.deepEqual(porCategoria(lista), { 'Neutral > Comunicación': 1.5 * H, 'Estudio > Programación': 1 * H, 'Distracción > Video': 0.5 * H });
});

// ── Tiempo en clases (V-03) ──

const CLASES_LUNES = itemsDe({
  clases: [claseDia('c-bd1-lun-0800', t('08:00'), t('10:00')), claseDia('c-edo-lun-1000', t('10:00'), t('12:00'), 'edo')],
});

/** Check-in normalizado de asistencia. */
function asistencia(claseId, valor, fecha = FECHA, hora = '12:30') {
  return { id: null, instante: t(hora, fecha), fecha, tipo: 'asistencia', refId: claseId, valor, nota: '' };
}

test('tiempoEnClases: sin check-ins cuentan todas las clases del plan', () => {
  assert.equal(tiempoEnClases(CLASES_LUNES, []), 4 * H);
  assert.equal(tiempoEnClases(CLASES_LUNES), 4 * H);
  // Otros check-ins (papel, despertar) no cambian nada.
  const otros = [{ id: null, instante: t('20:00'), fecha: FECHA, tipo: 'papel', refId: 'b-edo-mie', valor: 'hecho', nota: '' }];
  assert.equal(tiempoEnClases(CLASES_LUNES, otros), 4 * H);
});

test('tiempoEnClases: asistencia clase por clase', () => {
  // "falto" en BD I: solo cuenta EDO (que no tiene check-in).
  assert.equal(tiempoEnClases(CLASES_LUNES, [asistencia('c-bd1-lun-0800', 'falto')]), 2 * H);
  // "asistio" en BD I: cuentan las dos.
  assert.equal(tiempoEnClases(CLASES_LUNES, [asistencia('c-bd1-lun-0800', 'asistio')]), 4 * H);
  // Faltó a las dos.
  assert.equal(tiempoEnClases(CLASES_LUNES, [asistencia('c-bd1-lun-0800', 'falto'), asistencia('c-edo-lun-1000', 'falto')]), 0);
  // Corrección: primero "falto" y después "asistio" → vale la última.
  assert.equal(tiempoEnClases(CLASES_LUNES, [
    asistencia('c-bd1-lun-0800', 'asistio', FECHA, '13:00'),
    asistencia('c-bd1-lun-0800', 'falto', FECHA, '12:30'),
  ]), 4 * H);
  // Un check-in de otra fecha no aplica.
  assert.equal(tiempoEnClases(CLASES_LUNES, [asistencia('c-bd1-lun-0800', 'falto', '2026-10-12')]), 4 * H);
  assert.deepEqual(clasesContadas(CLASES_LUNES, [asistencia('c-bd1-lun-0800', 'falto')]).map((c) => c.claseId), ['c-edo-lun-1000']);
});

test('tiempoEnClases: feriado (expandirDia no trae clases) y sin items', () => {
  assert.equal(tiempoEnClases(itemsDe({ fecha: '2026-10-08' }), []), 0);
  assert.equal(tiempoEnClases(undefined, []), 0);
});

// ── Con plan-ejemplo.json y expandirDia (horario.js, F3-03) ──

test('tiempoEnClases con plan-ejemplo.json: lunes, feriado y asistencia', async () => {
  const { expandirDia } = await import('../web/motor/horario.js');
  const { normalizarPlan } = await import('../web/motor/plan.js');
  const { planEjemplo } = await import('./ayudantes/ejemplo.js');
  const plan = normalizarPlan(planEjemplo());
  // Lunes 5: BD I 08–10 y EDO 10–12 → 4 h.
  const lunes = expandirDia(plan, '2026-10-05');
  assert.equal(tiempoEnClases(lunes, []), 4 * H);
  // Jueves 8: feriado (cancela clases y bloques) → 0, aunque es día de Prog III y PI2.
  assert.equal(tiempoEnClases(expandirDia(plan, '2026-10-08'), []), 0);
  // Jueves 15 (sin feriado): Prog III 08–10 y PI2 10–12; falta a PI2 → 2 h.
  const jueves = expandirDia(plan, '2026-10-15');
  const pi2 = jueves.clases.find((c) => c.curso === 'pi2');
  assert.equal(tiempoEnClases(jueves, [asistencia(pi2.claseId, 'falto', '2026-10-15')]), 2 * H);
  assert.equal(tiempoEnClases(jueves, [asistencia(pi2.claseId, 'asistio', '2026-10-15')]), 4 * H);
});

// ── resumirDia ──
//
// Plan de prueba: lunes con clase de BD I (08–10), bloque de BD I en PC (15–17), bloque de EDO en papel (18–19),
// rutina "Inglés en la PC" (21–22, 30 min), y martes con un bloque de Prog III que cruza la medianoche (23:30–00:30).
//
// Lunes 5, día lógico 07:00–23:00 (16 h):
//   07:00–08:00 neutral (explorer.exe)       12:00–15:00 sin PC                   19:00–21:00 sin PC
//   08:00–10:00 AFK (en clase)               15:00–16:40 Estudio > Programación   21:00–21:40 Estudio > Inglés
//   10:00–12:00 YouTube (Distracción)        16:40–17:00 IA                       21:40–23:00 Instagram (Distracción)
//                                            17:00–18:00 correo (Neutral)
//                                            18:00–19:00 AFK (estudio en papel, check-in "hecho")
//   Estudio 100 + 40 = 140 min · IA 20 · Neutral 60 + 60 = 120 · Distracción 120 + 80 = 200 · AFK 180 · Sin PC 300 → 960 min = 16 h.

function planDePrueba() {
  return {
    version: 1,
    ciclo: { nombre: 'prueba', inicio: '2026-08-24', fin: '2026-12-12' },
    cursos: [
      { id: 'bd1', nombre: 'BD I', area: ['Estudio', 'Programación'], color: 'curso-1', meta_horas_semana: 6, prioridad: 'media' },
      { id: 'edo', nombre: 'EDO', area: ['Estudio', 'Matemáticas'], color: 'curso-2', meta_horas_semana: 5, prioridad: 'media' },
      { id: 'p3', nombre: 'Prog III', area: ['Estudio', 'Programación'], color: 'curso-3', meta_horas_semana: 6, prioridad: 'alta' },
      { id: 'ing', nombre: 'Inglés', area: ['Estudio', 'Inglés'], color: 'curso-4', meta_horas_semana: 3, prioridad: 'media' },
    ],
    clases: [{ id: 'c-bd1', curso: 'bd1', tipo: 'teoria', dias: ['lun'], inicio: '08:00', fin: '10:00', lugar: 'UTEC', usa_pc: false }],
    rutinas: [{
      id: 'ingles-pc', nombre: 'Inglés en la PC', dias: ['lun'], inicio: '21:00', fin: '22:00', medicion: 'pc',
      categoria: ['Estudio', 'Inglés'], minutos_meta: 30, tolerancia_min: 10,
    }],
    bloques: [
      { id: 'b-bd1', tipo: 'estudio_pc', curso: 'bd1', repeticion: { tipo: 'semanal', dias: ['lun'] }, inicio: '15:00', fin: '17:00', nivel: 'friccion', objetivo: '', por_que: '' },
      { id: 'b-edo', tipo: 'estudio_papel', curso: 'edo', repeticion: { tipo: 'semanal', dias: ['lun'] }, inicio: '18:00', fin: '19:00', nivel: 'aviso', objetivo: '', por_que: '' },
      { id: 'b-p3', tipo: 'estudio_pc', curso: 'p3', repeticion: { tipo: 'semanal', dias: ['mar'] }, inicio: '23:30', fin: '00:30', nivel: 'aviso', objetivo: '', por_que: '' },
    ],
    excepciones: [{ desde: '2026-10-12', hasta: '2026-10-12', tipo: 'feriado', efecto: 'cancelar_clases_y_bloques', nota: 'feriado de prueba' }],
    umbrales: { tolerancia_inicio_min: 10, foco_cumplido: 0.7, foco_parcial: 0.4, dia_cumplido: 0.8, hueco_sueno_h: 3, peso_despertar_dormir_min: 30 },
  };
}

function diaLogico(fecha, inicio, fin, extra = {}) {
  return {
    fecha, inicio, fin, fuenteInicio: 'actividad', fuenteFin: 'actividad', cerrado: true, sinDatos: false,
    despiertoSeg: (fin - inicio) / 1000, ...extra,
  };
}

/** Segmento sin contexto (como los da segmentar). */
function crudo(clase, desde, hasta, datos = {}) {
  const { contexto, bloqueId, cursoId, claseId, rutinaId, ...s } = seg(clase, desde, hasta, datos);
  return s;
}

const LUNES = diaLogico(FECHA, t('07:00'), t('23:00'));
const SEGMENTOS_LUNES = [
  crudo('neutral', t('07:00'), t('08:00'), { app: 'explorer.exe', categoria: ['Neutral', 'Sistema'] }),
  crudo('afk', t('08:00'), t('10:00')),
  crudo('distraccion', t('10:00'), t('12:00'), { app: 'chrome.exe', dominio: 'youtube.com', url: 'https://youtube.com/watch?v=x', categoria: ['Distracción', 'Video'] }),
  crudo('sin-pc', t('12:00'), t('15:00')),
  crudo('estudio', t('15:00'), t('16:40'), { app: 'Code.exe', categoria: ['Estudio', 'Programación'], area: 'Programación' }),
  crudo('ia', t('16:40'), t('17:00'), { app: 'chrome.exe', dominio: 'claude.ai', categoria: ['IA'] }),
  crudo('neutral', t('17:00'), t('18:00'), { app: 'chrome.exe', dominio: 'correo.ejemplo.test', categoria: ['Neutral', 'Comunicación'] }),
  crudo('afk', t('18:00'), t('19:00')),
  crudo('sin-pc', t('19:00'), t('21:00')),
  crudo('estudio', t('21:00'), t('21:40'), { app: 'chrome.exe', dominio: 'ejemplo-ingles.test', categoria: ['Estudio', 'Inglés'], area: 'Inglés' }),
  crudo('distraccion', t('21:40'), t('23:00'), { app: 'chrome.exe', dominio: 'instagram.com', categoria: ['Distracción', 'Redes'] }),
];
const CHECKINS = [
  { id: 1, instante: t('19:05'), fecha: FECHA, tipo: 'papel', refId: 'b-edo', valor: 'hecho', nota: '' },
  { id: 2, instante: t('10:00', '2026-10-06'), fecha: '2026-10-06', tipo: 'papel', refId: 'b-edo', valor: 'hecho', nota: '' }, // de otro día
];

test('resumirDia: las métricas que salen de los segmentos', () => {
  const r = resumirDia(SEGMENTOS_LUNES, planDePrueba(), CHECKINS, LUNES);
  assert.equal(r.fecha, FECHA);
  assert.equal(r.dia, LUNES);
  assert.equal(r.sinDatos, false);
  assert.equal(r.despiertoSeg, 16 * H);
  assert.deepEqual(r.porEstado, {
    'estudio': 140 * MIN, 'ia': 20 * MIN, 'neutral': 120 * MIN, 'distraccion': 200 * MIN, 'sin-clasificar': 0, 'afk': 180 * MIN, 'sin-pc': 300 * MIN,
  });
  assert.equal(suma(r.porEstado), r.despiertoSeg);
  assert.equal(r.activoSeg, 480 * MIN); // 140 + 20 + 120 + 200
  assert.deepEqual(r.porArea, { 'Programación': 100 * MIN, 'Inglés': 40 * MIN });
  assert.deepEqual(r.porCategoria, {
    'Distracción > Video': 2 * H, 'Estudio > Programación': 100 * MIN, 'Distracción > Redes': 80 * MIN,
    'Neutral > Comunicación': 1 * H, 'Neutral > Sistema': 1 * H, 'Estudio > Inglés': 40 * MIN, 'IA': 20 * MIN,
  });
  assert.deepEqual(r.porApp, { 'chrome.exe': 320 * MIN, 'Code.exe': 100 * MIN, 'explorer.exe': 60 * MIN });
  assert.deepEqual(r.porDominio, {
    'youtube.com': 2 * H, 'instagram.com': 80 * MIN, 'correo.ejemplo.test': 1 * H, 'ejemplo-ingles.test': 40 * MIN, 'claude.ai': 20 * MIN,
  });
  // Cambios de app: explorer → chrome → Code → chrome = 3, en 8 h activas.
  assert.equal(r.cambiosApp, 3);
  assert.equal(r.cambiosPorHora, 3 / 8);
  // Foco más largo: 15:00–16:40 (la IA de después dura 20 min y corta).
  assert.deepEqual(r.focoMasLargo, { inicio: t('15:00'), fin: t('16:40'), seg: 100 * MIN });
  // Por hora: a las 15 todo el bloque de BD I; a las 21, Inglés en la rutina (sin curso: no es un bloque).
  assert.deepEqual(r.porHora[15].cursos, { bd1: 1 * H });
  assert.deepEqual(r.porHora[16].cursos, { bd1: 40 * MIN });
  assert.equal(r.porHora[16].estados.ia, 20 * MIN);
  assert.deepEqual(r.porHora[21].areas, { 'Inglés': 40 * MIN });
  assert.deepEqual(r.porHora[21].cursos, {});
  assert.ok(r.porHora.every((h) => suma(h.estados) <= 3600));
});

test('resumirDia: clases, papel, cursos, tramos y franja del plan', () => {
  const r = resumirDia(SEGMENTOS_LUNES, planDePrueba(), CHECKINS, LUNES);
  assert.equal(r.clasesSeg, 2 * H);
  // Todos los cursos del plan, con 0 si no hubo nada; el papel "hecho" de EDO cuenta su hora.
  assert.deepEqual(r.porCurso, {
    bd1: { bloquesSeg: 100 * MIN, papelSeg: 0 },
    edo: { bloquesSeg: 0, papelSeg: 1 * H },
    p3: { bloquesSeg: 0, papelSeg: 0 },
    ing: { bloquesSeg: 0, papelSeg: 0 },
  });
  assert.equal(r.papelSeg, 1 * H);
  assert.equal(r.estudioTotalSeg, 140 * MIN + 1 * H);
  const esperado = new Array(96).fill('sin-pc');
  const poner = (desde, hasta, valor) => { for (let i = tramo(desde); i < tramo(hasta); i++) esperado[i] = valor; };
  poner('07:00', '08:00', 'neutral');
  poner('08:00', '10:00', 'clase');
  poner('10:00', '12:00', 'distraccion');
  poner('15:00', '16:45', 'estudio'); // 16:30–16:45: 10 min de Estudio contra 5 de IA
  poner('16:45', '17:00', 'ia');
  poner('17:00', '18:00', 'neutral');
  poner('18:00', '19:00', 'afk');
  poner('21:00', '21:45', 'estudio');
  poner('21:45', '23:00', 'distraccion');
  assert.deepEqual(r.tramos, esperado);
  const plan = new Array(96).fill('libre');
  const ponerPlan = (desde, hasta, valor) => { for (let i = tramo(desde); i < tramo(hasta); i++) plan[i] = valor; };
  ponerPlan('08:00', '10:00', 'clase');
  ponerPlan('15:00', '17:00', 'bloque');
  ponerPlan('18:00', '19:00', 'bloque');
  ponerPlan('21:00', '22:00', 'rutina');
  assert.deepEqual(r.tramosPlan, plan);
});

test('resumirDia: cumplimiento compuesto con evaluarBloque, evaluarRutina y porcentajeDia', async () => {
  const { expandirDia } = await import('../web/motor/horario.js');
  const { asignarContexto } = await import('../web/motor/contexto.js');
  const { evaluarBloque, evaluarRutina } = await import('../web/motor/cumplimiento.js');
  const { porcentajeDia } = await import('../web/motor/porcentajes.js');
  const plan = planDePrueba();
  const r = resumirDia(SEGMENTOS_LUNES, plan, CHECKINS, LUNES);
  // Lo mismo que llamar a cada función a mano (con los check-ins del día).
  const items = expandirDia(plan, FECHA, { inicioDia: '04:00' });
  const conContexto = asignarContexto(SEGMENTOS_LUNES, items);
  const delDia = CHECKINS.filter((c) => c.fecha === FECHA);
  const bloques = items.bloques.map((b) => evaluarBloque(b, conContexto, delDia, plan.umbrales, { ahora: Infinity, intervenciones: [] }));
  const rutinas = items.rutinas.map((x) => evaluarRutina(x, conContexto, delDia, LUNES, plan.umbrales, { ahora: Infinity }));
  assert.deepEqual(r.bloques, bloques);
  assert.deepEqual(r.rutinas, rutinas);
  assert.deepEqual(r.cumplimiento, porcentajeDia(bloques, rutinas, plan.umbrales));
  // Y con las reglas de §9: BD I con foco 100 ÷ 120 ≥ 70 % y puntual; papel "hecho" sin distracción; Inglés 40 ≥ 30 min.
  assert.deepEqual(r.bloques.map((b) => [b.bloqueId, b.estado]), [['b-bd1', 'cumplido'], ['b-edo', 'cumplido']]);
  assert.equal(r.rutinas[0].estado, 'cumplido');
  assert.equal(r.cumplimiento.porcentaje, 1);
  assert.equal(r.retrasoMedioMin, 0); // solo BD I tiene retraso (0); el papel no
});

test('resumirDia: hoy en curso (ahora) y opciones.items', async () => {
  const { expandirDia } = await import('../web/motor/horario.js');
  const { evaluarBloque } = await import('../web/motor/cumplimiento.js');
  const { asignarContexto } = await import('../web/motor/contexto.js');
  const plan = planDePrueba();
  const ahora = t('16:00');
  const hoy = diaLogico(FECHA, t('07:00'), ahora, { cerrado: false, fuenteFin: 'ahora' });
  const segmentos = SEGMENTOS_LUNES.filter((s) => s.inicio < ahora).map((s) => ({ ...s, fin: Math.min(s.fin, ahora) }));
  const r = resumirDia(segmentos, plan, CHECKINS, hoy, { ahora });
  const items = expandirDia(plan, FECHA);
  assert.deepEqual(r.bloques[0], evaluarBloque(items.bloques[0], asignarContexto(segmentos, items), [CHECKINS[0]], plan.umbrales, { ahora, intervenciones: [] }));
  assert.equal(r.bloques[0].estado, 'en_curso');
  assert.equal(suma(r.porEstado), 9 * H);
  // Con items ya calculados da lo mismo.
  assert.deepEqual(resumirDia(segmentos, plan, CHECKINS, hoy, { ahora, items }), r);
});

test('resumirDia: día sin datos', () => {
  // Martes 6 sin ningún evento: el día lógico es inicio = fin = 04:00.
  const vacio = diaLogico('2026-10-06', t('04:00', '2026-10-06'), t('04:00', '2026-10-06'), { sinDatos: true, fuenteInicio: 'inicio_dia', fuenteFin: 'sin_datos' });
  const r = resumirDia([], planDePrueba(), [], vacio);
  assert.equal(r.sinDatos, true);
  assert.equal(r.despiertoSeg, 0);
  assert.equal(r.activoSeg, 0);
  assert.equal(suma(r.porEstado), 0);
  assert.equal(r.cambiosApp, 0);
  assert.equal(r.cambiosPorHora, null);
  assert.equal(r.focoMasLargo, null);
  assert.ok(r.tramos.every((x) => x === 'sin-pc'));
  assert.deepEqual(r.porApp, {});
  assert.equal(r.clasesSeg, 0); // el martes no tiene clases
  assert.equal(r.porHora.length, 24);
});

test('resumirDia: feriado (sin clases ni bloques)', () => {
  // Lunes 12 es feriado en el plan de prueba: la misma actividad que el lunes 5, una semana después.
  const semana = 7 * 24 * H * 1000;
  const segmentos = SEGMENTOS_LUNES.map((s) => ({ ...s, inicio: s.inicio + semana, fin: s.fin + semana }));
  const dia = diaLogico('2026-10-12', LUNES.inicio + semana, LUNES.fin + semana);
  const r = resumirDia(segmentos, planDePrueba(), [], dia);
  assert.equal(r.clasesSeg, 0);
  assert.deepEqual(r.bloques, []);
  assert.equal(r.tramosPlan.filter((x) => x === 'clase' || x === 'bloque').length, 0);
  assert.equal(r.tramos[tramo('08:00')], 'afk'); // sin clase, el AFK de esa hora se ve como AFK
  assert.deepEqual(r.porCurso.bd1, { bloquesSeg: 0, papelSeg: 0 }); // el Estudio de 15 a 17 ya no es de un bloque
  assert.equal(r.porEstado.estudio, 140 * MIN); // pero sigue siendo Estudio
  assert.equal(r.retrasoMedioMin, null);
});

test('resumirDia: trasnoche con un bloque que cruza la medianoche', () => {
  // Martes 6: activo de 10:00 a 02:30 del miércoles; Estudio de Prog III de 23:30 a 00:30 (el bloque) y hasta 02:00.
  const M = '2026-10-06';
  const dia = diaLogico(M, t('10:00', M), t('02:30', M, 1));
  const segmentos = [
    crudo('neutral', t('10:00', M), t('23:30', M), { app: 'explorer.exe', categoria: ['Neutral', 'Sistema'] }),
    crudo('estudio', t('23:30', M), t('02:00', M, 1), { app: 'Code.exe', categoria: ['Estudio', 'Programación'], area: 'Programación' }),
    crudo('distraccion', t('02:00', M, 1), t('02:30', M, 1), { app: 'chrome.exe', categoria: ['Distracción', 'Video'] }),
  ];
  const r = resumirDia(segmentos, planDePrueba(), [], dia);
  assert.equal(suma(r.porEstado), 16.5 * H);
  assert.deepEqual(r.porCurso.p3, { bloquesSeg: 1 * H, papelSeg: 0 });
  assert.deepEqual(r.porHora[23].cursos, { p3: 30 * MIN });
  assert.deepEqual(r.porHora[0].cursos, { p3: 30 * MIN });
  assert.equal(r.porHora[1].estados.estudio, 1 * H);
  assert.deepEqual(r.porHora[1].cursos, {}); // después del bloque ya no hay curso
  assert.equal(r.tramos[tramo('01:45')], 'estudio');
  assert.equal(r.tramos[tramo('02:15')], 'distraccion');
  assert.equal(r.tramos[tramo('02:30')], 'sin-pc');
  assert.deepEqual([r.tramosPlan[tramo('23:30')], r.tramosPlan[tramo('00:15')], r.tramosPlan[tramo('00:30')]], ['bloque', 'bloque', 'libre']);
  assert.deepEqual(r.focoMasLargo, { inicio: t('23:30', M), fin: t('02:00', M, 1), seg: 2.5 * H });
});

test('resumirDia no modifica sus entradas', () => {
  const plan = planDePrueba();
  const copias = structuredClone([SEGMENTOS_LUNES, plan, CHECKINS, LUNES]);
  resumirDia(SEGMENTOS_LUNES, plan, CHECKINS, LUNES);
  assert.deepEqual([SEGMENTOS_LUNES, plan, CHECKINS, LUNES], copias);
});
