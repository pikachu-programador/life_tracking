// Pruebas de agregarPeriodo y METRICAS (web/motor/resumen.js, V-02).
//
// Los resúmenes diarios se arman a mano (no salen de resumirDia): así cada valor esperado se puede
// calcular en un comentario. H = 1 hora en segundos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agregarPeriodo, compararPeriodos, METRICAS } from '../web/motor/resumen.js';
import { instanteLocal, sumarDias } from '../web/motor/fechas.js';
import { DIAS_SEMANA, CLAVES_METRICAS } from '../web/motor/tipos.js';

const H = 3600;
const UMBRALES = { tolerancia_inicio_min: 10, foco_cumplido: 0.7, foco_parcial: 0.4, dia_cumplido: 0.8, hueco_sueno_h: 3, peso_despertar_dormir_min: 30 };

/** ¿a y b son iguales salvo un error de redondeo? */
function casi(a, b, mensaje) {
  assert.ok(Math.abs(a - b) < 1e-9, `${mensaje ?? ''} esperaba ${b} y llegó ${a}`);
}

/** EstadoBloque mínimo: agregarPeriodo solo mira estado y duracionPlanSeg (a través de porcentajeVarios). */
function bloque(id, horas, estado, retrasoMin = null) {
  return {
    id, bloqueId: id.split('@')[0], tipo: 'estudio_pc', curso: 'bd1', inicio: 0, fin: horas * H * 1000, duracionPlanSeg: horas * H,
    estado, foco: null, estudioSeg: 0, iaSeg: 0, distraccionSeg: 0, retrasoMin, salidaEmergencia: false, checkin: null, motivo: '',
  };
}

/** EstadoRutina mínimo (peso de 30 min). */
function rutina(rutinaId, fecha, estado, pesoSeg = 1800) {
  return {
    id: `${rutinaId}@${fecha}`, rutinaId, nombre: rutinaId, medicion: 'pc', estado, pesoSeg,
    logradoSeg: null, metaSeg: null, horaReal: null, horaObjetivo: null, motivo: '',
  };
}

/**
 * ResumenDia armado a mano. Tiempos en horas; despertar y dormir en 'HH:MM' (si dormir < despertar, es de
 * la madrugada siguiente). Sin PC = lo que falta para llegar a las horas despierto.
 */
function resumen(fecha, o = {}) {
  const sinDatos = o.sinDatos ?? false;
  const inicio = instanteLocal(fecha, o.despertar ?? '04:00');
  const dormir = o.dormir ?? o.despertar ?? '04:00';
  const fin = sinDatos ? inicio : instanteLocal(dormir < (o.despertar ?? '04:00') ? sumarDias(fecha, 1) : fecha, dormir);
  const despiertoSeg = (fin - inicio) / 1000;
  const porEstado = {
    'estudio': (o.estudio ?? 0) * H, 'ia': (o.ia ?? 0) * H, 'neutral': (o.neutral ?? 0) * H, 'distraccion': (o.distraccion ?? 0) * H,
    'sin-clasificar': (o.sinClasificar ?? 0) * H, 'afk': (o.afk ?? 0) * H, 'sin-pc': 0,
  };
  const usado = Object.values(porEstado).reduce((a, b) => a + b, 0);
  porEstado['sin-pc'] = despiertoSeg - usado;
  assert.ok(porEstado['sin-pc'] >= 0, `el resumen de ${fecha} no cabe en sus horas despierto`);
  const papelSeg = (o.papel ?? 0) * H;
  const porcentaje = o.porcentaje ?? null;
  return {
    fecha,
    dia: {
      fecha, inicio, fin, fuenteInicio: 'actividad', fuenteFin: 'actividad', cerrado: o.cerrado ?? true, sinDatos, despiertoSeg,
    },
    sinDatos,
    despiertoSeg,
    activoSeg: usado - porEstado.afk,
    porEstado,
    porArea: o.porArea ?? {},
    porCategoria: o.porCategoria ?? {},
    porCurso: o.porCurso ?? {},
    clasesSeg: (o.clases ?? 0) * H,
    papelSeg,
    estudioTotalSeg: porEstado.estudio + papelSeg,
    porHora: [], // agregarPeriodo no los usa
    tramos: [],
    tramosPlan: [],
    cambiosApp: 0,
    cambiosPorHora: o.cambiosPorHora ?? null,
    focoMasLargo: o.foco == null ? null : { inicio, fin: inicio + o.foco * H * 1000, seg: o.foco * H },
    bloques: o.bloques ?? [],
    rutinas: o.rutinas ?? [],
    cumplimiento: { porcentaje, cumplido: porcentaje === null ? null : porcentaje >= 0.8, pesoSeg: 0, medibles: 0 },
    retrasoMedioMin: o.retraso ?? null,
    porApp: o.porApp ?? {},
    porDominio: o.porDominio ?? {},
  };
}

// ── Semana 1: lunes 5 a domingo 11 de octubre de 2026 ──
//
// |              | lun 05 | mar 06 | mié 07 | jue 08 (feriado) | vie 09 | sáb 10    | dom 11    |
// | estudio      | 4 h    | 2 h    | 3 h    | 0                | 5 h    | sin       | sinDatos  |
// | distracción  | 1 h    | 3 h    | 2 h    | 5 h              | 0,5 h  | resumen   |           |
// | papel        | 0      | 0      | 1,5 h  | 0                | 1,5 h  |           |           |
// | clases       | 2 h    | 2 h    | 2 h    | 0                | 2 h    |           |           |
// | despertar    | 07:00  | 08:00  | 07:30  | 10:00            | 06:30  |           |           |
// | dormir       | 23:00  | 01:00  | 00:30  | 02:00            | 23:30  |           |           |
// | % del día    | 1      | 2/7    | 17/18  | null (nada)      | 5/6    |           | null      |
//
// % del día con los bloques y rutinas de cada día (§9: Σ peso × duración ÷ Σ duración):
//   lun: bloque 2 h cumplido + inglés y despertar cumplidos (0,5 h c/u) → 3 h ÷ 3 h = 1
//   mar: bloque 2 h fallido + inglés y ejercicio cumplidos + despertar fallido → 1 h ÷ 3,5 h = 2/7
//   mié: bloque 2 h cumplido + papel 1,5 h cumplido + inglés parcial + despertar cumplido → 4,25 h ÷ 4,5 h = 17/18
//   jue: las rutinas no se pudieron medir → null
//   vie: bloque 2 h cumplido + papel 1,5 h parcial + inglés y despertar cumplidos → 3,75 h ÷ 4,5 h = 5/6
const SEMANA_1 = [
  resumen('2026-10-05', {
    estudio: 4, ia: 0.5, neutral: 2, distraccion: 1, afk: 1, clases: 2, despertar: '07:00', dormir: '23:00',
    porcentaje: 1, retraso: 0, cambiosPorHora: 6, foco: 1.5,
    bloques: [bloque('b-bd1@2026-10-05', 2, 'cumplido', 0)],
    rutinas: [rutina('ingles-pc', '2026-10-05', 'cumplido'), rutina('despertar', '2026-10-05', 'cumplido')],
    porArea: { 'Programación': 4 * H }, porCurso: { bd1: { bloquesSeg: 1.5 * H, papelSeg: 0 } },
    porApp: { 'Code.exe': 4 * H, 'chrome.exe': 3.5 * H }, porCategoria: { 'Estudio > Programación': 4 * H, 'Distracción > Video': 1 * H },
    porDominio: { 'youtube.com': 1 * H },
  }),
  resumen('2026-10-06', {
    estudio: 2, neutral: 3, distraccion: 3, sinClasificar: 0.5, afk: 1, clases: 2, despertar: '08:00', dormir: '01:00',
    porcentaje: 2 / 7, retraso: null, cambiosPorHora: 12, foco: 0.5,
    bloques: [bloque('b-dbp@2026-10-06', 2, 'fallido')],
    rutinas: [rutina('ingles-pc', '2026-10-06', 'cumplido'), rutina('ejercicio', '2026-10-06', 'cumplido'), rutina('despertar', '2026-10-06', 'fallido')],
    porArea: { 'Programación': 2 * H }, porApp: { 'chrome.exe': 8.5 * H }, porDominio: { 'youtube.com': 2 * H, 'instagram.com': 1 * H },
  }),
  resumen('2026-10-07', {
    estudio: 3, ia: 1, neutral: 1, distraccion: 2, afk: 2, papel: 1.5, clases: 2, despertar: '07:30', dormir: '00:30',
    porcentaje: 17 / 18, retraso: 10, cambiosPorHora: 8, foco: 1,
    bloques: [bloque('b-est@2026-10-07', 2, 'cumplido', 10), bloque('b-edo@2026-10-07', 1.5, 'cumplido')],
    rutinas: [rutina('ingles-pc', '2026-10-07', 'parcial'), rutina('despertar', '2026-10-07', 'cumplido')],
    porArea: { 'Matemáticas': 3 * H }, porCurso: { edo: { bloquesSeg: 0, papelSeg: 1.5 * H } },
  }),
  resumen('2026-10-08', {
    neutral: 4, distraccion: 5, afk: 1, despertar: '10:00', dormir: '02:00',
    porcentaje: null, retraso: null, cambiosPorHora: 10, foco: null,
    rutinas: [rutina('ingles-pc', '2026-10-08', 'no_medible'), rutina('ejercicio', '2026-10-08', 'no_medible'), rutina('despertar', '2026-10-08', 'no_medible')],
    porDominio: { 'youtube.com': 3 * H },
  }),
  resumen('2026-10-09', {
    estudio: 5, ia: 0.5, neutral: 1, distraccion: 0.5, afk: 2, papel: 1.5, clases: 2, despertar: '06:30', dormir: '23:30',
    porcentaje: 5 / 6, retraso: 5, cambiosPorHora: 4, foco: 2,
    bloques: [bloque('b-pi2@2026-10-09', 2, 'cumplido', 5), bloque('b-edo@2026-10-09', 1.5, 'parcial')],
    rutinas: [rutina('ingles-pc', '2026-10-09', 'cumplido'), rutina('despertar', '2026-10-09', 'cumplido')],
    porArea: { 'Programación': 3 * H, 'Inglés': 2 * H },
    porCurso: { edo: { bloquesSeg: 0, papelSeg: 1.5 * H }, dbp: { bloquesSeg: 1 * H, papelSeg: 0 } },
    porApp: { 'Code.exe': 3 * H },
  }),
  // sáb 10: sin resumen.
  resumen('2026-10-11', { sinDatos: true, despertar: '04:00' }),
];

// ── Semana 2: lunes 12 a domingo 18 (solo dos días con datos) ──
//   lun 12: estudio 6 h, despertar 07:00, dormir 23:00, % = 1, retraso 0
//   mar 13: sinDatos
//   mié 14: estudio 4 h, papel 1,5 h, despertar 08:00, dormir 00:00 (= 1440 min), % = 8/9, retraso 20
const SEMANA_2 = [
  resumen('2026-10-12', {
    estudio: 6, neutral: 1, distraccion: 1, afk: 1, clases: 2, despertar: '07:00', dormir: '23:00',
    porcentaje: 1, retraso: 0, cambiosPorHora: 5, foco: 2,
    bloques: [bloque('b-bd1@2026-10-12', 2, 'cumplido', 0)],
    rutinas: [rutina('ingles-pc', '2026-10-12', 'cumplido'), rutina('despertar', '2026-10-12', 'cumplido')],
  }),
  resumen('2026-10-13', { sinDatos: true, despertar: '04:00' }),
  resumen('2026-10-14', {
    estudio: 4, neutral: 2, distraccion: 2, afk: 1, papel: 1.5, clases: 2, despertar: '08:00', dormir: '00:00',
    porcentaje: 8 / 9, retraso: 20, cambiosPorHora: 7, foco: 1,
    bloques: [bloque('b-est@2026-10-14', 2, 'cumplido', 20), bloque('b-edo@2026-10-14', 1.5, 'cumplido')],
    rutinas: [rutina('ingles-pc', '2026-10-14', 'cumplido'), rutina('despertar', '2026-10-14', 'fallido')],
  }),
];

test('METRICAS: las claves pedidas, con nombre, unidad, tipo y valor', () => {
  const claves = ['estudio', 'estudioTotal', 'papel', 'clases', 'ia', 'neutral', 'distraccion', 'sinClasificar', 'activo', 'afk',
    'sinPc', 'despierto', 'cumplimiento', 'retraso', 'cambiosPorHora', 'focoMasLargo', 'despertar', 'dormir'];
  for (const clave of claves) {
    const m = METRICAS[clave];
    assert.ok(m, `falta la métrica ${clave}`);
    assert.equal(typeof m.nombre, 'string');
    assert.ok(['seg', 'proporcion', 'min', 'numero'].includes(m.unidad), clave);
    assert.ok(['suma', 'promedio'].includes(m.tipo), clave);
    assert.equal(typeof m.valor, 'function');
  }
  assert.deepEqual(Object.keys(METRICAS), CLAVES_METRICAS); // las mismas claves, en el mismo orden
  assert.ok(Object.isFrozen(METRICAS));
  const lun = SEMANA_1[0];
  assert.equal(METRICAS.estudio.valor(lun), 4 * H);
  assert.equal(METRICAS.activo.valor(lun), 7.5 * H); // 4 + 0,5 + 2 + 1
  assert.equal(METRICAS.sinPc.valor(lun), 7.5 * H); // 16 h despierto − 8,5 h
  assert.equal(METRICAS.despierto.valor(lun), 16 * H);
  assert.equal(METRICAS.cumplimiento.valor(lun), 1);
  assert.equal(METRICAS.focoMasLargo.valor(lun), 1.5 * H);
  assert.equal(METRICAS.focoMasLargo.valor(SEMANA_1[3]), 0); // día con datos y sin Estudio: 0, no null
  assert.equal(METRICAS.retraso.valor(SEMANA_1[1]), null);
});

test('METRICAS despertar y dormir: minutos desde la medianoche del día', () => {
  assert.equal(METRICAS.despertar.valor(SEMANA_1[0]), 7 * 60); // 07:00
  assert.equal(METRICAS.dormir.valor(SEMANA_1[0]), 23 * 60); // 23:00 del mismo día
  assert.equal(METRICAS.dormir.valor(SEMANA_1[1]), 1440 + 60); // 01:00 del día siguiente
  assert.equal(METRICAS.dormir.valor(SEMANA_2[2]), 1440); // 00:00 justo
  // Un día lógico que empezó antes de la medianoche de su fecha (23:30 del día anterior) → −30.
  const r = resumen('2026-10-20', { despertar: '08:00', dormir: '22:00' });
  const temprano = { ...r, dia: { ...r.dia, inicio: instanteLocal('2026-10-19', '23:30') } };
  assert.equal(METRICAS.despertar.valor(temprano), -30);
});

test('semana con días vacíos: días, días con datos y fechas sin datos', () => {
  const p = agregarPeriodo(SEMANA_1, '2026-10-05', '2026-10-11');
  assert.equal(p.desde, '2026-10-05');
  assert.equal(p.hasta, '2026-10-11');
  assert.equal(p.dias, 7);
  assert.equal(p.diasConDatos, 5);
  assert.deepEqual(p.fechasSinDatos, ['2026-10-10', '2026-10-11']); // sáb sin resumen, dom con sinDatos
  assert.deepEqual(Object.keys(p.metricas), Object.keys(METRICAS));
});

test('semana: estadísticos de una métrica de suma (estudio)', () => {
  const { estudio } = agregarPeriodo(SEMANA_1, '2026-10-05', '2026-10-11').metricas;
  // Valores [4, 2, 3, 0, 5] h → total 14 h; promedio 14 ÷ 5 = 2,8 h; con vacíos 14 ÷ 7 = 2 h;
  // ordenados [0, 2, 3, 4, 5] → mediana 3 h; máx. 5 h (vie 09); mín. 0 (jue 08).
  // Desviación: diferencias con 2,8 → 1,2; −0,8; 0,2; −2,8; 2,2 → cuadrados suman 14,8 → ÷ 5 = 2,96 → √2,96 h.
  assert.equal(estudio.total, 14 * H);
  casi(estudio.promedio, 2.8 * H);
  assert.equal(estudio.promedioConVacios, 2 * H);
  assert.equal(estudio.mediana, 3 * H);
  assert.deepEqual(estudio.max, { valor: 5 * H, fecha: '2026-10-09' });
  assert.deepEqual(estudio.min, { valor: 0, fecha: '2026-10-08' });
  casi(estudio.desviacion, Math.sqrt(2.96) * H);
});

test('semana: otras métricas de suma (distracción, estudio total, clases, papel)', () => {
  const m = agregarPeriodo(SEMANA_1, '2026-10-05', '2026-10-11').metricas;
  // Distracción [1, 3, 2, 5, 0,5] h → total 11,5 h; promedio 2,3 h; ordenados [0,5; 1; 2; 3; 5] → mediana 2 h.
  assert.equal(m.distraccion.total, 11.5 * H);
  casi(m.distraccion.promedio, 2.3 * H);
  assert.equal(m.distraccion.mediana, 2 * H);
  assert.deepEqual(m.distraccion.max, { valor: 5 * H, fecha: '2026-10-08' });
  assert.deepEqual(m.distraccion.min, { valor: 0.5 * H, fecha: '2026-10-09' });
  // Estudio total = PC + papel: [4, 2, 4,5, 0, 6,5] h → total 17 h; mediana 4 h; máx. 6,5 h (vie).
  assert.equal(m.estudioTotal.total, 17 * H);
  assert.equal(m.estudioTotal.mediana, 4 * H);
  assert.deepEqual(m.estudioTotal.max, { valor: 6.5 * H, fecha: '2026-10-09' });
  // Clases [2, 2, 2, 0, 2] h → total 8 h; con vacíos 8 ÷ 7 h. En empate, el máximo es la primera fecha.
  assert.equal(m.clases.total, 8 * H);
  casi(m.clases.promedioConVacios, (8 / 7) * H);
  assert.deepEqual(m.clases.max, { valor: 2 * H, fecha: '2026-10-05' });
  assert.equal(m.papel.total, 3 * H);
  // Horas despierto [16, 17, 17, 16, 17] h → total 83 h.
  assert.equal(m.despierto.total, 83 * H);
  // Sin PC [7,5; 7,5; 8; 6; 8] h → total 37 h (el domingo sin datos no suma: sus 0 h no son "días con datos").
  assert.equal(m.sinPc.total, 37 * H);
});

test('semana: métricas de promedio (despertar, dormir, retraso, cumplimiento, foco)', () => {
  const m = agregarPeriodo(SEMANA_1, '2026-10-05', '2026-10-11').metricas;
  // Despertar [420, 480, 450, 600, 390] min → promedio 2340 ÷ 5 = 468 (07:48); mediana 450 (07:30).
  // Desviación: diferencias −48, 12, −18, 132, −78 → cuadrados suman 26 280 → ÷ 5 = 5256 → √5256.
  assert.equal(m.despertar.promedio, 468);
  assert.equal(m.despertar.promedioConVacios, 468); // en métricas de promedio, igual al promedio
  assert.equal(m.despertar.mediana, 450);
  assert.deepEqual(m.despertar.max, { valor: 600, fecha: '2026-10-08' });
  assert.deepEqual(m.despertar.min, { valor: 390, fecha: '2026-10-09' });
  casi(m.despertar.desviacion, Math.sqrt(5256));
  // Dormir [1380, 1500, 1470, 1560, 1410] → promedio 7320 ÷ 5 = 1464 (00:24 del día siguiente); mediana 1470.
  assert.equal(m.dormir.promedio, 1464);
  assert.equal(m.dormir.mediana, 1470);
  // Retraso [0, null, 10, null, 5] → solo 3 valores: promedio 5; mediana 5; desviación √((25 + 25 + 0) ÷ 3).
  assert.equal(m.retraso.total, 15);
  assert.equal(m.retraso.promedio, 5);
  assert.equal(m.retraso.mediana, 5);
  casi(m.retraso.desviacion, Math.sqrt(50 / 3));
  // Cumplimiento [1, 2/7, 17/18, null, 5/6] → promedio de 4; ordenados [2/7, 5/6, 17/18, 1] → mediana (5/6 + 17/18) ÷ 2 = 8/9.
  casi(m.cumplimiento.promedio, (1 + 2 / 7 + 17 / 18 + 5 / 6) / 4);
  casi(m.cumplimiento.mediana, 8 / 9);
  assert.deepEqual(m.cumplimiento.min, { valor: 2 / 7, fecha: '2026-10-06' });
  // Foco más largo [1,5; 0,5; 1; 0; 2] h → promedio 1 h; el jueves (sin Estudio) cuenta como 0.
  assert.equal(m.focoMasLargo.promedio, 1 * H);
  assert.deepEqual(m.focoMasLargo.min, { valor: 0, fecha: '2026-10-08' });
  // Cambios por hora [6, 12, 8, 10, 4] → promedio 8, mediana 8.
  assert.equal(m.cambiosPorHora.promedio, 8);
  assert.equal(m.cambiosPorHora.mediana, 8);
});

test('rango sin días vacíos: promedio con vacíos = promedio', () => {
  const p = agregarPeriodo(SEMANA_1, '2026-10-05', '2026-10-09'); // lunes a viernes, los 5 con datos
  assert.equal(p.dias, 5);
  assert.deepEqual(p.fechasSinDatos, []);
  casi(p.metricas.estudio.promedio, 2.8 * H);
  casi(p.metricas.estudio.promedioConVacios, 2.8 * H);
  // Rango de 3 días (05 a 07): estudio [4, 2, 3] h → total 9 h, promedio 3 h, desviación √(2/3) h.
  const corto = agregarPeriodo(SEMANA_1, '2026-10-05', '2026-10-07').metricas.estudio;
  assert.equal(corto.total, 9 * H);
  assert.equal(corto.promedio, 3 * H);
  assert.equal(corto.promedioConVacios, 3 * H);
  casi(corto.desviacion, Math.sqrt(2 / 3) * H);
});

test('rango con días vacíos al principio', () => {
  // Del sáb 3 al vie 9: el 3 y el 4 no tienen resumen → estudio 14 h ÷ 7 días = 2 h con vacíos.
  const p = agregarPeriodo(SEMANA_1, '2026-10-03', '2026-10-09');
  assert.equal(p.dias, 7);
  assert.deepEqual(p.fechasSinDatos, ['2026-10-03', '2026-10-04']);
  assert.equal(p.metricas.estudio.total, 14 * H);
  assert.equal(p.metricas.estudio.promedioConVacios, 2 * H);
  assert.equal(p.metricas.despertar.promedioConVacios, 468); // promedio: los días vacíos no cuentan
});

test('rango sin ningún dato', () => {
  const p = agregarPeriodo(SEMANA_1, '2026-11-01', '2026-11-03');
  assert.equal(p.diasConDatos, 0);
  assert.deepEqual(p.fechasSinDatos, ['2026-11-01', '2026-11-02', '2026-11-03']);
  assert.deepEqual(p.metricas.estudio, { total: 0, promedio: null, promedioConVacios: 0, mediana: null, max: null, min: null, desviacion: null });
  assert.equal(p.metricas.despertar.promedioConVacios, null);
  assert.deepEqual(p.rachas, { diaCumplido: { actual: 0, mejor: 0 }, rutinas: {} });
  assert.equal(p.comparacion, null);
  assert.equal(p.totales.porEstado.estudio, 0);
  // Sin resúmenes de entrada.
  assert.equal(agregarPeriodo([], '2026-10-05', '2026-10-11').diasConDatos, 0);
  assert.equal(agregarPeriodo(undefined, '2026-10-05', '2026-10-05').dias, 1);
});

test('totales: suma de los días con datos', () => {
  const t = agregarPeriodo(SEMANA_1, '2026-10-05', '2026-10-11').totales;
  assert.equal(t.porEstado.estudio, 14 * H);
  assert.equal(t.porEstado.distraccion, 11.5 * H);
  assert.equal(t.porEstado.afk, 7 * H); // 1 + 1 + 2 + 1 + 2
  assert.equal(Object.keys(t.porEstado).length, 7);
  // Programación 4 + 2 + 3 = 9 h; Matemáticas 3 h; Inglés 2 h (de mayor a menor).
  assert.deepEqual(t.porArea, { 'Programación': 9 * H, 'Matemáticas': 3 * H, 'Inglés': 2 * H });
  assert.deepEqual(Object.keys(t.porArea), ['Programación', 'Matemáticas', 'Inglés']);
  assert.deepEqual(t.porCurso, {
    bd1: { bloquesSeg: 1.5 * H, papelSeg: 0 },
    edo: { bloquesSeg: 0, papelSeg: 3 * H },
    dbp: { bloquesSeg: 1 * H, papelSeg: 0 },
  });
  // chrome.exe 3,5 + 8,5 = 12 h; Code.exe 4 + 3 = 7 h.
  assert.deepEqual(t.porApp, { 'chrome.exe': 12 * H, 'Code.exe': 7 * H });
  assert.deepEqual(t.porDominio, { 'youtube.com': 6 * H, 'instagram.com': 1 * H });
  assert.deepEqual(t.porCategoria, { 'Estudio > Programación': 4 * H, 'Distracción > Video': 1 * H });
  assert.equal(t.clasesSeg, 8 * H);
  assert.equal(t.papelSeg, 3 * H);
});

test('día de la semana promedio', () => {
  const dosSemanas = agregarPeriodo([...SEMANA_1, ...SEMANA_2], '2026-10-05', '2026-10-18');
  assert.deepEqual(Object.keys(dosSemanas.porDiaSemana), DIAS_SEMANA);
  const { lun, mar, mie, sab, dom } = dosSemanas.porDiaSemana;
  assert.equal(lun.estudio, 5 * H); // (4 + 6) ÷ 2
  assert.equal(mie.estudio, 3.5 * H); // (3 + 4) ÷ 2
  assert.equal(mar.estudio, 2 * H); // solo el 06: el 13 no tiene datos
  assert.equal(lun.despertar, 420); // 07:00 los dos lunes
  assert.equal(mie.dormir, (1470 + 1440) / 2);
  assert.equal(sab.estudio, null);
  assert.equal(dom.estudio, null);
  assert.deepEqual(Object.keys(lun), Object.keys(METRICAS));
  // El jueves 08 no tiene nada medible → su promedio de cumplimiento es null.
  assert.equal(dosSemanas.porDiaSemana.jue.cumplimiento, null);
});

test('rachas: los días sin nada medible no cortan ni suman', () => {
  const { rachas } = agregarPeriodo(SEMANA_1, '2026-10-05', '2026-10-11');
  // Día cumplido: lun ✓, mar ✗, mié ✓, jue (nada), vie ✓, sáb (sin resumen), dom (nada) → actual 2 (vie, mié), mejor 2.
  assert.deepEqual(rachas.diaCumplido, { actual: 2, mejor: 2 });
  // Inglés: ✓ ✓ parcial (corta) · ✓ → actual 1, mejor 2.
  assert.deepEqual(rachas.rutinas['ingles-pc'], { actual: 1, mejor: 2 });
  // Ejercicio: solo mar ✓ (el jueves no se pudo medir) → 1 y 1.
  assert.deepEqual(rachas.rutinas.ejercicio, { actual: 1, mejor: 1 });
  // Despertar: ✓ ✗ ✓ · ✓ → actual 2, mejor 2.
  assert.deepEqual(rachas.rutinas.despertar, { actual: 2, mejor: 2 });
  assert.deepEqual(Object.keys(rachas.rutinas), ['ingles-pc', 'despertar', 'ejercicio']);
});

test('rachas en dos semanas y cuando el último día no está cumplido', () => {
  const { rachas } = agregarPeriodo([...SEMANA_1, ...SEMANA_2], '2026-10-05', '2026-10-18');
  // ✓ ✗ ✓ · ✓ · · | ✓ · ✓ · · · · → después del martes 06: mié, vie, lun 12, mié 14 → 4 seguidos.
  assert.deepEqual(rachas.diaCumplido, { actual: 4, mejor: 4 });
  // Despertar: ✓ ✗ ✓ · ✓ · · | ✓ · ✗ → el miércoles 14 corta: actual 0, mejor 3 (mié 07, vie 09, lun 12).
  assert.deepEqual(rachas.rutinas.despertar, { actual: 0, mejor: 3 });
  // Si el período termina el martes 06 (no cumplido): actual 0.
  assert.deepEqual(agregarPeriodo(SEMANA_1, '2026-10-05', '2026-10-06').rachas.diaCumplido, { actual: 0, mejor: 1 });
});

test('comparación con el período anterior del mismo largo', () => {
  const p = agregarPeriodo([...SEMANA_1, ...SEMANA_2], '2026-10-12', '2026-10-18');
  assert.equal(p.comparacion.desde, '2026-10-05');
  assert.equal(p.comparacion.hasta, '2026-10-11');
  const c = p.comparacion.metricas;
  assert.deepEqual(Object.keys(c), Object.keys(METRICAS));
  // Suma → totales: estudio 6 + 4 = 10 h contra 14 h → −4 h.
  assert.deepEqual(c.estudio, { actual: 10 * H, anterior: 14 * H, diferencia: -4 * H });
  assert.deepEqual(c.papel, { actual: 1.5 * H, anterior: 3 * H, diferencia: -1.5 * H });
  // Promedio → promedios: despertar (420 + 480) ÷ 2 = 450 contra 468 → −18; dormir (1380 + 1440) ÷ 2 = 1410 contra 1464.
  assert.deepEqual(c.despertar, { actual: 450, anterior: 468, diferencia: -18 });
  assert.deepEqual(c.dormir, { actual: 1410, anterior: 1464, diferencia: -54 });
  // Retraso (0 + 20) ÷ 2 = 10 contra 5 → +5.
  assert.deepEqual(c.retraso, { actual: 10, anterior: 5, diferencia: 5 });
  // La comparación es la misma que da compararPeriodos con los dos períodos por separado.
  assert.deepEqual(p.comparacion, compararPeriodos(p, agregarPeriodo(SEMANA_1, '2026-10-05', '2026-10-11')));
});

test('compararPeriodos: dos períodos cualesquiera', () => {
  const a = agregarPeriodo(SEMANA_2, '2026-10-12', '2026-10-14'); // estudio 10 h, despertar promedio 450
  const b = agregarPeriodo(SEMANA_1, '2026-10-05', '2026-10-07'); // estudio 4 + 2 + 3 = 9 h, despertar (420 + 480 + 450) ÷ 3 = 450
  const c = compararPeriodos(a, b);
  assert.deepEqual([c.desde, c.hasta], ['2026-10-05', '2026-10-07']);
  assert.deepEqual(c.metricas.estudio, { actual: 10 * H, anterior: 9 * H, diferencia: 1 * H });
  assert.deepEqual(c.metricas.despertar, { actual: 450, anterior: 450, diferencia: 0 });
  assert.deepEqual(Object.keys(c.metricas), CLAVES_METRICAS);
  // Un período sin datos: los promedios son null y la diferencia también.
  const vacio = agregarPeriodo([], '2026-11-01', '2026-11-03');
  assert.deepEqual(compararPeriodos(a, vacio).metricas.despertar, { actual: 450, anterior: null, diferencia: null });
  assert.deepEqual(compararPeriodos(a, vacio).metricas.estudio, { actual: 10 * H, anterior: 0, diferencia: 10 * H });
  assert.equal(compararPeriodos(a, null), null);
});

test('rachas: un día en curso no corta, pero un día sin datos sí puede cortar', () => {
  // Hoy (vie 09) todavía no está cumplido (40 %), pero el día sigue: la racha de mié se mantiene.
  const hoy = resumen('2026-10-09', {
    estudio: 1, despertar: '06:30', dormir: '12:00', porcentaje: 0.4, cerrado: false,
    rutinas: [rutina('despertar', '2026-10-09', 'fallido')],
  });
  const conHoy = agregarPeriodo([...SEMANA_1.slice(0, 4), hoy], '2026-10-05', '2026-10-09');
  // ✓ ✗ ✓ · (en curso) → actual 1 (mié), mejor 1.
  assert.deepEqual(conHoy.rachas.diaCumplido, { actual: 1, mejor: 1 });
  assert.deepEqual(conHoy.rachas.rutinas.despertar, { actual: 1, mejor: 1 });
  // El día en curso sí entra en los totales y en las métricas.
  assert.equal(conHoy.totales.porEstado.estudio, 10 * H); // 4 + 2 + 3 + 0 + 1
  assert.equal(conHoy.diasConDatos, 5);
  // Un día sin datos con un % medible (sus bloques de PC quedaron fallidos) corta la racha.
  const vacioFallido = { ...resumen('2026-10-10', { sinDatos: true }), cumplimiento: { porcentaje: 0, cumplido: false, pesoSeg: 7200, medibles: 1 } };
  const p = agregarPeriodo([...SEMANA_1, vacioFallido], '2026-10-05', '2026-10-11');
  assert.deepEqual(p.rachas.diaCumplido, { actual: 0, mejor: 2 });
  assert.deepEqual(p.fechasSinDatos, ['2026-10-10', '2026-10-11']); // pero sus métricas no entran a los promedios
  casi(p.metricas.estudio.promedio, 2.8 * H);
});

test('comparación: null si no hay resúmenes del período anterior; con resúmenes de después no cambia nada', () => {
  const sola = agregarPeriodo(SEMANA_1, '2026-10-05', '2026-10-11');
  const conDespues = agregarPeriodo([...SEMANA_2, ...SEMANA_1], '2026-10-05', '2026-10-11');
  assert.equal(sola.comparacion, null);
  assert.equal(conDespues.comparacion, null);
  assert.deepEqual(conDespues.metricas, sola.metricas);
  assert.deepEqual(conDespues.totales, sola.totales);
  // Si el anterior solo tiene un día sin datos, sí hay comparación (con promedios null).
  const p = agregarPeriodo([resumen('2026-10-04', { sinDatos: true }), ...SEMANA_1], '2026-10-05', '2026-10-11');
  assert.deepEqual(p.comparacion.metricas.estudio, { actual: 14 * H, anterior: 0, diferencia: 14 * H });
  assert.deepEqual(p.comparacion.metricas.despertar, { actual: 468, anterior: null, diferencia: null });
});

test('comparación de un mes completo: el mes anterior entero', () => {
  const septiembre = resumen('2026-09-15', { estudio: 3, despertar: '07:00', dormir: '23:00' });
  const mes = agregarPeriodo([septiembre, ...SEMANA_1, ...SEMANA_2], '2026-10-01', '2026-10-31');
  assert.equal(mes.dias, 31);
  assert.equal(mes.diasConDatos, 7);
  assert.deepEqual([mes.comparacion.desde, mes.comparacion.hasta], ['2026-09-01', '2026-09-30']);
  assert.deepEqual(mes.comparacion.metricas.estudio, { actual: 24 * H, anterior: 3 * H, diferencia: 21 * H });
  // Un rango que no es un mes completo (5 al 31, 27 días) se compara con los 27 días anteriores.
  const rango = agregarPeriodo([septiembre, ...SEMANA_1], '2026-10-05', '2026-10-31');
  assert.deepEqual([rango.comparacion.desde, rango.comparacion.hasta], ['2026-09-08', '2026-10-04']);
});

test('fechas repetidas, desde > hasta y fechas inválidas', () => {
  const corregido = resumen('2026-10-05', { estudio: 1, despertar: '07:00', dormir: '23:00' });
  const p = agregarPeriodo([...SEMANA_1, corregido], '2026-10-05', '2026-10-05');
  assert.equal(p.metricas.estudio.total, 1 * H); // vale el último resumen de esa fecha
  const alReves = agregarPeriodo(SEMANA_1, '2026-10-11', '2026-10-05');
  assert.deepEqual([alReves.desde, alReves.hasta, alReves.dias], ['2026-10-05', '2026-10-11', 7]);
  assert.throws(() => agregarPeriodo(SEMANA_1, '2026-10-5', '2026-10-11'), /AAAA-MM-DD/);
  assert.throws(() => agregarPeriodo(SEMANA_1, '2026-10-05', undefined), /AAAA-MM-DD/);
});

test('agregarPeriodo no modifica los resúmenes', () => {
  const entrada = [...SEMANA_1, ...SEMANA_2];
  const copia = structuredClone(entrada);
  agregarPeriodo(entrada, '2026-10-12', '2026-10-18');
  assert.deepEqual(entrada, copia);
});

// El % del período usa porcentajeVarios (porcentajes.js, F4-03): Σ peso × duración ÷ Σ duración con todos los días.
//   lun 3 h de 3 h · mar 1 h de 3,5 h · mié 4,25 h de 4,5 h · jue nada · vie 3,75 h de 4,5 h · dom nada
//   → 12 h ÷ 15,5 h = 0,774… < 0,8 → no cumplido. Medibles: 3 + 4 + 4 + 0 + 4 = 15.
test('cumplimiento del período con porcentajeVarios', () => {
  const p = agregarPeriodo(SEMANA_1, '2026-10-05', '2026-10-11', { umbrales: UMBRALES });
  casi(p.cumplimiento.porcentaje, 12 / 15.5);
  assert.equal(p.cumplimiento.cumplido, false);
  assert.equal(p.cumplimiento.pesoSeg, 15.5 * H);
  assert.equal(p.cumplimiento.medibles, 15);
  // Con un umbral de día cumplido más bajo, el período sí se cumple.
  assert.equal(agregarPeriodo(SEMANA_1, '2026-10-05', '2026-10-11', { umbrales: { ...UMBRALES, dia_cumplido: 0.75 } }).cumplimiento.cumplido, true);
  // Sin nada medible → null.
  assert.equal(agregarPeriodo(SEMANA_1, '2026-10-08', '2026-10-08').cumplimiento.porcentaje, null);
  // Sin umbrales usa los iniciales (día cumplido = 80 %).
  assert.equal(agregarPeriodo(SEMANA_1, '2026-10-05', '2026-10-11').cumplimiento.cumplido, false);
});

// Semana 2: lun 12 → 3 h de 3 h; mié 14 → bloque 2 h + papel 1,5 h + inglés cumplidos y despertar fallido → 4 h de 4,5 h.
//   → 7 h ÷ 7,5 h = 14/15. Semana 1: 12/15,5. La comparación usa estos % ponderados, no el promedio de los % diarios.
test('comparación del cumplimiento: el % ponderado de cada período', () => {
  const p = agregarPeriodo([...SEMANA_1, ...SEMANA_2], '2026-10-12', '2026-10-18', { umbrales: UMBRALES });
  casi(p.cumplimiento.porcentaje, 14 / 15);
  casi(p.comparacion.metricas.cumplimiento.actual, 14 / 15);
  casi(p.comparacion.metricas.cumplimiento.anterior, 12 / 15.5);
  casi(p.comparacion.metricas.cumplimiento.diferencia, 14 / 15 - 12 / 15.5);
});
