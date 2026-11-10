// Pruebas de web/motor/dia-logico.js (F2-01, con los check-ins de F5-02): de despertar a dormir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularDiaLogico, limiteDeDia } from '../web/motor/dia-logico.js';
import { segmentar, unirSegmentos } from '../web/motor/segmentos.js';
import { normalizarCheckins } from '../web/motor/checkins.js';
import { fechaLocal, horaLocal, inicioDelDia, instanteLocal, sumarDias } from '../web/motor/fechas.js';
import { FECHAS_EJEMPLO, eventosEjemplo, verdadDelDia } from './ayudantes/ejemplo.js';

const MS_H = 60 * 60 * 1000;

// ── Ayudantes: días armados a mano ──

const A = '2026-10-19'; // ayer
const F = '2026-10-20'; // el día que se calcula
const M = '2026-10-21'; // mañana
const P = '2026-10-22'; // pasado mañana
/** Instante de una hora de Lima ('HH:MM') de una fecha. */
const h = (fecha, hora) => instanteLocal(fecha, hora);
/** 'AAAA-MM-DD HH:MM' en Lima, para leer mejor los errores. */
const local = (instante) => `${fechaLocal(instante)} ${horaLocal(instante)}`;

const evento = (desde, hasta, data) => ({ timestamp: new Date(desde).toISOString(), duration: (hasta - desde) / 1000, data });

/**
 * Segmentos de los días de AW fecha − 1, fecha y fecha + 1 (como hará el dashboard): cada tramo de `actividad` es una
 * ventana dentro de un periodo no AFK; `afk` son periodos AFK; lo demás queda sin PC. Con `ahora`, todo se corta ahí.
 */
function segmentosDe(fecha, actividad, { afk = [], ahora = Infinity } = {}) {
  const datos = {
    eventos: actividad.map(([a, b]) => evento(a, b, { app: 'x.exe', title: 't', $category: ['Neutral'] })),
    navegador: [],
    no_afk: actividad.map(([a, b]) => evento(a, b, { status: 'not-afk' })),
    afk: afk.map(([a, b]) => evento(a, b, { status: 'afk' })),
  };
  return unirSegmentos(...[-1, 0, 1].map((d) => {
    const f = sumarDias(fecha, d);
    return segmentar(datos, { inicio: inicioDelDia(f), fin: inicioDelDia(sumarDias(f, 1)), ahora });
  }));
}

/** Día lógico de `fecha` con esa actividad (los segmentos se arman con segmentosDe). */
function dia(fecha, actividad, opciones = {}) {
  const { afk, ...resto } = opciones;
  return calcularDiaLogico({ fecha, segmentos: segmentosDe(fecha, actividad, { afk, ahora: resto.ahora }), ...resto });
}

/** Check-in ya normalizado. */
const checkin = (tipo, fecha, valor, instante = h(fecha, '12:00')) => ({ id: null, instante, fecha, tipo, refId: tipo, valor, nota: '' });

// Una semana normal: noche de 01:00 a 08:00 (contiene las 04:00).
const NORMAL = [
  [h(A, '08:00'), h(F, '01:00')],
  [h(F, '08:30'), h(F, '12:00')],
  [h(F, '13:00'), h(M, '01:30')],
  [h(M, '09:00'), h(M, '22:00')],
];

// ── Días pasados (ahora = Infinity) ──

test('la actividad de la 1:00 a. m. cuenta para el día anterior', () => {
  const d = dia(F, NORMAL);
  assert.equal(local(d.inicio), '2026-10-20 08:30');
  assert.equal(local(d.fin), '2026-10-21 01:30');
  assert.deepEqual([d.fuenteInicio, d.fuenteFin, d.cerrado, d.sinDatos], ['actividad', 'actividad', true, false]);
  assert.equal(d.despiertoSeg, 17 * 3600);
  assert.equal(d.fecha, F);
  assert.equal(local(dia(A, NORMAL).fin), '2026-10-20 01:00'); // la 1:00 del 20 es del 19
  assert.equal(local(dia(M, NORMAL).inicio), '2026-10-21 09:00');
});

test('una trasnoche que pasa de las 04:00 sin hueco de 3 h sigue siendo del mismo día', () => {
  const actividad = [
    [h(A, '09:00'), h(A, '23:00')],
    [h(F, '10:00'), h(F, '16:00')],
    [h(F, '18:00'), h(M, '04:30')], // hueco de 2 h a las 16:00: no parte el día
    [h(M, '11:00'), h(M, '20:00')],
  ];
  const d = dia(F, actividad);
  assert.equal(local(d.inicio), '2026-10-20 10:00');
  assert.equal(local(d.fin), '2026-10-21 04:30');
  assert.ok(d.fin > inicioDelDia(M)); // después del inicio de día de AW
  assert.equal(local(dia(M, actividad).inicio), '2026-10-21 11:00');
});

test('día sin datos: inicio = fin = S, aunque el mismo hueco sea el límite de los dos inicios de día', () => {
  const actividad = [[h(A, '09:00'), h(A, '23:30')], [h(M, '07:00'), h(M, '20:00')]]; // hueco de 31,5 h
  const d = dia(F, actividad);
  assert.deepEqual(d, {
    fecha: F, inicio: inicioDelDia(F), fin: inicioDelDia(F), fuenteInicio: 'inicio_dia', fuenteFin: 'sin_datos',
    cerrado: true, sinDatos: true, despiertoSeg: 0,
  });
  assert.equal(local(dia(A, actividad).fin), '2026-10-19 23:30');
  assert.equal(local(dia(M, actividad).inicio), '2026-10-21 07:00');
  // Sin ningún segmento.
  const vacio = calcularDiaLogico({ fecha: F, segmentos: [] });
  assert.deepEqual([vacio.sinDatos, vacio.inicio, vacio.fin, vacio.cerrado], [true, inicioDelDia(F), inicioDelDia(F), true]);
  // Con check-in de despertar, el día sin datos empieza y termina a esa hora.
  const conCheckin = dia(F, actividad, { checkins: [checkin('despertar', F, '07:30')] });
  assert.deepEqual([conCheckin.sinDatos, conCheckin.fuenteInicio, local(conCheckin.inicio), conCheckin.fin === conCheckin.inicio],
    [true, 'checkin', '2026-10-20 07:30', true]);
});

test('día sin PC con check-ins de despertar y dormir: va de despertar a dormir (decisión de Dremy)', () => {
  const actividad = [[h(A, '09:00'), h(A, '23:30')], [h(M, '07:00'), h(M, '20:00')]];
  const d = dia(F, actividad, { checkins: [checkin('despertar', F, '07:30'), checkin('dormir', F, '23:15')] });
  assert.deepEqual([d.sinDatos, d.fuenteInicio, d.fuenteFin, local(d.inicio), local(d.fin), d.despiertoSeg],
    [true, 'checkin', 'checkin', '2026-10-20 07:30', '2026-10-20 23:15', 15.75 * 3600]);
  // Dormir pasada la medianoche: es la madrugada siguiente.
  const tarde = dia(F, actividad, { checkins: [checkin('despertar', F, '10:00'), checkin('dormir', F, '01:30')] });
  assert.deepEqual([local(tarde.inicio), local(tarde.fin), tarde.despiertoSeg], ['2026-10-20 10:00', '2026-10-21 01:30', 15.5 * 3600]);
  // Solo con dormir (sin despertar) no se sabe cuándo empezó: sigue en 0 h.
  const soloDormir = dia(F, actividad, { checkins: [checkin('dormir', F, '23:15')] });
  assert.deepEqual([soloDormir.sinDatos, soloDormir.despiertoSeg], [true, 0]);
});

test('solo AFK y sin PC no es actividad: el día queda sin datos', () => {
  const segmentos = segmentosDe(F, [[h(A, '09:00'), h(A, '23:00')]], { afk: [[h(F, '09:00'), h(F, '18:00')]] });
  assert.ok(segmentos.some((s) => s.clase === 'afk'));
  assert.equal(calcularDiaLogico({ fecha: F, segmentos }).sinDatos, true);
});

test('un hueco de 4 h dentro del día no parte el día (el de la noche contiene las 04:00)', () => {
  const actividad = [
    [h(A, '09:00'), h(F, '00:30')],
    [h(F, '07:00'), h(F, '08:00')],
    [h(F, '12:30'), h(F, '23:30')], // hueco de 4,5 h por la mañana
    [h(M, '07:30'), h(M, '20:00')],
  ];
  const d = dia(F, actividad);
  assert.equal(local(d.inicio), '2026-10-20 07:00');
  assert.equal(local(d.fin), '2026-10-20 23:30');
});

test('una clase presencial larga a media mañana no le gana a una noche corta', () => {
  const actividad = [
    [h(A, '18:00'), h(F, '01:00')],
    [h(F, '06:00'), h(F, '07:30')],  // noche de 5 h (01:00 a 06:00)
    [h(F, '19:00'), h(M, '01:00')],  // hueco de 11,5 h por las clases
    [h(M, '06:00'), h(M, '07:30')],
    [h(M, '19:00'), h(M, '22:00')],
  ];
  const d = dia(F, actividad);
  assert.equal(local(d.inicio), '2026-10-20 06:00');
  assert.equal(local(d.fin), '2026-10-21 01:00');
});

test('limiteDeDia: el hueco que contiene S; si ninguno, el más cercano; si empatan, el más largo', () => {
  const S = inicioDelDia(F);
  const act = (...tramos) => tramos.map(([a, b]) => ({ inicio: S + a * MS_H, fin: S + b * MS_H, clase: 'neutral' }));
  // Contiene S (de 01:00 a 08:00) aunque haya uno más largo después.
  const contiene = limiteDeDia(act([-10, -3], [4, 5], [17, 20]), S);
  assert.deepEqual([contiene.finAnterior, contiene.inicioSiguiente], [S - 3 * MS_H, S + 4 * MS_H]);
  assert.deepEqual(contiene.hueco, { inicio: S - 3 * MS_H, fin: S + 4 * MS_H, abierto: false, seg: 7 * 3600 });
  // Ninguno contiene S (actividad de 03:00 a 05:00): gana el más cercano.
  const cercano = limiteDeDia(act([-12, -6], [-3, -1], [1, 2], [6, 12]), S); // huecos: −6→−3 (a 3 h) y 2→6 (a 2 h)
  assert.equal(cercano.finAnterior, S + 2 * MS_H);
  // A la misma distancia, el más largo.
  const largo = limiteDeDia(act([-12, -6], [-1, 1], [4, 12]), S);  // huecos: −6→−1 (5 h) y 1→4 (3 h), los dos a 1 h
  assert.equal(largo.finAnterior, S - 6 * MS_H);
  // Ningún hueco de 3 h toca la ventana.
  assert.equal(limiteDeDia(act([-12, 12]), S), null);
  assert.equal(limiteDeDia(act([-12, -1], [1, 12]), S), null);   // el de 2 h es muy corto
  assert.notEqual(limiteDeDia(act([-12, -1], [1, 12]), S, { huecoMin: 60 }), null);
});

test('limiteDeDia: huecos abiertos en los bordes (−∞ antes de todo, +∞ después si ya pasó huecoMin)', () => {
  const S = inicioDelDia(F);
  const act = [{ inicio: S + 3 * MS_H, fin: S + 10 * MS_H, clase: 'estudio' }, { inicio: S + 10 * MS_H, fin: S + 11 * MS_H, clase: 'afk' }];
  const antes = limiteDeDia(act, S);
  assert.deepEqual([antes.finAnterior, antes.inicioSiguiente, antes.hueco.abierto], [-Infinity, S + 3 * MS_H, false]);
  // Después de la última actividad: con ahora a 4 h existe (abierto); a 2 h, todavía no.
  const S1 = inicioDelDia(M);
  const despues = limiteDeDia(act, S1, { ahora: S + 14 * MS_H });
  assert.deepEqual([despues.finAnterior, despues.inicioSiguiente, despues.hueco.abierto], [S + 10 * MS_H, Infinity, true]);
  assert.equal(limiteDeDia(act, S1, { ahora: S + 12 * MS_H }), null);
  // Sin actividad: un solo hueco de −∞ a +∞.
  const nada = limiteDeDia([], S);
  assert.deepEqual([nada.finAnterior, nada.inicioSiguiente, nada.hueco.seg], [-Infinity, Infinity, Infinity]);
});

// ── Check-ins ──

test('los check-ins de despertar y dormir mandan sobre la estimación', () => {
  const d = dia(F, NORMAL, { checkins: [checkin('despertar', F, '07:45'), checkin('dormir', F, '00:15')] });
  assert.equal(local(d.inicio), '2026-10-20 07:45');
  assert.equal(local(d.fin), '2026-10-21 00:15');
  assert.deepEqual([d.fuenteInicio, d.fuenteFin, d.cerrado], ['checkin', 'checkin', true]);
  // El de despertar manda aunque haya actividad antes (la de 08:30 a 09:00 queda fuera del día).
  assert.equal(local(dia(F, NORMAL, { checkins: [checkin('despertar', F, '09:00')] }).inicio), '2026-10-20 09:00');
});

test('check-ins: manda el último registrado; se ignoran los de otras fechas y los que no tienen una hora válida', () => {
  const checkins = normalizarCheckins([
    evento(h(F, '08:35'), h(F, '08:35'), { tipo: 'despertar', valor: '08:20' }),
    evento(h(F, '10:00'), h(F, '10:00'), { tipo: 'despertar', valor: '08:05' }),          // corrección: manda
    evento(h(F, '11:00'), h(F, '11:00'), { tipo: 'despertar', valor: 'no sé' }),          // hora inválida
    evento(h(F, '11:30'), h(F, '11:30'), { tipo: 'dormir', valor: '23:00', fecha: A }),  // es del 19
  ]);
  const d = dia(F, NORMAL, { checkins });
  assert.equal(local(d.inicio), '2026-10-20 08:05');
  assert.equal(d.fuenteFin, 'actividad');
});

test('dormir después de las 04:00 tras una trasnoche es la madrugada siguiente', () => {
  const actividad = [[h(A, '09:00'), h(A, '23:00')], [h(F, '10:30'), h(M, '04:30')], [h(M, '11:00'), h(M, '20:00')]];
  const d = dia(F, actividad, { checkins: [checkin('dormir', F, '04:45')] });
  assert.equal(local(d.fin), '2026-10-21 04:45');
  assert.equal(d.fuenteFin, 'checkin');
});

test('el día nunca dura más de 24 h', () => {
  const actividad = [[h(A, '08:00'), h(A, '20:00')], [h(F, '00:30'), h(M, '02:00')], [h(M, '09:00'), h(M, '20:00')]];
  const d = dia(F, actividad, { checkins: [checkin('despertar', F, '00:30')] }); // despertó a las 00:30 del 20
  assert.equal(local(d.inicio), '2026-10-20 00:30');
  assert.equal(d.fin, d.inicio + 24 * MS_H);   // el límite daría las 02:00 del 21
  assert.equal(d.despiertoSeg, 24 * 3600);
});

// ── Hoy, en curso ──

test('hoy a media tarde, activo: el fin es ahora', () => {
  const ahora = h(F, '16:00');
  const d = dia(F, [[h(A, '09:00'), h(F, '00:30')], [h(F, '07:00'), ahora]], { ahora });
  assert.equal(local(d.inicio), '2026-10-20 07:00');
  assert.equal(d.fin, ahora);
  assert.deepEqual([d.fuenteFin, d.cerrado, d.despiertoSeg], ['ahora', false, 9 * 3600]);
  // Con 1 h sin actividad todavía es "ahora": el hueco no llega a 3 h.
  const pausa = dia(F, [[h(A, '09:00'), h(F, '00:30')], [h(F, '07:00'), h(F, '15:00')]], { ahora });
  assert.deepEqual([pausa.fin, pausa.fuenteFin], [ahora, 'ahora']);
});

test('hoy, 4 h después de la última actividad: el fin es esa actividad (pero el día no está cerrado)', () => {
  const ahora = h(F, '16:00');
  const d = dia(F, [[h(A, '09:00'), h(F, '00:30')], [h(F, '07:00'), h(F, '12:00')]], { ahora });
  assert.equal(local(d.fin), '2026-10-20 12:00');
  assert.deepEqual([d.fuenteFin, d.cerrado], ['actividad', false]);
});

test('trasnoche en vivo: antes de las 04:00 el fin es ahora; después, el día corta en las 04:00 hasta que haya hueco', () => {
  const actividad = (ahora) => [[h(A, '09:00'), h(A, '23:00')], [h(F, '07:00'), ahora]];
  const a2 = h(M, '02:00');
  const d2 = dia(F, actividad(a2), { ahora: a2 });
  assert.deepEqual([d2.fin, d2.fuenteFin, d2.cerrado], [a2, 'ahora', false]);
  // 04:20, todavía activo: el 20 termina en S(21) y el 21 va de S(21) a ahora; los dos siguen abiertos.
  const a4 = h(M, '04:20');
  const d4 = dia(F, actividad(a4), { ahora: a4 });
  assert.deepEqual([d4.fin, d4.fuenteFin, d4.cerrado], [inicioDelDia(M), 'inicio_dia', false]);
  const manana = dia(M, actividad(a4), { ahora: a4 });
  assert.deepEqual([manana.inicio, manana.fin, manana.fuenteFin, manana.cerrado], [inicioDelDia(M), a4, 'ahora', false]);
  // Cuando ya durmió (a las 10:00 lleva 5 h sin actividad), el 20 termina a las 04:30.
  const actividadFinal = [[h(A, '09:00'), h(A, '23:00')], [h(F, '07:00'), h(M, '04:30')]];
  const d10 = dia(F, actividadFinal, { ahora: h(M, '10:00') });
  assert.equal(local(d10.fin), '2026-10-21 04:30');
  assert.equal(d10.cerrado, true); // el hueco empieza después de S(21): ningún hueco futuro le gana
});

test('trasnoche hasta las 07:00 y después nada: esa madrugada es de ayer, y hoy queda sin datos (no se pisan)', () => {
  const ahora = h(F, '13:00');
  const actividad = [[h(A, '09:00'), h(F, '07:00')]]; // sin hueco de 3 h alrededor de las 04:00
  const ayer = dia(A, actividad, { ahora });
  const hoy = dia(F, actividad, { ahora });
  assert.equal(local(ayer.fin), '2026-10-20 07:00');
  assert.deepEqual([hoy.sinDatos, hoy.inicio, hoy.cerrado], [true, inicioDelDia(F), false]);
  // Si vuelve a las 15:00, hoy empieza a las 15:00.
  const ahora2 = h(F, '16:00');
  const vuelve = dia(F, [...actividad, [h(F, '15:00'), ahora2]], { ahora: ahora2 });
  assert.equal(local(vuelve.inicio), '2026-10-20 15:00');
});

test('hoy temprano, todavía sin actividad: sin datos y no cerrado; ayer ya quedó cerrado', () => {
  const ahora = h(F, '05:00');
  const actividad = [[h(A, '08:00'), h(F, '01:00')]];
  const hoy = dia(F, actividad, { ahora });
  assert.deepEqual([hoy.sinDatos, hoy.inicio, hoy.cerrado], [true, inicioDelDia(F), false]);
  const ayer = dia(A, actividad, { ahora });
  assert.equal(local(ayer.fin), '2026-10-20 01:00');
  assert.equal(ayer.cerrado, true);
  // A las 03:00 (antes de S) ayer todavía no está cerrado: podría volver antes de las 04:00.
  assert.equal(dia(A, actividad, { ahora: h(F, '03:00') }).cerrado, false);
});

test('cerrado: ayer a media mañana, con la noche ya terminada y activo desde las 08:30', () => {
  const ahora = h(F, '10:00');
  const actividad = [[h(A, '08:00'), h(F, '01:00')], [h(F, '08:30'), ahora]];
  assert.equal(dia(A, actividad, { ahora }).cerrado, true);  // el hueco contiene S(20): nadie le gana
  assert.equal(dia(F, actividad, { ahora }).cerrado, false); // hoy sigue
});

// ── Otros ──

test('calcularDiaLogico no modifica sus entradas y rechaza una fecha inválida', () => {
  const segmentos = segmentosDe(F, NORMAL);
  const checkins = [checkin('despertar', F, '08:00')];
  const copia = structuredClone({ segmentos, checkins });
  calcularDiaLogico({ fecha: F, segmentos, checkins });
  assert.deepEqual({ segmentos, checkins }, copia);
  assert.throws(() => calcularDiaLogico({ fecha: '20/10/2026', segmentos }), /no es válida/);
});

test('huecoMin cambia qué hueco cuenta como noche', () => {
  const actividad = [[h(A, '09:00'), h(F, '02:00')], [h(F, '04:30'), h(F, '20:00')], [h(M, '08:00'), h(M, '20:00')]];
  assert.equal(local(dia(F, actividad).inicio), '2026-10-20 04:00');                  // 2,5 h no es hueco: corta en S
  assert.equal(local(dia(F, actividad, { huecoMin: 120 }).inicio), '2026-10-20 04:30'); // con 2 h, sí
});

// ── Con los datos de ejemplo ──

/**
 * DatosDiaAW de un día de AW, armados a partir de los buckets crudos de ejemplo: ventanas recortadas a los periodos
 * no AFK (con categoría 'Uncategorized': al día lógico solo le importa si hay actividad), los periodos no AFK y los AFK.
 */
const crudoVentana = eventosEjemplo('aw-watcher-window_ejemplo');
const crudoAfk = eventosEjemplo('aw-watcher-afk_ejemplo');
const NO_AFK = crudoAfk.filter((e) => e.data.status === 'not-afk');
const AFK = crudoAfk.filter((e) => e.data.status === 'afk');
const tramo = (e) => [Date.parse(e.timestamp), Date.parse(e.timestamp) + Math.round(e.duration * 1000)];

/** Ventanas ∩ periodos no AFK (las dos listas ordenadas; los periodos no se solapan). */
function ventanasActivas(ventanas, periodos) {
  const salida = [];
  let j = 0;
  for (const v of ventanas) {
    const [a, b] = tramo(v);
    while (j < periodos.length && tramo(periodos[j])[1] <= a) j++;
    for (let k = j; k < periodos.length && tramo(periodos[k])[0] < b; k++) {
      const [pa, pb] = tramo(periodos[k]);
      const ini = Math.max(a, pa);
      const fin = Math.min(b, pb);
      if (fin > ini) salida.push(evento(ini, fin, { ...v.data, $category: ['Uncategorized'] }));
    }
  }
  return salida;
}
const VENTANAS_ACTIVAS = ventanasActivas(crudoVentana, NO_AFK);

function datosDelDia(fecha) {
  const inicio = inicioDelDia(fecha);
  const fin = inicioDelDia(sumarDias(fecha, 1));
  const toca = (e) => { const [a, b] = tramo(e); return a < fin && b > inicio; };
  return { eventos: VENTANAS_ACTIVAS.filter(toca), navegador: [], no_afk: NO_AFK.filter(toca), afk: AFK.filter(toca) };
}

const porFecha = new Map(); // fecha → segmentos de su día de AW
function segmentosDelDiaAW(fecha) {
  if (!porFecha.has(fecha)) {
    porFecha.set(fecha, segmentar(datosDelDia(fecha), { inicio: inicioDelDia(fecha), fin: inicioDelDia(sumarDias(fecha, 1)) }));
  }
  return porFecha.get(fecha);
}

/** Día lógico de una fecha de ejemplo: segmentos de fecha − 1, fecha y fecha + 1, unidos. */
function diaEjemplo(fecha, checkins = []) {
  const segmentos = unirSegmentos(segmentosDelDiaAW(sumarDias(fecha, -1)), segmentosDelDiaAW(fecha), segmentosDelDiaAW(sumarDias(fecha, 1)));
  return calcularDiaLogico({ fecha, segmentos, checkins });
}

test('datos de ejemplo, sin check-ins: cada día va de la primera a la última actividad de verdad.json', () => {
  for (const fecha of FECHAS_EJEMPLO) {
    const verdad = verdadDelDia(fecha);
    const d = diaEjemplo(fecha);
    assert.equal(d.cerrado, true, fecha);
    if (verdad.primera_actividad === null) {
      assert.equal(d.sinDatos, true, fecha);
      continue;
    }
    assert.equal(d.sinDatos, false, fecha);
    assert.equal(local(d.inicio), local(Date.parse(verdad.primera_actividad)), `inicio del ${fecha}`);
    assert.equal(local(d.fin), local(Date.parse(verdad.ultima_actividad)), `fin del ${fecha}`);
    assert.equal(d.inicio, Date.parse(verdad.primera_actividad), `inicio exacto del ${fecha}`);
    assert.equal(d.fin, Date.parse(verdad.ultima_actividad), `fin exacto del ${fecha}`);
  }
});

test('datos de ejemplo: trasnoches, día sin datos y huecos sin PC dentro del día (casos de F2-01)', () => {
  // Trasnoches: la madrugada es del día anterior.
  assert.equal(local(diaEjemplo('2026-10-06').fin), '2026-10-07 03:10');
  assert.equal(local(diaEjemplo('2026-10-07').fin), '2026-10-08 02:30');
  const d18 = diaEjemplo('2026-10-18');
  assert.equal(local(d18.fin), '2026-10-19 04:30');
  assert.ok(d18.fin > inicioDelDia('2026-10-19')); // después del inicio de día de AW, sin hueco de 3 h
  // Día sin datos.
  const d13 = diaEjemplo('2026-10-13');
  assert.deepEqual([d13.sinDatos, d13.inicio, d13.fin, d13.fuenteFin], [true, inicioDelDia('2026-10-13'), inicioDelDia('2026-10-13'), 'sin_datos']);
  // 10-09: sin PC de 07:40 a 12:30, pero el día no se parte.
  const d09 = diaEjemplo('2026-10-09');
  assert.equal(local(d09.inicio), '2026-10-09 07:10');
  assert.equal(local(d09.fin), '2026-10-09 23:50');
  // Los días seguidos no se pisan.
  for (let i = 1; i < FECHAS_EJEMPLO.length; i++) {
    assert.ok(diaEjemplo(FECHAS_EJEMPLO[i - 1]).fin <= diaEjemplo(FECHAS_EJEMPLO[i]).inicio, FECHAS_EJEMPLO[i]);
  }
});

test('datos de ejemplo: los check-ins de despertar (10-05, 10-06 y 10-17) mandan sobre la estimación', () => {
  const checkins = normalizarCheckins(eventosEjemplo('rastreador-checkins_ejemplo'));
  const esperado = { '2026-10-05': '06:45', '2026-10-06': '10:20', '2026-10-17': '09:05' };
  for (const fecha of FECHAS_EJEMPLO) {
    const sinCheckins = diaEjemplo(fecha);
    const d = diaEjemplo(fecha, checkins);
    if (esperado[fecha]) {
      assert.equal(d.inicio, instanteLocal(fecha, esperado[fecha]), fecha);
      assert.equal(d.fuenteInicio, 'checkin', fecha);
      assert.notEqual(d.inicio, sinCheckins.inicio, fecha);
    } else {
      assert.equal(d.inicio, sinCheckins.inicio, fecha);
    }
    assert.equal(d.fin, sinCheckins.fin, fecha); // no hay check-ins de dormir en los datos de ejemplo
  }
});
