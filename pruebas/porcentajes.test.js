// Pruebas de web/motor/porcentajes.js (F4-03): % del día y de varios días, horas por curso y por área (§9).
//
// Hecho cuando: un día armado a mano da el % esperado. Se arman dos días de datos-ejemplo (10-12 y 10-16) con
// el plan de ejemplo y la descripción de verdad.json, se pasan por asignarContexto → evaluarBloque/evaluarRutina
// → porcentajeDia, y se compara con la cuenta hecha a mano en el comentario de cada uno.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { porcentajeDia, porcentajeVarios, horasPorCurso, horasPorArea } from '../web/motor/porcentajes.js';
import { asignarContexto } from '../web/motor/contexto.js';
import { evaluarBloque, evaluarRutina } from '../web/motor/cumplimiento.js';
import { instanteLocal, instanteDelPlan, sumarDias } from '../web/motor/fechas.js';
import { SIN_AREA } from '../web/motor/tipos.js';
import { planEjemplo } from './ayudantes/ejemplo.js';

const PLAN = planEjemplo();
const U = PLAN.umbrales; // día cumplido desde 80 %
const MIN = 60;          // segundos
const DIA_MS = 24 * 60 * 60 * 1000;

// ── Ayudantes (los mismos datos que armaría el motor; horas de Lima, "+HH:MM" = madrugada siguiente) ──

function t(fecha, hora) {
  return hora.startsWith('+') ? instanteLocal(sumarDias(fecha, 1), hora.slice(1)) : instanteLocal(fecha, hora);
}

const CATEGORIA = { estudio: ['Estudio', 'Programación'], distraccion: ['Distracción', 'Redes'], ia: ['IA'], neutral: ['Neutral', 'Sistema'], afk: null, 'sin-pc': null };

function segmentosDe(fecha) {
  return (de, a, clase = 'estudio', categoria = CATEGORIA[clase]) => ({
    inicio: t(fecha, de), fin: t(fecha, a), clase, categoria,
    area: clase === 'estudio' ? (categoria?.[1] ?? SIN_AREA) : null,
    app: null, titulo: null, url: null, dominio: null, audible: false, incognito: false,
  });
}

function bloqueDia(id, fecha) {
  const b = PLAN.bloques.find((x) => x.id === id);
  const inicio = instanteDelPlan(fecha, b.inicio);
  let fin = instanteDelPlan(fecha, b.fin);
  if (fin <= inicio) fin += DIA_MS;
  return {
    id: `${id}@${fecha}`, bloqueId: id, tipo: b.tipo, curso: b.curso, inicio, fin, finPlan: fin, nivel: b.nivel,
    subidoPorExcepcion: false, objetivo: b.objetivo, porQue: b.por_que, terminadoAntes: null,
  };
}

function claseDia(curso, fecha, de, a) {
  return { id: `c-${curso}@${fecha}`, claseId: `c-${curso}`, curso, tipo: 'teoria', inicio: t(fecha, de), fin: t(fecha, a), lugar: 'UTEC', usaPc: false };
}

function rutinaDia(id, fecha) {
  const r = PLAN.rutinas.find((x) => x.id === id);
  const inicio = instanteDelPlan(fecha, r.inicio);
  let fin = instanteDelPlan(fecha, r.fin);
  if (r.medicion !== 'dia_logico' && fin <= inicio) fin += DIA_MS;
  return {
    id: `${id}@${fecha}`, rutinaId: id, nombre: r.nombre, medicion: r.medicion,
    evento: r.medicion === 'dia_logico' ? (id.startsWith('dorm') ? 'dormir' : 'despertar') : null,
    inicio, fin, categoria: r.categoria ?? null, minutosMeta: r.minutos_meta ?? null, toleranciaMin: r.tolerancia_min,
  };
}

function checkin(tipo, refId, valor, fecha) {
  return { id: null, instante: t(fecha, '23:00'), fecha, tipo, refId, valor, nota: '' };
}

function diaLogico(fecha, despertar, dormir) {
  return { fecha, inicio: t(fecha, despertar), fin: t(fecha, dormir), fuenteInicio: 'actividad', fuenteFin: 'actividad', cerrado: true, sinDatos: false, despiertoSeg: 0 };
}

/** Lo que haría resumirDia con un día: contexto, estado de cada bloque y rutina, y el %. */
function evaluarDia({ segmentos, items, checkins, dia }) {
  const conContexto = asignarContexto(segmentos, items);
  const bloques = items.bloques.map((b) => evaluarBloque(b, conContexto, checkins, U));
  const rutinas = items.rutinas.map((r) => evaluarRutina(r, conContexto, checkins, dia, U));
  return { conContexto, bloques, rutinas, porcentaje: porcentajeDia(bloques, rutinas, U) };
}

// ── Lunes 10-12: BD I empieza 20 min tarde con buen foco ──
//
// Plan (plan-ejemplo.json): clases de BD I 08:00–10:00 y EDO 10:00–12:00 (no cuentan para el %), bloque de
// BD I 15:00–17:00, inglés en la PC 21:00–22:00 (meta 30 min), despertar 07:00 y dormir 01:00 (tolerancia 30 min).
// Segmentos según verdad.json de 10-12.
const LUNES = '2026-10-12';
const sL = segmentosDe(LUNES);
const DIA_LUNES = {
  segmentos: [
    sL('07:05', '07:35', 'neutral'),
    sL('07:35', '12:30', 'sin-pc'),                       // clases en la universidad
    sL('12:30', '15:20', 'distraccion'),                  // 20 min de distracción ya dentro del bloque
    sL('15:20', '16:50'),                                 // BD I: 90 min de Estudio
    sL('16:50', '17:00', 'ia'),
    sL('17:00', '19:00', 'sin-pc'),
    sL('19:00', '21:00', 'distraccion'),                  // tiempo libre: no es fallo
    sL('21:00', '21:30', 'estudio', ['Estudio', 'Inglés']),
    sL('21:30', '21:40', 'neutral'),
    sL('21:40', '23:30'),                                 // DBP fuera de bloque: solo cuenta por área
  ],
  items: {
    fecha: LUNES, enCiclo: true, excepciones: [],
    bloques: [bloqueDia('b-bd1-lun', LUNES)],
    clases: [claseDia('bd1', LUNES, '08:00', '10:00'), claseDia('edo', LUNES, '10:00', '12:00')],
    rutinas: ['despertar', 'dormir', 'ingles-pc'].map((id) => rutinaDia(id, LUNES)),
  },
  checkins: [],
  dia: diaLogico(LUNES, '07:05', '23:30'),
};
// Cuenta a mano del 10-12:
//   bloque BD I        2 h (7200 s)  parcial  (20 min tarde; foco 90/120 = 75 %)  → 0,5 × 7200 = 3600
//   despertar 07:05    30 min (1800 s) cumplido (5 min después, tolerancia 30)    → 1 × 1800 = 1800
//   dormir 23:30       30 min (1800 s) cumplido (antes de la 01:00)               → 1 × 1800 = 1800
//   inglés 30 min      30 min (1800 s) cumplido (meta 30 min)                     → 1 × 1800 = 1800
//   clases             no cuentan
//   % = (3600 + 1800 + 1800 + 1800) / (7200 + 1800 + 1800 + 1800) = 9000 / 12600 = 5/7 ≈ 71,4 % → < 80 %: no cumplido
const PORCENTAJE_LUNES = 9000 / 12600;

// ── Viernes 10-16: EDO en papel con 20 min de redes en medio ──
//
// Plan: clase de Inglés 10:00–12:00, bloque de EDO en papel 16:00–17:30 (check-in "hecho"), inglés en la PC,
// despertar 07:00 y dormir 01:00. Segmentos según verdad.json de 10-16 (se durmió a la 01:00).
const VIERNES = '2026-10-16';
const sV = segmentosDe(VIERNES);
const DIA_VIERNES = {
  segmentos: [
    sV('07:15', '07:45', 'neutral'),
    sV('07:45', '12:30', 'sin-pc'),
    sV('12:30', '15:50', 'distraccion'),
    sV('15:50', '16:00', 'neutral'),
    sV('16:00', '16:35', 'afk'),                          // papel: la PC con la guía abierta, sin uso
    sV('16:35', '16:55', 'distraccion'),                  // 20 min de redes dentro del bloque
    sV('16:55', '17:30', 'afk'),
    sV('17:30', '19:00', 'sin-pc'),
    sV('19:00', '21:00', 'distraccion'),
    sV('21:00', '21:30', 'estudio', ['Estudio', 'Inglés']),
    sV('21:30', '+01:00', 'distraccion'),
  ],
  items: {
    fecha: VIERNES, enCiclo: true, excepciones: [],
    bloques: [bloqueDia('b-edo-vie', VIERNES)],
    clases: [claseDia('ing', VIERNES, '10:00', '12:00')],
    rutinas: ['despertar', 'dormir', 'ingles-pc'].map((id) => rutinaDia(id, VIERNES)),
  },
  checkins: [checkin('papel', 'b-edo-vie', 'hecho', VIERNES)],
  dia: diaLogico(VIERNES, '07:15', '+01:00'),
};
// Cuenta a mano del 10-16:
//   EDO en papel       1 h 30 min (5400 s) parcial (hecho, con 20 min de redes) → 0,5 × 5400 = 2700
//   despertar 07:15    1800 s cumplido                                          → 1800
//   dormir 01:00       1800 s cumplido (justo a la hora)                         → 1800
//   inglés 30 min      1800 s cumplido                                          → 1800
//   % = (2700 + 1800 + 1800 + 1800) / (5400 + 1800 + 1800 + 1800) = 8100 / 10800 = 75 % → no cumplido
const PORCENTAJE_VIERNES = 8100 / 10800;

// ─────────────────────────────────────────────────────────────────────────────

test('un día armado a mano (10-12) da el % calculado a mano: 71,4 %', () => {
  const { bloques, rutinas, porcentaje } = evaluarDia(DIA_LUNES);
  assert.deepEqual(bloques.map((b) => b.estado), ['parcial']);
  assert.deepEqual(rutinas.map((r) => [r.rutinaId, r.estado]), [['despertar', 'cumplido'], ['dormir', 'cumplido'], ['ingles-pc', 'cumplido']]);
  assert.deepEqual(porcentaje, { porcentaje: PORCENTAJE_LUNES, cumplido: false, pesoSeg: 12600, medibles: 4 });
});

test('otro día armado a mano (10-16, papel con redes) da 75 %', () => {
  const { bloques, porcentaje } = evaluarDia(DIA_VIERNES);
  assert.equal(bloques[0].estado, 'parcial');
  assert.deepEqual(porcentaje, { porcentaje: PORCENTAJE_VIERNES, cumplido: false, pesoSeg: 10800, medibles: 4 });
});

test('varios días: se juntan bloques y rutinas (no es el promedio de los %)', () => {
  const lunes = evaluarDia(DIA_LUNES);
  const viernes = evaluarDia(DIA_VIERNES);
  const r = porcentajeVarios([lunes, viernes], U);
  // (9000 + 8100) / (12600 + 10800) = 17100 / 23400 ≈ 73,08 %. El promedio de los dos % sería ≈ 73,21 %.
  assert.equal(r.porcentaje, 17100 / 23400);
  assert.notEqual(r.porcentaje, (PORCENTAJE_LUNES + PORCENTAJE_VIERNES) / 2);
  assert.equal(r.pesoSeg, 23400);
  assert.equal(r.medibles, 8);
  assert.equal(r.cumplido, false);
  // Un día sin nada medible no cambia el resultado; ninguno da null.
  assert.deepEqual(porcentajeVarios([lunes, { bloques: [], rutinas: [] }, viernes], U), r);
  assert.deepEqual(porcentajeVarios([], U), { porcentaje: null, cumplido: null, pesoSeg: 0, medibles: 0 });
  assert.equal(porcentajeVarios(undefined, U).porcentaje, null);
});

// ── porcentajeDia con estados armados a mano ──

const bloque = (estado, duracionPlanSeg) => ({ estado, duracionPlanSeg });
const rutina = (estado, pesoSeg) => ({ estado, pesoSeg });

test('pesos: cumplido 1, parcial 0,5, fallido 0, ponderados por duración', () => {
  // (1 × 7200 + 0,5 × 3600 + 0 × 1800 + 1 × 1800) / (7200 + 3600 + 1800 + 1800) = 10800 / 14400 = 75 %
  const r = porcentajeDia([bloque('cumplido', 7200), bloque('parcial', 3600)], [rutina('fallido', 1800), rutina('cumplido', 1800)], U);
  assert.deepEqual(r, { porcentaje: 0.75, cumplido: false, pesoSeg: 14400, medibles: 4 });
});

test('pendiente, en curso y no medible no entran al %', () => {
  const r = porcentajeDia(
    [bloque('cumplido', 3600), bloque('pendiente', 7200), bloque('en_curso', 7200), bloque('no_medible', 7200)],
    [rutina('no_medible', 1800), rutina('pendiente', 1800), rutina('fallido', 1800)],
    U,
  );
  assert.deepEqual(r, { porcentaje: 3600 / 5400, cumplido: false, pesoSeg: 5400, medibles: 2 });
});

test('nada medible → porcentaje y cumplido en null', () => {
  assert.deepEqual(porcentajeDia([], [], U), { porcentaje: null, cumplido: null, pesoSeg: 0, medibles: 0 });
  assert.deepEqual(porcentajeDia([bloque('pendiente', 7200)], [rutina('no_medible', 1800)], U), { porcentaje: null, cumplido: null, pesoSeg: 0, medibles: 0 });
  assert.equal(porcentajeDia(undefined, undefined, U).porcentaje, null);
  // Un estado medible sin duración no pesa.
  assert.equal(porcentajeDia([bloque('cumplido', 0)], [rutina('cumplido', NaN)], U).porcentaje, null);
  // Un estado desconocido (o el nombre de algo del prototipo) tampoco.
  assert.equal(porcentajeDia([bloque('toString', 3600), bloque('raro', 3600)], [], U).porcentaje, null);
});

test('día cumplido desde el umbral exacto (80 %)', () => {
  // 7200 / (7200 + 1800) = 0,8 justo.
  const justo = porcentajeDia([bloque('cumplido', 7200)], [rutina('fallido', 1800)], U);
  assert.equal(justo.porcentaje, 0.8);
  assert.equal(justo.cumplido, true);
  assert.equal(porcentajeDia([bloque('cumplido', 7199)], [rutina('fallido', 1800)], U).cumplido, false);
  assert.equal(porcentajeDia([bloque('fallido', 3600)], [], U).porcentaje, 0);
  assert.equal(porcentajeDia([bloque('parcial', 3600)], [], { ...U, dia_cumplido: 0.5 }).cumplido, true);
});

// ── Horas por curso ──

test('horas por curso: Estudio dentro de los bloques de cada curso (10-12)', () => {
  const { conContexto } = evaluarDia(DIA_LUNES);
  // BD I: 90 min de Estudio en su bloque (la IA y la distracción no cuentan). El DBP de 21:40 a 23:30 es fuera de
  // bloque: no suma a ningún curso (solo al área).
  assert.deepEqual(horasPorCurso(conContexto, DIA_LUNES.items, []), { bd1: { bloquesSeg: 90 * MIN, papelSeg: 0 } });
});

test('horas por curso: papel "hecho" suma la duración del bloque menos la actividad en la PC (10-16)', () => {
  const { conContexto } = evaluarDia(DIA_VIERNES);
  // 90 min de bloque − 20 min de redes en la PC = 70 min (lo mismo que "Estudio (sin teclado)" en verdad.json).
  assert.deepEqual(horasPorCurso(conContexto, DIA_VIERNES.items, DIA_VIERNES.checkins), { edo: { bloquesSeg: 0, papelSeg: 70 * MIN } });
  // Sin contexto da lo mismo.
  assert.deepEqual(horasPorCurso(DIA_VIERNES.segmentos, DIA_VIERNES.items, DIA_VIERNES.checkins).edo.papelSeg, 70 * MIN);
  // Con "no hecho" o sin check-in, no suma; el curso aparece igual con 0.
  assert.deepEqual(horasPorCurso(conContexto, DIA_VIERNES.items, [checkin('papel', 'b-edo-vie', 'no_hecho', VIERNES)]), { edo: { bloquesSeg: 0, papelSeg: 0 } });
  assert.deepEqual(horasPorCurso(conContexto, DIA_VIERNES.items, []), { edo: { bloquesSeg: 0, papelSeg: 0 } });
  // Un check-in de otro día no sirve.
  assert.deepEqual(horasPorCurso(conContexto, DIA_VIERNES.items, [checkin('papel', 'b-edo-vie', 'hecho', '2026-10-09')]).edo.papelSeg, 0);
});

test('horas por curso: si los segmentos no traen contexto, lo calcula con los ítems', () => {
  assert.deepEqual(horasPorCurso(DIA_LUNES.segmentos, DIA_LUNES.items, []), { bd1: { bloquesSeg: 90 * MIN, papelSeg: 0 } });
});

test('horas por curso: el Estudio en clases y en rutinas no es de ningún curso; varios bloques suman', () => {
  const F = '2026-10-05';
  const s = segmentosDe(F);
  const items = {
    fecha: F, enCiclo: true, excepciones: [],
    bloques: [bloqueDia('b-bd1-lun', F), { ...bloqueDia('b-bd1-lun', F), id: `b-extra@${F}`, bloqueId: 'b-extra', curso: 'bd1', inicio: t(F, '18:00'), fin: t(F, '19:00'), finPlan: t(F, '19:00') }],
    clases: [claseDia('edo', F, '10:00', '12:00')],
    rutinas: [rutinaDia('ingles-pc', F)],
  };
  const segmentos = [s('10:00', '12:00'), s('15:00', '16:00'), s('18:00', '18:30'), s('21:00', '21:30', 'estudio', ['Estudio', 'Inglés'])];
  assert.deepEqual(horasPorCurso(segmentos, items, []), { bd1: { bloquesSeg: 90 * MIN, papelSeg: 0 } });
});

test('horas por curso: el Estudio en la PC durante el papel va a bloquesSeg y no se cuenta dos veces', () => {
  const F = '2026-10-07';
  const s = segmentosDe(F);
  const items = { fecha: F, enCiclo: true, excepciones: [], bloques: [bloqueDia('b-edo-mie', F)], clases: [], rutinas: [] };
  const hecho = [checkin('papel', 'b-edo-mie', 'hecho', F)];
  // Bloque 20:00–21:30: 15 min de Estudio en la PC, 5 min de IA y el resto en AFK.
  const segmentos = [s('19:30', '20:10', 'neutral'), s('20:10', '20:25', 'estudio', ['Estudio', 'Matemáticas']), s('20:25', '20:30', 'ia'), s('20:30', '21:30', 'afk')];
  const r = horasPorCurso(segmentos, items, hecho);
  // papel = 90 − (10 neutral + 15 estudio + 5 IA) = 60 min; bloques = 15 min. Suman lo que duró el bloque menos lo que no fue estudio.
  assert.deepEqual(r, { edo: { bloquesSeg: 15 * MIN, papelSeg: 60 * MIN } });
  // Con la PC en AFK todo el bloque, los 90 min son de papel (10-07).
  assert.equal(horasPorCurso([s('20:00', '21:30', 'afk')], items, hecho).edo.papelSeg, 90 * MIN);
  // Con la PC activa todo el bloque, el papel no suma (nunca negativo).
  assert.equal(horasPorCurso([s('19:00', '22:00', 'distraccion')], items, hecho).edo.papelSeg, 0);
});

test('horas por curso: listas vacías', () => {
  assert.deepEqual(horasPorCurso([], { fecha: '2026-10-08', enCiclo: true, excepciones: [], bloques: [], clases: [], rutinas: [] }, []), {});
  assert.deepEqual(horasPorCurso(undefined, undefined, undefined), {});
});

// ── Horas por área ──

test('horas por área: todo el Estudio, dentro y fuera de los bloques (10-12)', () => {
  // Programación: 90 min en el bloque + 110 min de DBP fuera = 200 min; Inglés: 30 min.
  assert.deepEqual(horasPorArea(DIA_LUNES.segmentos), { 'Programación': 200 * MIN, 'Inglés': 30 * MIN });
  // Con contexto da lo mismo.
  assert.deepEqual(horasPorArea(evaluarDia(DIA_LUNES).conContexto), horasPorArea(DIA_LUNES.segmentos));
});

test('horas por área: sin área → "Sin área"; lo que no es Estudio no cuenta; vacío → {}', () => {
  const s = segmentosDe('2026-10-05');
  const segmentos = [s('09:00', '09:10', 'estudio', ['Estudio']), s('09:10', '10:00', 'ia'), s('10:00', '10:20', 'estudio', ['Estudio', 'Matemáticas'])];
  assert.deepEqual(horasPorArea(segmentos), { [SIN_AREA]: 10 * MIN, 'Matemáticas': 20 * MIN });
  assert.deepEqual(horasPorArea([]), {});
  assert.deepEqual(horasPorArea(undefined), {});
});

test('no modifica las entradas', () => {
  const copia = structuredClone(DIA_LUNES);
  const { conContexto, bloques, rutinas } = evaluarDia(DIA_LUNES);
  const copiaEstados = structuredClone({ bloques, rutinas });
  porcentajeDia(bloques, rutinas, U);
  porcentajeVarios([{ bloques, rutinas }], U);
  horasPorCurso(DIA_LUNES.segmentos, DIA_LUNES.items, DIA_LUNES.checkins);
  horasPorCurso(conContexto, DIA_LUNES.items, DIA_LUNES.checkins);
  horasPorArea(DIA_LUNES.segmentos);
  assert.deepEqual(DIA_LUNES, copia);
  assert.deepEqual({ bloques, rutinas }, copiaEstados);
});
