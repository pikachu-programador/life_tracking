// Pruebas de web/motor/cumplimiento.js (F4-02, con lo de F5-03): estado de cada bloque y de cada rutina (§9).
//
// Los bloques y rutinas salen de datos-ejemplo/plan-ejemplo.json, convertidos a mano a BloqueDia y RutinaDia
// (horario.js se escribe en paralelo). Los segmentos se arman a mano siguiendo la descripción de cada día en
// datos-ejemplo/README.md y verdad.json. Horas de Lima; "+HH:MM" es la madrugada del día siguiente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluarBloque, evaluarRutina } from '../web/motor/cumplimiento.js';
import { asignarContexto } from '../web/motor/contexto.js';
import { instanteLocal, instanteDelPlan, sumarDias, diaDe } from '../web/motor/fechas.js';
import { SIN_AREA } from '../web/motor/tipos.js';
import { planEjemplo, eventosEjemplo } from './ayudantes/ejemplo.js';

const PLAN = planEjemplo();
const U = PLAN.umbrales; // tolerancia 10 min, foco 70 % / 40 %, día 80 %, despertar y dormir 30 min
const MIN = 60 * 1000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** "HH:MM" de `fecha` en Lima → ms; "+HH:MM" = del día siguiente. */
function t(fecha, hora) {
  return hora.startsWith('+') ? instanteLocal(sumarDias(fecha, 1), hora.slice(1)) : instanteLocal(fecha, hora);
}

const CATEGORIA = {
  'estudio': ['Estudio', 'Programación'],
  'distraccion': ['Distracción', 'Redes'],
  'ia': ['IA'],
  'neutral': ['Neutral', 'Sistema'],
  'sin-clasificar': ['Uncategorized'],
  'afk': null,
  'sin-pc': null,
};

/** Fábrica de segmentos de un día: seg('15:00', '16:00', 'estudio', ['Estudio', 'Inglés']). */
function segmentosDe(fecha) {
  return (de, a, clase = 'estudio', categoria = CATEGORIA[clase]) => ({
    inicio: t(fecha, de), fin: t(fecha, a), clase, categoria,
    area: clase === 'estudio' ? (categoria?.[1] ?? SIN_AREA) : null,
    app: clase === 'afk' || clase === 'sin-pc' ? null : 'app-ficticia.exe',
    titulo: null, url: null, dominio: null, audible: false, incognito: false,
  });
}

/** BloqueDia de un bloque del plan de ejemplo. `fin`: 'HH:MM' si terminó antes. */
function bloqueDia(id, fecha, { fin, ...extra } = {}) {
  const b = PLAN.bloques.find((x) => x.id === id);
  const inicio = instanteDelPlan(fecha, b.inicio);
  let finPlan = instanteDelPlan(fecha, b.fin);
  if (finPlan <= inicio) finPlan += DIA;
  const finReal = fin ? t(fecha, fin) : finPlan;
  return {
    id: `${id}@${fecha}`, bloqueId: id, tipo: b.tipo, curso: b.curso, inicio, fin: finReal, finPlan,
    nivel: b.nivel, subidoPorExcepcion: false, objetivo: b.objetivo, porQue: b.por_que,
    terminadoAntes: fin ? { fin: finReal, motivo: 'Terminé antes' } : null, ...extra,
  };
}

/** RutinaDia de una rutina del plan de ejemplo (como la daría expandirDia). */
function rutinaDia(id, fecha, extra = {}) {
  const r = PLAN.rutinas.find((x) => x.id === id);
  const inicio = r.inicio ? instanteDelPlan(fecha, r.inicio) : null;
  let fin = r.fin ? instanteDelPlan(fecha, r.fin) : null;
  if (r.medicion !== 'dia_logico' && fin !== null && fin <= inicio) fin += DIA;
  const evento = r.medicion !== 'dia_logico' ? null : (r.evento ?? (/dorm/.test(id) ? 'dormir' : 'despertar'));
  return {
    id: `${id}@${fecha}`, rutinaId: id, nombre: r.nombre, medicion: r.medicion, evento, inicio, fin,
    categoria: r.categoria ?? null, minutosMeta: r.minutos_meta ?? null, toleranciaMin: r.tolerancia_min, ...extra,
  };
}

/** Check-in normalizado (forma Checkin de tipos.js). */
function checkin(tipo, refId, valor, fecha, instante = t(fecha, '23:00')) {
  return { id: null, instante, fecha, tipo, refId, valor, nota: '' };
}

/** DiaLogico de prueba: despertar y dormir en hora de Lima. */
function diaLogico(fecha, despertar, dormir, extra = {}) {
  const inicio = t(fecha, despertar);
  const fin = t(fecha, dormir);
  return {
    fecha, inicio, fin, fuenteInicio: 'actividad', fuenteFin: 'actividad', cerrado: true, sinDatos: false,
    despiertoSeg: (fin - inicio) / 1000, ...extra,
  };
}

/** Intervención de salida de emergencia. */
function salida(bloqueId, instante) {
  return { instante, bloqueId, claseId: null, nivel: 'total', accion: 'salida_emergencia', objetivo: 'web:youtube.com', app: null, url: null, titulo: null, motivo: 'distraccion' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cada tipo de bloque y de rutina en cada estado (Hecho cuando de F4-02)
// ─────────────────────────────────────────────────────────────────────────────

const L = '2026-10-05';            // lunes: BD I 15:00–17:00 (estudio_pc), inglés 21:00–22:00
const s5 = segmentosDe(L);
const BD1 = bloqueDia('b-bd1-lun', L);
const S = '2026-10-17';            // sábado: examen de BD I 14:00–17:00 (total)
const s17 = segmentosDe(S);
const EXAMEN = bloqueDia('b-examen-bd1', S);
const V = '2026-10-16';            // viernes: EDO en papel 16:00–17:30
const s16 = segmentosDe(V);
const PAPEL = bloqueDia('b-edo-vie', V);
const M = '2026-10-06';            // martes: ejercicio 19:30–20:30 (checkin)
const INGLES = rutinaDia('ingles-pc', L);
const EJERCICIO = rutinaDia('ejercicio', M);
const DESPERTAR = rutinaDia('despertar', L);
const DORMIR = rutinaDia('dormir', L);
const diaL = diaLogico(L, '07:05', '23:30');

const CASOS = [
  // Estudio en PC (b-bd1-lun, 15:00–17:00)
  ['estudio_pc', 'cumplido', () => evaluarBloque(BD1, [s5('14:55', '16:50')], [], U)],
  ['estudio_pc', 'parcial', () => evaluarBloque(BD1, [s5('15:20', '17:00')], [], U)],
  ['estudio_pc', 'fallido', () => evaluarBloque(BD1, [s5('15:00', '17:00', 'distraccion')], [], U)],
  ['estudio_pc', 'no_medible', () => evaluarBloque({ ...BD1, fin: BD1.inicio, finPlan: BD1.inicio }, [], [], U)],
  ['estudio_pc', 'pendiente', () => evaluarBloque(BD1, [], [], U, { ahora: t(L, '14:00') })],
  ['estudio_pc', 'en_curso', () => evaluarBloque(BD1, [s5('15:00', '16:00')], [], U, { ahora: t(L, '16:00') })],
  // Examen (b-examen-bd1, 14:00–17:00)
  ['examen', 'cumplido', () => evaluarBloque(EXAMEN, [s17('14:00', '16:50')], [], U)],
  ['examen', 'parcial', () => evaluarBloque(EXAMEN, [s17('14:00', '15:30')], [], U)],
  ['examen', 'fallido', () => evaluarBloque(EXAMEN, [s17('14:00', '17:00')], [], U, { intervenciones: [salida(EXAMEN.id, t(S, '16:00'))] })],
  ['examen', 'no_medible', () => evaluarBloque({ ...EXAMEN, finPlan: EXAMEN.inicio, fin: EXAMEN.inicio }, [], [], U)],
  ['examen', 'pendiente', () => evaluarBloque(EXAMEN, [], [], U, { ahora: t(S, '13:59') })],
  ['examen', 'en_curso', () => evaluarBloque(EXAMEN, [s17('14:00', '15:00')], [], U, { ahora: t(S, '15:00') })],
  // Estudio en papel (b-edo-vie, 16:00–17:30)
  ['estudio_papel', 'cumplido', () => evaluarBloque(PAPEL, [s16('16:00', '17:30', 'afk')], [checkin('papel', 'b-edo-vie', 'hecho', V)], U)],
  ['estudio_papel', 'parcial', () => evaluarBloque(PAPEL, [s16('16:35', '16:55', 'distraccion')], [checkin('papel', 'b-edo-vie', 'hecho', V)], U)],
  ['estudio_papel', 'fallido', () => evaluarBloque(PAPEL, [], [checkin('papel', 'b-edo-vie', 'no_hecho', V)], U)],
  ['estudio_papel', 'no_medible', () => evaluarBloque({ ...PAPEL, finPlan: PAPEL.inicio, fin: PAPEL.inicio }, [], [], U)],
  ['estudio_papel', 'pendiente', () => evaluarBloque(PAPEL, [], [], U, { ahora: t(V, '18:00') })],
  ['estudio_papel', 'en_curso', () => evaluarBloque(PAPEL, [], [], U, { ahora: t(V, '16:30') })],
  // Rutina pc (ingles-pc, 21:00–22:00, meta 30 min)
  ['pc', 'cumplido', () => evaluarRutina(INGLES, [s5('21:00', '21:30', 'estudio', ['Estudio', 'Inglés'])], [], diaL, U)],
  ['pc', 'parcial', () => evaluarRutina(INGLES, [s5('21:00', '21:20', 'estudio', ['Estudio', 'Inglés'])], [], diaL, U)],
  ['pc', 'fallido', () => evaluarRutina(INGLES, [s5('21:00', '21:10', 'estudio', ['Estudio', 'Inglés'])], [], diaL, U)],
  ['pc', 'no_medible', () => evaluarRutina({ ...INGLES, minutosMeta: null }, [], [], diaL, U)],
  ['pc', 'pendiente', () => evaluarRutina(INGLES, [], [], diaL, U, { ahora: t(L, '20:00') })],
  ['pc', 'en_curso', () => evaluarRutina(INGLES, [s5('21:00', '21:10', 'estudio', ['Estudio', 'Inglés'])], [], diaL, U, { ahora: t(L, '21:10') })],
  // Rutina con check-in (ejercicio, martes 19:30–20:30): no tiene parcial
  ['checkin', 'cumplido', () => evaluarRutina(EJERCICIO, [], [checkin('rutina', 'ejercicio', 'hecho', M)], diaLogico(M, '07:00', '23:00'), U)],
  ['checkin', 'fallido', () => evaluarRutina(EJERCICIO, [], [checkin('rutina', 'ejercicio', 'no_hecho', M)], diaLogico(M, '07:00', '23:00'), U)],
  ['checkin', 'pendiente', () => evaluarRutina(EJERCICIO, [], [], diaLogico(M, '07:00', '20:00', { cerrado: false }), U, { ahora: t(M, '20:00') })],
  ['checkin', 'no_medible', () => evaluarRutina({ ...EJERCICIO, medicion: 'otra' }, [], [], diaLogico(M, '07:00', '23:00'), U)],
  // Despertar y dormir (día lógico; tolerancia 30 min)
  ['dia_logico', 'cumplido', () => evaluarRutina(DESPERTAR, [], [], diaLogico(L, '07:20', '23:30'), U)],
  ['dia_logico', 'parcial', () => evaluarRutina(DESPERTAR, [], [], diaLogico(L, '07:45', '23:30'), U)],
  ['dia_logico', 'fallido', () => evaluarRutina(DORMIR, [], [], diaLogico(L, '07:05', '+02:10'), U)],
  ['dia_logico', 'no_medible', () => evaluarRutina(DESPERTAR, [], [], diaLogico(L, '04:00', '04:00', { sinDatos: true, fuenteInicio: 'inicio_dia', fuenteFin: 'sin_datos' }), U)],
  ['dia_logico', 'pendiente', () => evaluarRutina(DORMIR, [], [], diaLogico(L, '07:05', '20:00', { cerrado: false, fuenteFin: 'ahora' }), U, { ahora: t(L, '20:00') })],
];

for (const [tipo, estado, evaluar] of CASOS) {
  test(`${tipo}: ${estado}`, () => {
    const r = evaluar();
    assert.equal(r.estado, estado, r.motivo);
    assert.equal(typeof r.motivo, 'string');
    assert.ok(r.motivo.length > 0, 'siempre trae un motivo');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Estudio en PC y examen
// ─────────────────────────────────────────────────────────────────────────────

test('estudio_pc cumplido: el estudio ya venía de antes → retraso 0; la forma completa de EstadoBloque', () => {
  const r = evaluarBloque(BD1, [s5('14:55', '16:40'), s5('16:40', '17:00', 'distraccion')], [], U);
  assert.deepEqual(r, {
    id: 'b-bd1-lun@2026-10-05', bloqueId: 'b-bd1-lun', tipo: 'estudio_pc', curso: 'bd1',
    inicio: t(L, '15:00'), fin: t(L, '17:00'), duracionPlanSeg: 7200,
    estado: 'cumplido', foco: 100 / 120, estudioSeg: 6000, iaSeg: 0, distraccionSeg: 1200,
    retrasoMin: 0, salidaEmergencia: false, checkin: null, motivo: 'Foco 83 %, empezó a tiempo',
  });
});

test('10-12: BD I empieza 20 min tarde con buen foco → parcial', () => {
  // README: "Bloque de BD I empieza 20 min tarde, con buen foco". verdad.json: distracción de 12:30 a 15:20 y
  // estudio de BD I (con algo de IA) de 15:20 a 17:00.
  const F = '2026-10-12';
  const s = segmentosDe(F);
  const segmentos = [s('12:30', '15:20', 'distraccion'), s('15:20', '16:50'), s('16:50', '17:00', 'ia'), s('17:00', '19:00', 'distraccion')];
  const r = evaluarBloque(bloqueDia('b-bd1-lun', F), segmentos, [], U);
  assert.equal(r.estado, 'parcial');
  assert.equal(r.retrasoMin, 20);
  assert.equal(r.foco, 90 / 120); // 75 %: buen foco, pero tarde
  assert.equal(r.distraccionSeg, 20 * 60); // la de 15:00 a 15:20; la de antes y la de después no cuentan
  assert.equal(r.iaSeg, 10 * 60);
  assert.equal(r.motivo, 'Empezó 20 min tarde (tolerancia 10 min)');
});

test('parcial por foco, y por foco y tardanza a la vez', () => {
  const porFoco = evaluarBloque(BD1, [s5('15:05', '16:20')], [], U); // 75 min = 62,5 %
  assert.equal(porFoco.estado, 'parcial');
  assert.equal(porFoco.retrasoMin, 5);
  assert.equal(porFoco.motivo, 'Foco 62 % (meta 70 %)');

  const ambos = evaluarBloque(BD1, [s5('15:20', '16:30')], [], U); // 70 min = 58 %, 20 min tarde
  assert.equal(ambos.estado, 'parcial');
  assert.equal(ambos.motivo, 'Empezó 20 min tarde (tolerancia 10 min) y foco 58 % (meta 70 %)');
});

test('fallido: foco < 40 %, sin estudio o sin PC', () => {
  const bajo = evaluarBloque(BD1, [s5('15:00', '15:40'), s5('15:40', '17:00', 'distraccion')], [], U); // 33 %
  assert.equal(bajo.estado, 'fallido');
  assert.equal(bajo.motivo, 'Foco 33 % (mínimo 40 %)');

  const sinEstudio = evaluarBloque(BD1, [s5('15:00', '17:00', 'distraccion')], [], U);
  assert.equal(sinEstudio.estado, 'fallido');
  assert.equal(sinEstudio.foco, 0);
  assert.equal(sinEstudio.retrasoMin, null);
  assert.equal(sinEstudio.motivo, 'No hubo estudio en el bloque');

  // PC apagada todo el bloque (o sin segmentos): no empezó.
  const sinPc = evaluarBloque(BD1, [s5('14:00', '18:00', 'sin-pc')], [], U);
  assert.equal(sinPc.estado, 'fallido');
  assert.equal(sinPc.motivo, 'No empezó (sin datos de la PC)');
  assert.equal(evaluarBloque(BD1, [], [], U).motivo, 'No empezó (sin datos de la PC)');
  // En AFK la PC sí estaba encendida: no es "sin datos", es que no estudió.
  assert.equal(evaluarBloque(BD1, [s5('15:00', '17:00', 'afk')], [], U).motivo, 'No hubo estudio en el bloque');
});

test('día sin datos ya terminado (10-13): lo de la PC es fallido; lo de check-in se evalúa igual que siempre', () => {
  // §6.7, reglas entre módulos. 10-13 (martes) no tiene ningún evento: el día lógico es [04:00, 04:00) y,
  // recortados a él, no queda ningún segmento.
  const F = '2026-10-13';
  const dia = diaLogico(F, '04:00', '04:00', { sinDatos: true, fuenteInicio: 'inicio_dia', fuenteFin: 'sin_datos' });
  for (const id of ['b-dbp-mar', 'b-p3-mar-noche']) {
    const r = evaluarBloque(bloqueDia(id, F), [], [], U);
    assert.equal(r.estado, 'fallido', id);
    assert.equal(r.motivo, 'No empezó (sin datos de la PC)');
  }
  const ingles = evaluarRutina(rutinaDia('ingles-pc', F), [], [], dia, U);
  assert.equal(ingles.estado, 'fallido');
  assert.equal(ingles.motivo, 'No empezó (sin datos de la PC)');
  const todoElDia = evaluarRutina({ ...rutinaDia('ingles-pc', F), inicio: null, fin: null }, [], [], dia, U);
  assert.equal(todoElDia.motivo, 'No empezó (sin datos de la PC)');
  // Por check-in: igual que siempre.
  assert.equal(evaluarRutina(rutinaDia('ejercicio', F), [], [checkin('rutina', 'ejercicio', 'hecho', F)], dia, U).estado, 'cumplido');
  assert.equal(evaluarRutina(rutinaDia('ejercicio', F), [], [], dia, U).estado, 'fallido');
  const papel = { ...bloqueDia('b-edo-vie', '2026-10-16'), id: `b-edo-vie@${F}`, inicio: t(F, '16:00'), fin: t(F, '17:30'), finPlan: t(F, '17:30') };
  assert.equal(evaluarBloque(papel, [], [checkin('papel', 'b-edo-vie', 'hecho', F)], U).estado, 'cumplido');
  // Despertar y dormir: no medibles.
  assert.equal(evaluarRutina(rutinaDia('despertar', F), [], [], dia, U).estado, 'no_medible');
  assert.equal(evaluarRutina(rutinaDia('dormir', F), [], [], dia, U).estado, 'no_medible');
});

test('salida de emergencia: fallido aunque el foco sea perfecto; solo cuenta la de ese bloque', () => {
  const segmentos = [s5('15:00', '17:00')];
  const r = evaluarBloque(BD1, segmentos, [], U, { intervenciones: [salida(BD1.id, t(L, '16:00'))] });
  assert.equal(r.estado, 'fallido');
  assert.equal(r.salidaEmergencia, true);
  assert.equal(r.foco, 1);
  assert.equal(r.motivo, 'Usó la salida de emergencia');
  // La de otro bloque (u otro día) o un aviso no cuentan.
  const otras = [salida('b-bd1-lun@2026-10-12', t('2026-10-12', '16:00')), { ...salida(BD1.id, t(L, '16:00')), accion: 'aviso' }];
  const otro = evaluarBloque(BD1, segmentos, [], U, { intervenciones: otras });
  assert.equal(otro.estado, 'cumplido');
  assert.equal(otro.salidaEmergencia, false);
});

test('la IA no cuenta como foco', () => {
  const r = evaluarBloque(BD1, [s5('15:00', '16:00'), s5('16:00', '17:00', 'ia')], [], U);
  assert.equal(r.foco, 0.5);
  assert.equal(r.iaSeg, 3600);
  assert.equal(r.estado, 'parcial');
});

test('bordes del bloque: [inicio, fin)', () => {
  // Termina justo cuando empieza el bloque, y empieza justo cuando termina: no cuentan.
  const fuera = evaluarBloque(BD1, [s5('14:00', '15:00'), s5('17:00', '18:00')], [], U);
  assert.equal(fuera.estudioSeg, 0);
  assert.equal(fuera.estado, 'fallido');
  // Empieza antes y termina dentro: cuenta lo de dentro; retraso 0.
  const antes = evaluarBloque(BD1, [s5('14:00', '15:30')], [], U);
  assert.equal(antes.estudioSeg, 30 * 60);
  assert.equal(antes.retrasoMin, 0);
  // Empieza dentro y termina después: cuenta hasta el fin del bloque.
  const despues = evaluarBloque(BD1, [s5('16:30', '18:00')], [], U);
  assert.equal(despues.estudioSeg, 30 * 60);
  assert.equal(despues.retrasoMin, 90);
  // Cubre todo el bloque.
  const todo = evaluarBloque(BD1, [s5('13:00', '19:00')], [], U);
  assert.equal(todo.estudioSeg, 7200);
  assert.equal(todo.foco, 1);
});

test('umbrales exactos: 10 min de retraso es a tiempo; 70 % es cumplido; 40 % es parcial', () => {
  const justo = evaluarBloque(BD1, [s5('15:10', '17:00')], [], U); // 10 min tarde, 110 min
  assert.equal(justo.retrasoMin, 10);
  assert.equal(justo.estado, 'cumplido');

  const unSegundoMas = { ...s5('15:10', '17:00'), inicio: t(L, '15:10') + 1000 };
  const tarde = evaluarBloque(BD1, [unSegundoMas], [], U);
  assert.equal(tarde.estado, 'parcial');
  assert.equal(tarde.motivo, 'Empezó 11 min tarde (tolerancia 10 min)');

  const setenta = evaluarBloque(BD1, [s5('15:00', '16:24')], [], U); // 84 de 120 min = 70 %
  assert.equal(setenta.estado, 'cumplido');
  assert.equal(setenta.motivo, 'Foco 70 %, empezó a tiempo');

  const cuarenta = evaluarBloque(BD1, [s5('15:00', '15:48')], [], U); // 48 de 120 min = 40 %
  assert.equal(cuarenta.estado, 'parcial');

  // Con otros umbrales (los del plan son ajustables): foco 90 % y sin tolerancia.
  const exigente = { ...U, foco_cumplido: 0.9, tolerancia_inicio_min: 0 };
  assert.equal(evaluarBloque(BD1, [s5('15:00', '16:50')], [], exigente).estado, 'cumplido'); // 110 de 120 min = 91 %
  assert.equal(evaluarBloque(BD1, [s5('15:00', '16:40')], [], exigente).motivo, 'Foco 83 % (meta 90 %)');
  assert.equal(evaluarBloque(BD1, [s5('15:01', '17:00')], [], exigente).motivo, 'Empezó 1 min tarde (tolerancia 0 min)');
});

test('terminado antes: cuenta hasta el fin real, pero el foco se divide entre la duración planificada', () => {
  const terminado = bloqueDia('b-bd1-lun', L, { fin: '16:00' });
  const r = evaluarBloque(terminado, [s5('15:00', '17:00')], [], U);
  assert.equal(r.fin, t(L, '16:00'));
  assert.equal(r.duracionPlanSeg, 7200);
  assert.equal(r.estudioSeg, 3600);
  assert.equal(r.foco, 0.5);
  assert.equal(r.estado, 'parcial');
  // Después de su fin real ya no está en curso.
  assert.equal(evaluarBloque(terminado, [s5('15:00', '16:00')], [], U, { ahora: t(L, '16:30') }).estado, 'parcial');
});

test('examen de BD I (10-17, 3 h en nivel total): cumplido con 2 h 50 min de estudio', () => {
  const r = evaluarBloque(EXAMEN, [s17('13:58', '16:50'), s17('16:50', '17:00', 'neutral')], [], U);
  assert.equal(r.duracionPlanSeg, 3 * 3600);
  assert.equal(r.foco, 170 / 180);
  assert.equal(r.retrasoMin, 0);
  assert.equal(r.estado, 'cumplido');
});

test('bloque que cruza la medianoche (10-06, 23:30–00:30)', () => {
  const F = '2026-10-06';
  const s = segmentosDe(F);
  const b = bloqueDia('b-p3-mar-noche', F);
  assert.equal(b.finPlan - b.inicio, HORA);
  const r = evaluarBloque(b, [s('23:00', '23:35', 'distraccion'), s('23:35', '+00:30'), s('+00:30', '+03:00', 'distraccion')], [], U);
  assert.equal(r.retrasoMin, 5);
  assert.equal(r.estudioSeg, 55 * 60);
  assert.equal(r.distraccionSeg, 5 * 60);
  assert.equal(r.estado, 'cumplido');
});

test('según "ahora": pendiente, en curso (solo lo que ya pasó) y final', () => {
  const segmentos = [s5('15:00', '16:00'), s5('16:00', '17:00', 'distraccion')];
  const antes = evaluarBloque(BD1, segmentos, [], U, { ahora: t(L, '14:59') });
  assert.equal(antes.estado, 'pendiente');
  assert.equal(antes.foco, null);
  assert.equal(antes.motivo, 'Empieza a las 15:00');

  const enCurso = evaluarBloque(BD1, segmentos, [], U, { ahora: t(L, '16:30') });
  assert.equal(enCurso.estado, 'en_curso');
  assert.equal(enCurso.estudioSeg, 3600);
  assert.equal(enCurso.distraccionSeg, 1800); // de 16:00 a 16:30, no hasta las 17:00
  assert.equal(enCurso.foco, 0.5);
  assert.equal(enCurso.motivo, 'En curso: 1 h de estudio de 2 h');

  // Justo a las 17:00 ya terminó ([inicio, fin)).
  assert.equal(evaluarBloque(BD1, segmentos, [], U, { ahora: t(L, '17:00') }).estado, 'parcial');
  // Por defecto (ahora = Infinity), el día ya pasó.
  assert.equal(evaluarBloque(BD1, segmentos, [], U).estado, 'parcial');
});

test('con contexto: cuenta solo los segmentos de ese bloque (y da lo mismo que por tiempo)', () => {
  const items = { fecha: L, enCiclo: true, excepciones: [], bloques: [BD1], clases: [], rutinas: [] };
  const segmentos = [s5('14:00', '15:20', 'distraccion'), s5('15:20', '16:50'), s5('16:50', '18:00', 'ia')];
  const conContexto = asignarContexto(segmentos, items);
  assert.deepEqual(evaluarBloque(BD1, conContexto, [], U), evaluarBloque(BD1, segmentos, [], U));
});

test('dos bloques superpuestos con contexto: cada minuto cuenta para uno solo (el que empezó antes)', () => {
  // A: BD I 15:00–17:00; B: un bloque de DBP inventado de 16:00 a 18:00.
  const B = { ...BD1, id: `b-dbp-x@${L}`, bloqueId: 'b-dbp-x', curso: 'dbp', inicio: t(L, '16:00'), fin: t(L, '18:00'), finPlan: t(L, '18:00') };
  const items = { fecha: L, enCiclo: true, excepciones: [], bloques: [BD1, B], clases: [], rutinas: [] };
  const segmentos = asignarContexto([s5('15:00', '18:00')], items);
  const a = evaluarBloque(BD1, segmentos, [], U);
  const b = evaluarBloque(B, segmentos, [], U);
  assert.equal(a.estudioSeg, 7200);
  assert.equal(b.estudioSeg, 3600); // solo de 17:00 a 18:00
  assert.equal(b.retrasoMin, 60);
  assert.equal(a.estudioSeg + b.estudioSeg, 3 * 3600); // nada se cuenta dos veces
});

test('distracción en tiempo libre no cuenta para ningún bloque (Hecho cuando de F4-01)', () => {
  const items = { fecha: L, enCiclo: true, excepciones: [], bloques: [BD1], clases: [], rutinas: [] };
  const segmentos = asignarContexto([
    s5('09:00', '14:58', 'distraccion'), s5('14:58', '17:00'), s5('17:00', '23:30', 'distraccion'),
  ], items);
  const r = evaluarBloque(BD1, segmentos, [], U);
  assert.equal(r.distraccionSeg, 0);
  assert.equal(r.estado, 'cumplido');
  // Toda esa distracción quedó como tiempo libre.
  const libre = segmentos.filter((s) => s.clase === 'distraccion');
  assert.ok(libre.every((s) => s.contexto === 'libre' && s.bloqueId === null));
});

// ─────────────────────────────────────────────────────────────────────────────
// Estudio en papel (F5-03)
// ─────────────────────────────────────────────────────────────────────────────

test('F5-03: papel con la PC en AFK y check-in "hecho" → cumplido', () => {
  // README: "Durante el estudio en papel, la PC queda encendida con la guía abierta y en AFK".
  const segmentos = [s16('15:40', '16:00', 'neutral'), s16('16:00', '17:30', 'afk'), s16('17:30', '18:00', 'neutral')];
  const r = evaluarBloque(PAPEL, segmentos, [checkin('papel', 'b-edo-vie', 'hecho', V, t(V, '17:31'))], U);
  assert.equal(r.estado, 'cumplido');
  assert.equal(r.checkin, 'hecho');
  assert.equal(r.foco, null);
  assert.equal(r.retrasoMin, null);
  assert.equal(r.duracionPlanSeg, 90 * 60);
  assert.equal(r.motivo, 'Hecho, sin distracción en la PC');
});

test('F5-03: papel con 20 min de redes en medio (10-16) → parcial', () => {
  // verdad.json de 10-16: papel 16:00–16:35, redes y video 16:35–16:55, papel 16:55–17:30.
  const segmentos = [
    s16('16:00', '16:35', 'afk'),
    s16('16:35', '16:45', 'distraccion', ['Distracción', 'Redes']),
    s16('16:45', '16:55', 'distraccion', ['Distracción', 'Video']),
    s16('16:55', '17:30', 'afk'),
  ];
  const r = evaluarBloque(PAPEL, segmentos, [checkin('papel', 'b-edo-vie', 'hecho', V, t(V, '17:31'))], U);
  assert.equal(r.estado, 'parcial');
  assert.equal(r.distraccionSeg, 20 * 60);
  assert.equal(r.motivo, 'Hecho, pero con 20 min de distracción en la PC');
});

test('papel con los check-ins de datos-ejemplo (10-09 y 10-16 "hecho")', () => {
  // Se normalizan a mano como lo hará normalizarCheckins (F2-01): fecha = día de AW del instante.
  const checkins = eventosEjemplo('rastreador-checkins_ejemplo').map((e) => ({
    id: null, instante: Date.parse(e.timestamp), fecha: e.data.fecha ?? diaDe(Date.parse(e.timestamp)),
    tipo: e.data.tipo, refId: e.data.ref_id, valor: e.data.valor, nota: e.data.nota ?? '',
  }));
  const F = '2026-10-09';
  assert.equal(evaluarBloque(bloqueDia('b-edo-vie', F), [segmentosDe(F)('16:00', '17:30', 'afk')], checkins, U).estado, 'cumplido');
  assert.equal(evaluarBloque(PAPEL, [s16('16:35', '16:55', 'distraccion')], checkins, U).estado, 'parcial');
  // El miércoles 10-07 también tiene su check-in (EDO en papel cumplido).
  const X = '2026-10-07';
  assert.equal(evaluarBloque(bloqueDia('b-edo-mie', X), [segmentosDe(X)('20:00', '21:30', 'afk')], checkins, U).estado, 'cumplido');
});

test('papel: un roce de menos de 60 s de distracción no lo vuelve parcial; 60 s sí', () => {
  const hecho = [checkin('papel', 'b-edo-vie', 'hecho', V)];
  const roce = { ...s16('16:30', '16:31', 'distraccion'), fin: t(V, '16:30') + 59_000 };
  assert.equal(evaluarBloque(PAPEL, [roce], hecho, U).estado, 'cumplido');
  assert.equal(evaluarBloque(PAPEL, [s16('16:30', '16:31', 'distraccion')], hecho, U).estado, 'parcial');
  // Estudio o neutral en la PC durante el papel no es distracción.
  assert.equal(evaluarBloque(PAPEL, [s16('16:00', '16:30'), s16('16:30', '17:00', 'neutral')], hecho, U).estado, 'cumplido');
});

test('papel: "no hecho" → fallido; sin check-in → pendiente 12 h y después fallido', () => {
  const noHecho = evaluarBloque(PAPEL, [s16('16:00', '17:30', 'afk')], [checkin('papel', 'b-edo-vie', 'no_hecho', V)], U);
  assert.equal(noHecho.estado, 'fallido');
  assert.equal(noHecho.checkin, 'no_hecho');

  const finBloque = t(V, '17:30');
  const esperando = evaluarBloque(PAPEL, [], [], U, { ahora: finBloque + HORA });
  assert.equal(esperando.estado, 'pendiente');
  assert.equal(esperando.motivo, 'Falta el check-in');
  assert.equal(evaluarBloque(PAPEL, [], [], U, { ahora: finBloque + 12 * HORA - 1 }).estado, 'pendiente');
  assert.equal(evaluarBloque(PAPEL, [], [], U, { ahora: finBloque + 12 * HORA }).estado, 'fallido');
  const sinCheckin = evaluarBloque(PAPEL, [], [], U);
  assert.equal(sinCheckin.estado, 'fallido');
  assert.equal(sinCheckin.motivo, 'Sin check-in');
  assert.equal(sinCheckin.checkin, null);
});

test('papel: solo cuenta el check-in de ese bloque y esa fecha; manda el más reciente', () => {
  const ajenos = [
    checkin('papel', 'b-edo-vie', 'hecho', '2026-10-09'),  // otra fecha
    checkin('papel', 'b-edo-mie', 'hecho', V),             // otro bloque
    checkin('rutina', 'b-edo-vie', 'hecho', V),            // otro tipo
    checkin('papel', 'b-edo-vie', 'quizas', V),            // valor desconocido
  ];
  assert.equal(evaluarBloque(PAPEL, [], ajenos, U).motivo, 'Sin check-in');

  const corregido = [checkin('papel', 'b-edo-vie', 'hecho', V, t(V, '17:31')), checkin('papel', 'b-edo-vie', 'no_hecho', V, t(V, '18:00'))];
  assert.equal(evaluarBloque(PAPEL, [], corregido, U).estado, 'fallido');
  assert.equal(evaluarBloque(PAPEL, [], [...corregido].reverse(), U).estado, 'fallido'); // el orden de la lista no importa
  const alReves = [checkin('papel', 'b-edo-vie', 'no_hecho', V, t(V, '17:31')), checkin('papel', 'b-edo-vie', 'hecho', V, t(V, '18:00'))];
  assert.equal(evaluarBloque(PAPEL, [], alReves, U).estado, 'cumplido');
});

test('papel en curso: no mira el check-in hasta que termina', () => {
  const r = evaluarBloque(PAPEL, [], [checkin('papel', 'b-edo-vie', 'hecho', V, t(V, '16:50'))], U, { ahora: t(V, '17:00') });
  assert.equal(r.estado, 'en_curso');
  assert.equal(r.motivo, 'En curso hasta las 17:30');
});

// ─────────────────────────────────────────────────────────────────────────────
// Rutinas
// ─────────────────────────────────────────────────────────────────────────────

const ingles = (de, a, categoria = ['Estudio', 'Inglés']) => s5(de, a, 'estudio', categoria);

test('rutina pc: cumplido, con la forma completa de EstadoRutina', () => {
  const r = evaluarRutina(INGLES, [ingles('21:00', '21:35')], [], diaL, U);
  assert.deepEqual(r, {
    id: 'ingles-pc@2026-10-05', rutinaId: 'ingles-pc', nombre: 'Inglés en la PC', medicion: 'pc',
    estado: 'cumplido', pesoSeg: 1800, logradoSeg: 35 * 60, metaSeg: 1800, horaReal: null, horaObjetivo: null,
    motivo: '35 min de 30 min',
  });
});

test('rutina pc: 50 % exacto es parcial; menos, fallido', () => {
  const mitad = evaluarRutina(INGLES, [ingles('21:00', '21:15')], [], diaL, U);
  assert.equal(mitad.estado, 'parcial');
  assert.equal(mitad.motivo, '15 min de 30 min (al menos la mitad)');
  const poco = evaluarRutina(INGLES, [ingles('21:00', '21:14')], [], diaL, U);
  assert.equal(poco.estado, 'fallido');
  assert.equal(poco.motivo, '14 min de 30 min (menos de la mitad)');
});

test('rutina pc: la categoría es un prefijo, y solo cuenta dentro de la franja', () => {
  const segmentos = [
    ingles('20:30', '21:00'),                                  // antes de la franja
    ingles('21:00', '21:10', ['Estudio', 'Inglés', 'Listening']), // subcategoría: cuenta
    ingles('21:10', '21:20', ['Estudio', 'Programación']),     // otra área
    ingles('21:20', '21:25', ['Estudio']),                     // más corta que el prefijo
    s5('21:25', '21:30', 'ia'),
    ingles('21:30', '21:40', ['Estudio', 'Inglés']),           // cuenta
    s5('21:40', '21:50', 'afk'),
    ingles('21:50', '22:30'),                                  // solo hasta las 22:00
  ];
  const r = evaluarRutina(INGLES, segmentos, [], diaL, U);
  assert.equal(r.logradoSeg, (10 + 10 + 10) * 60);
  assert.equal(r.estado, 'cumplido');
});

test('rutina pc según "ahora": pendiente, en curso y cumplida antes de que termine la franja', () => {
  assert.equal(evaluarRutina(INGLES, [], [], diaL, U, { ahora: t(L, '20:59') }).estado, 'pendiente');
  const enCurso = evaluarRutina(INGLES, [ingles('21:00', '21:30')], [], diaL, U, { ahora: t(L, '21:20') });
  assert.equal(enCurso.estado, 'en_curso');
  assert.equal(enCurso.logradoSeg, 20 * 60); // solo lo que ya pasó
  assert.equal(enCurso.motivo, '20 min de 30 min hasta ahora');
  const yaCumplida = evaluarRutina(INGLES, [ingles('21:05', '21:35')], [], diaL, U, { ahora: t(L, '21:40') });
  assert.equal(yaCumplida.estado, 'cumplido');
  // Al terminar la franja sin llegar: se califica.
  assert.equal(evaluarRutina(INGLES, [ingles('21:00', '21:10')], [], diaL, U, { ahora: t(L, '22:00') }).estado, 'fallido');
});

test('rutina pc sin franja: cuenta en todo el día lógico', () => {
  const todoElDia = { ...INGLES, inicio: null, fin: null };
  const segmentos = [ingles('06:00', '07:05'), ingles('09:00', '09:20'), ingles('23:00', '23:20'), ingles('23:30', '+00:30')];
  // Del día lógico 07:05–23:30: 20 + 20 = 40 min (lo de antes de despertar y después de dormir no cuenta).
  const r = evaluarRutina(todoElDia, segmentos, [], diaL, U);
  assert.equal(r.logradoSeg, 40 * 60);
  assert.equal(r.estado, 'cumplido');
  // Hoy, con el día abierto: en curso mientras no llegue.
  const hoy = diaLogico(L, '07:05', '10:00', { cerrado: false, fuenteFin: 'ahora' });
  const enCurso = evaluarRutina(todoElDia, [ingles('09:00', '09:20')], [], hoy, U, { ahora: t(L, '10:00') });
  assert.equal(enCurso.estado, 'en_curso');
  // Día cerrado: se califica.
  assert.equal(evaluarRutina(todoElDia, [ingles('09:00', '09:20')], [], diaL, U).estado, 'parcial');
});

test('rutina pc no medible: sin categoría o sin minutos de meta', () => {
  assert.equal(evaluarRutina({ ...INGLES, categoria: null }, [], [], diaL, U).estado, 'no_medible');
  assert.equal(evaluarRutina({ ...INGLES, categoria: [] }, [], [], diaL, U).estado, 'no_medible');
  assert.equal(evaluarRutina({ ...INGLES, minutosMeta: 0 }, [], [], diaL, U).estado, 'no_medible');
});

test('rutina con check-in: hecho, no hecho, pendiente mientras el día siga abierto y fallido al cerrarse', () => {
  const dia = diaLogico(M, '07:00', '23:00');
  const hecho = evaluarRutina(EJERCICIO, [], [checkin('rutina', 'ejercicio', 'hecho', M)], dia, U);
  assert.equal(hecho.estado, 'cumplido');
  assert.equal(hecho.pesoSeg, 3600); // franja de 19:30 a 20:30
  assert.equal(hecho.logradoSeg, null);
  assert.equal(evaluarRutina(EJERCICIO, [], [checkin('rutina', 'ejercicio', 'no_hecho', M)], dia, U).motivo, 'Marcado como no hecho');

  // Hoy (día abierto): pendiente antes, durante y después de la franja; se puede marcar más tarde.
  const hoy = diaLogico(M, '07:00', '22:00', { cerrado: false, fuenteFin: 'ahora' });
  for (const hora of ['19:00', '20:29', '20:30', '22:00']) {
    assert.equal(evaluarRutina(EJERCICIO, [], [], hoy, U, { ahora: t(M, hora) }).estado, 'pendiente', hora);
  }
  // Día cerrado (pasado): fallido directo, aunque "ahora" caiga dentro de la franja.
  const pasada = evaluarRutina(EJERCICIO, [], [], dia, U, { ahora: t(M, '20:00') });
  assert.equal(pasada.estado, 'fallido');
  assert.equal(pasada.motivo, 'Sin check-in');
  // Un día abierto con "ahora" más de 24 h después de su inicio ya no puede seguir: fallido.
  assert.equal(evaluarRutina(EJERCICIO, [], [], hoy, U).estado, 'fallido');
  // Un check-in de otro día no sirve.
  assert.equal(evaluarRutina(EJERCICIO, [], [checkin('rutina', 'ejercicio', 'hecho', '2026-10-08')], dia, U).estado, 'fallido');
});

test('rutina con check-in sin franja: pesa 30 min y espera hasta que se cierre el día', () => {
  const sinFranja = { ...EJERCICIO, inicio: null, fin: null };
  const abierto = diaLogico(M, '07:00', '22:00', { cerrado: false, fuenteFin: 'ahora' });
  const r = evaluarRutina(sinFranja, [], [], abierto, U, { ahora: t(M, '22:00') });
  assert.equal(r.estado, 'pendiente');
  assert.equal(r.pesoSeg, 1800);
  assert.equal(evaluarRutina(sinFranja, [], [], diaLogico(M, '07:00', '23:00'), U).estado, 'fallido');
});

test('rutina con check-in de datos-ejemplo: ejercicio del martes 10-13 "hecho"', () => {
  // El check-in es del 2026-10-14T01:00Z = martes 13 a las 20:00 en Lima → fecha 2026-10-13.
  const [evento] = eventosEjemplo('rastreador-checkins_ejemplo').filter((e) => e.data.tipo === 'rutina');
  const instante = Date.parse(evento.timestamp);
  const c = { id: null, instante, fecha: diaDe(instante), tipo: 'rutina', refId: evento.data.ref_id, valor: evento.data.valor, nota: '' };
  assert.equal(c.fecha, '2026-10-13');
  const F = '2026-10-13';
  const r = evaluarRutina(rutinaDia('ejercicio', F), [], [c], diaLogico(F, '07:00', '23:00'), U);
  assert.equal(r.estado, 'cumplido');
});

test('despertar: a tiempo, en la tolerancia, hasta el doble y más tarde', () => {
  const casos = [
    ['06:30', 'cumplido', 'Despertó a las 06:30 (meta 07:00)'],
    ['07:00', 'cumplido', 'Despertó a las 07:00 (meta 07:00)'],
    ['07:30', 'cumplido', 'Despertó a las 07:30: 30 min después de la meta 07:00 (tolerancia 30 min)'],
    ['07:31', 'parcial', null],
    ['08:00', 'parcial', null],
    ['08:01', 'fallido', 'Despertó a las 08:01: 1 h 1 min después de la meta 07:00 (tolerancia 30 min)'],
  ];
  for (const [hora, estado, motivo] of casos) {
    const r = evaluarRutina(DESPERTAR, [], [], diaLogico(L, hora, '23:30'), U);
    assert.equal(r.estado, estado, hora);
    assert.equal(r.horaReal, t(L, hora));
    assert.equal(r.horaObjetivo, t(L, '07:00'));
    assert.equal(r.pesoSeg, 30 * 60);
    if (motivo) assert.equal(r.motivo, motivo);
  }
});

test('dormir: la meta 01:00 es de la madrugada siguiente', () => {
  assert.equal(DORMIR.inicio, t(L, '+01:00'));
  const casos = [['23:30', 'cumplido'], ['+01:00', 'cumplido'], ['+01:30', 'cumplido'], ['+01:40', 'parcial'], ['+02:00', 'parcial'], ['+02:10', 'fallido']];
  for (const [hora, estado] of casos) {
    const r = evaluarRutina(DORMIR, [], [], diaLogico(L, '07:05', hora), U);
    assert.equal(r.estado, estado, hora);
    assert.equal(r.horaReal, t(L, hora));
  }
  assert.equal(evaluarRutina(DORMIR, [], [], diaLogico(L, '07:05', '+01:40'), U).motivo,
    'Se durmió a las 01:40: 40 min después de la meta 01:00 (tolerancia 30 min)');
});

test('10-12 según verdad.json: despertó 07:05 y se durmió 23:30 → ambos cumplidos', () => {
  const F = '2026-10-12';
  const dia = diaLogico(F, '07:05', '23:30');
  assert.equal(evaluarRutina(rutinaDia('despertar', F), [], [], dia, U).estado, 'cumplido');
  assert.equal(evaluarRutina(rutinaDia('dormir', F), [], [], dia, U).estado, 'cumplido');
});

test('despertar y dormir no medibles o pendientes', () => {
  // 10-13, día sin datos (pasado y cerrado): no se puede medir.
  const sinDatos = diaLogico('2026-10-13', '04:00', '04:00', { sinDatos: true, fuenteInicio: 'inicio_dia', fuenteFin: 'sin_datos' });
  for (const id of ['despertar', 'dormir']) {
    const r = evaluarRutina(rutinaDia(id, '2026-10-13'), [], [], sinDatos, U);
    assert.equal(r.estado, 'no_medible', id);
    assert.equal(r.horaReal, null);
  }
  // Hoy sin actividad ni check-in todavía: despertar y dormir, pendientes.
  const hoyVacio = { ...sinDatos, cerrado: false, fuenteFin: 'ahora' };
  assert.equal(evaluarRutina(rutinaDia('despertar', '2026-10-13'), [], [], hoyVacio, U).estado, 'pendiente');
  assert.equal(evaluarRutina(rutinaDia('dormir', '2026-10-13'), [], [], hoyVacio, U).estado, 'pendiente');
  // Día sin actividad en la PC pero con check-ins de despertar y dormir: sí se miden.
  const conCheckins = diaLogico('2026-10-13', '06:50', '+00:10', { sinDatos: true, fuenteInicio: 'checkin', fuenteFin: 'checkin' });
  assert.equal(evaluarRutina(rutinaDia('despertar', '2026-10-13'), [], [], conCheckins, U).estado, 'cumplido');
  assert.equal(evaluarRutina(rutinaDia('dormir', '2026-10-13'), [], [], conCheckins, U).estado, 'cumplido');
  // Fin 'sin_datos' sin check-in: no medible.
  assert.equal(evaluarRutina(DORMIR, [], [], diaLogico(L, '07:05', '23:30', { fuenteFin: 'sin_datos' }), U).estado, 'no_medible');
  // La hora es solo el inicio de día de AW (no hubo check-in ni hueco de sueño): no se sabe la real.
  assert.equal(evaluarRutina(DESPERTAR, [], [], diaLogico(L, '04:00', '23:30', { fuenteInicio: 'inicio_dia' }), U).estado, 'no_medible');
  assert.equal(evaluarRutina(DORMIR, [], [], diaLogico(L, '07:05', '+04:00', { fuenteFin: 'inicio_dia' }), U).estado, 'no_medible');
  // Dormir de un día que no se cerró (hoy): pendiente; despertar ya se puede medir.
  const abierto = diaLogico(L, '07:05', '21:00', { cerrado: false, fuenteFin: 'ahora' });
  assert.equal(evaluarRutina(DORMIR, [], [], abierto, U).estado, 'pendiente');
  assert.equal(evaluarRutina(DESPERTAR, [], [], abierto, U).estado, 'cumplido');
  // Con check-in de despertar sí se mide.
  assert.equal(evaluarRutina(DESPERTAR, [], [], diaLogico(L, '07:10', '23:30', { fuenteInicio: 'checkin' }), U).estado, 'cumplido');
});

test('despertar y dormir: sin evento se deduce del id o del nombre', () => {
  const dia = diaLogico(L, '08:10', '+02:30');
  assert.equal(evaluarRutina({ ...DESPERTAR, evento: null }, [], [], dia, U).horaReal, dia.inicio);
  assert.equal(evaluarRutina({ ...DORMIR, evento: null }, [], [], dia, U).horaReal, dia.fin);
  assert.equal(evaluarRutina({ ...DORMIR, evento: null, rutinaId: 'noche', nombre: 'Hora de dormir' }, [], [], dia, U).horaReal, dia.fin);
  assert.equal(evaluarRutina({ ...DORMIR, evento: null, rutinaId: 'x', nombre: 'X' }, [], [], dia, U).estado, 'no_medible');
});

test('no modifica las entradas', () => {
  const segmentos = [s5('15:00', '16:00'), ingles('21:00', '21:30')];
  const checkins = [checkin('papel', 'b-edo-vie', 'hecho', V)];
  const entradas = [BD1, PAPEL, INGLES, DORMIR, segmentos, checkins, diaL, U];
  const copias = structuredClone(entradas);
  evaluarBloque(BD1, segmentos, checkins, U, { intervenciones: [salida(BD1.id, 0)] });
  evaluarBloque(PAPEL, segmentos, checkins, U);
  evaluarRutina(INGLES, segmentos, checkins, diaL, U);
  evaluarRutina(DORMIR, segmentos, checkins, diaL, U);
  assert.deepEqual(entradas, copias);
});
