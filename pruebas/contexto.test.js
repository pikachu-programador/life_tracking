// Pruebas de web/motor/contexto.js (F4-01): contexto de cada segmento según el plan del día.
//
// Los segmentos y los ítems del día se arman a mano siguiendo los @typedef de web/motor/tipos.js
// (horario.js y segmentos.js se escriben en paralelo). Las horas son de Lima: instanteLocal las convierte a ms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asignarContexto } from '../web/motor/contexto.js';
import { instanteLocal } from '../web/motor/fechas.js';

const F = '2026-10-05'; // lunes de los datos de ejemplo
const MIN = 60 * 1000;

/** "HH:MM" del lunes 5 (o "+HH:MM" para el día siguiente) → ms. */
function h(hora) {
  return hora.startsWith('+') ? instanteLocal('2026-10-06', hora.slice(1)) : instanteLocal(F, hora);
}

/** Segmento de prueba (forma Segmento de tipos.js). */
function seg(de, a, clase = 'estudio', extra = {}) {
  const categoria = { estudio: ['Estudio', 'Programación'], distraccion: ['Distracción', 'Redes'], ia: ['IA'], neutral: ['Neutral', 'Sistema'] }[clase] ?? null;
  return {
    inicio: h(de), fin: h(a), clase, categoria, area: clase === 'estudio' ? 'Programación' : null,
    app: 'app.exe', titulo: 't', url: null, dominio: null, audible: false, incognito: false, ...extra,
  };
}

/** BloqueDia de prueba. */
function bloque(id, curso, de, a, extra = {}) {
  return {
    id: `${id}@${F}`, bloqueId: id, tipo: 'estudio_pc', curso, inicio: h(de), fin: h(a), finPlan: h(a),
    nivel: 'friccion', subidoPorExcepcion: false, objetivo: '', porQue: '', terminadoAntes: null, ...extra,
  };
}

/** ClaseDia de prueba. */
function clase(id, curso, de, a) {
  return { id: `${id}@${F}`, claseId: id, curso, tipo: 'teoria', inicio: h(de), fin: h(a), lugar: 'UTEC', usaPc: false };
}

/** RutinaDia de prueba. */
function rutina(id, medicion, de, a, extra = {}) {
  return {
    id: `${id}@${F}`, rutinaId: id, nombre: id, medicion, evento: null,
    inicio: de == null ? null : h(de), fin: a == null ? null : h(a),
    categoria: null, minutosMeta: null, toleranciaMin: 10, ...extra,
  };
}

function items({ bloques = [], clases = [], rutinas = [] } = {}) {
  return { fecha: F, enCiclo: true, excepciones: [], bloques, clases, rutinas };
}

/** Lo esencial de cada pedazo, para comparar fácil: [de, a, contexto, id]. */
function resumen(salida) {
  const hora = (ms) => new Date(ms - 5 * 60 * MIN).toISOString().slice(11, 16);
  return salida.map((s) => [hora(s.inicio), hora(s.fin), s.contexto, s.bloqueId ?? s.claseId ?? s.rutinaId ?? undefined]);
}

const duracionTotal = (lista) => lista.reduce((t, s) => t + (s.fin - s.inicio), 0);

/** Comprueba lo que siempre debe cumplirse: misma cobertura, sin solapes, orden y forma. */
function comprobarCobertura(entrada, salida) {
  assert.equal(duracionTotal(salida), duracionTotal(entrada), 'misma suma de duraciones');
  for (let i = 1; i < salida.length; i++) assert.ok(salida[i].inicio >= salida[i - 1].fin, 'sin solapes y en orden');
  for (const s of salida) {
    assert.ok(s.fin > s.inicio, 'sin pedazos vacíos');
    assert.ok(['bloque', 'clase', 'rutina', 'libre'].includes(s.contexto));
    for (const clave of ['bloqueId', 'cursoId', 'claseId', 'rutinaId']) assert.ok(clave in s, `tiene ${clave}`);
  }
  // Cada segmento de entrada queda cubierto por sus pedazos, sin cambiar su actividad.
  for (const e of entrada) {
    const pedazos = salida.filter((s) => s.inicio >= e.inicio && s.fin <= e.fin);
    assert.equal(duracionTotal(pedazos), e.fin - e.inicio);
    for (const p of pedazos) assert.equal(p.clase, e.clase);
  }
}

test('segmento dentro de un bloque: contexto bloque con su id y su curso', () => {
  const entrada = [seg('15:10', '16:00')];
  const salida = asignarContexto(entrada, items({ bloques: [bloque('b-bd1-lun', 'bd1', '15:00', '17:00')] }));
  assert.equal(salida.length, 1);
  assert.deepEqual(
    { contexto: salida[0].contexto, bloqueId: salida[0].bloqueId, cursoId: salida[0].cursoId, claseId: salida[0].claseId, rutinaId: salida[0].rutinaId },
    { contexto: 'bloque', bloqueId: `b-bd1-lun@${F}`, cursoId: 'bd1', claseId: null, rutinaId: null },
  );
  // Conserva todo lo demás del segmento.
  assert.equal(salida[0].app, 'app.exe');
  assert.deepEqual(salida[0].categoria, ['Estudio', 'Programación']);
});

test('bordes del bloque: se parte donde empieza y donde termina', () => {
  const dia = items({ bloques: [bloque('b', 'bd1', '15:00', '17:00')] });
  // Empieza antes y termina dentro.
  assert.deepEqual(resumen(asignarContexto([seg('14:30', '15:20')], dia)), [
    ['14:30', '15:00', 'libre', undefined], ['15:00', '15:20', 'bloque', `b@${F}`],
  ]);
  // Empieza dentro y termina después.
  assert.deepEqual(resumen(asignarContexto([seg('16:50', '17:30')], dia)), [
    ['16:50', '17:00', 'bloque', `b@${F}`], ['17:00', '17:30', 'libre', undefined],
  ]);
  // Cubre todo el bloque: tres pedazos.
  assert.deepEqual(resumen(asignarContexto([seg('14:00', '18:00')], dia)), [
    ['14:00', '15:00', 'libre', undefined], ['15:00', '17:00', 'bloque', `b@${F}`], ['17:00', '18:00', 'libre', undefined],
  ]);
});

test('bordes exactos: [inicio, fin) — terminar justo al empezar el bloque no es del bloque', () => {
  const dia = items({ bloques: [bloque('b', 'bd1', '15:00', '17:00')] });
  // Termina justo cuando empieza el bloque: no se parte y queda libre.
  assert.deepEqual(resumen(asignarContexto([seg('14:00', '15:00')], dia)), [['14:00', '15:00', 'libre', undefined]]);
  // Empieza justo cuando termina el bloque: libre.
  assert.deepEqual(resumen(asignarContexto([seg('17:00', '17:30')], dia)), [['17:00', '17:30', 'libre', undefined]]);
  // Empieza justo al inicio y termina justo al fin: un solo pedazo de bloque.
  assert.deepEqual(resumen(asignarContexto([seg('15:00', '17:00')], dia)), [['15:00', '17:00', 'bloque', `b@${F}`]]);
});

test('distracción en tiempo libre: contexto libre, sin bloque (no cuenta como fallo de ningún bloque)', () => {
  const entrada = [seg('12:00', '14:59', 'distraccion'), seg('14:59', '15:00', 'neutral'), seg('15:00', '17:00', 'estudio'), seg('17:00', '19:00', 'distraccion')];
  const salida = asignarContexto(entrada, items({ bloques: [bloque('b', 'bd1', '15:00', '17:00')] }));
  comprobarCobertura(entrada, salida);
  const distraccion = salida.filter((s) => s.clase === 'distraccion');
  assert.equal(distraccion.length, 2);
  for (const s of distraccion) {
    assert.equal(s.contexto, 'libre');
    assert.equal(s.bloqueId, null);
    assert.equal(s.cursoId, null);
  }
});

test('feriado (10-08): sin bloques ni clases, todo es tiempo libre', () => {
  const entrada = [seg('10:00', '13:00', 'distraccion'), seg('13:00', '18:00', 'distraccion')];
  const salida = asignarContexto(entrada, items());
  assert.deepEqual(salida.map((s) => s.contexto), ['libre', 'libre']);
  comprobarCobertura(entrada, salida);
});

test('clase: contexto clase con claseId y el curso de la clase', () => {
  const salida = asignarContexto([seg('07:30', '09:00', 'neutral')], items({ clases: [clase('c-bd1-lun-0800', 'bd1', '08:00', '10:00')] }));
  assert.deepEqual(resumen(salida), [['07:30', '08:00', 'libre', undefined], ['08:00', '09:00', 'clase', `c-bd1-lun-0800@${F}`]]);
  assert.equal(salida[1].cursoId, 'bd1');
  assert.equal(salida[1].bloqueId, null);
});

test('rutina con franja: contexto rutina, sin curso', () => {
  const salida = asignarContexto([seg('20:50', '21:30')], items({ rutinas: [rutina('ingles-pc', 'pc', '21:00', '22:00')] }));
  assert.deepEqual(resumen(salida), [['20:50', '21:00', 'libre', undefined], ['21:00', '21:30', 'rutina', `ingles-pc@${F}`]]);
  assert.equal(salida[1].cursoId, null);
});

test('las rutinas sin franja y las de día lógico no dan contexto', () => {
  const dia = items({
    rutinas: [
      rutina('leer', 'checkin', null, null),                   // sin franja: cuenta en todo el día
      rutina('despertar', 'dia_logico', '07:00', '07:00', { evento: 'despertar' }),
      rutina('dormir', 'dia_logico', '+01:00', '+01:00', { evento: 'dormir' }),
      rutina('raro', 'dia_logico', '06:00', '08:00'),          // aunque traiga un tramo, es de día lógico
    ],
  });
  const salida = asignarContexto([seg('06:00', '09:00'), seg('+00:30', '+01:30')], dia);
  assert.deepEqual(salida.map((s) => s.contexto), ['libre', 'libre']);
});

test('prioridad: bloque > clase > rutina > libre', () => {
  // Rutina 14:00–18:00, clase 14:30–16:00 y bloque 15:00–17:00, todo superpuesto.
  const dia = items({
    bloques: [bloque('b', 'bd1', '15:00', '17:00')],
    clases: [clase('c', 'edo', '14:30', '16:00')],
    rutinas: [rutina('r', 'checkin', '14:00', '18:00')],
  });
  const salida = asignarContexto([seg('13:30', '18:30')], dia);
  assert.deepEqual(resumen(salida), [
    ['13:30', '14:00', 'libre', undefined],
    ['14:00', '14:30', 'rutina', `r@${F}`],
    ['14:30', '15:00', 'clase', `c@${F}`],
    ['15:00', '17:00', 'bloque', `b@${F}`],
    ['17:00', '18:00', 'rutina', `r@${F}`],
    ['18:00', '18:30', 'libre', undefined],
  ]);
  // Solo el id del ganador; cursoId del bloque (bd1) y no el de la clase (edo).
  const enBloque = salida[3];
  assert.equal(enBloque.cursoId, 'bd1');
  assert.equal(enBloque.claseId, null);
  assert.equal(enBloque.rutinaId, null);
  assert.equal(salida[2].cursoId, 'edo');
});

test('dos bloques superpuestos: gana el que empezó antes, y el otro sigue después', () => {
  const dia = items({ bloques: [bloque('a', 'bd1', '15:00', '17:00'), bloque('b', 'dbp', '16:00', '18:00')] });
  const salida = asignarContexto([seg('14:00', '19:00')], dia);
  assert.deepEqual(resumen(salida), [
    ['14:00', '15:00', 'libre', undefined],
    ['15:00', '17:00', 'bloque', `a@${F}`],
    ['17:00', '18:00', 'bloque', `b@${F}`],
    ['18:00', '19:00', 'libre', undefined],
  ]);
  // Da igual el orden en que vengan en la lista.
  const alReves = items({ bloques: [bloque('b', 'dbp', '16:00', '18:00'), bloque('a', 'bd1', '15:00', '17:00')] });
  assert.deepEqual(resumen(asignarContexto([seg('14:00', '19:00')], alReves)), resumen(salida));
});

test('bloques seguidos: el segmento se parte entre los dos sin tiempo libre en medio', () => {
  const dia = items({ bloques: [bloque('a', 'bd1', '15:00', '16:00'), bloque('b', 'dbp', '16:00', '17:00')] });
  assert.deepEqual(resumen(asignarContexto([seg('15:30', '16:30')], dia)), [
    ['15:30', '16:00', 'bloque', `a@${F}`], ['16:00', '16:30', 'bloque', `b@${F}`],
  ]);
});

test('bloque terminado antes: da contexto solo hasta su fin real', () => {
  const terminado = bloque('b', 'bd1', '15:00', '16:15', { finPlan: h('17:00'), terminadoAntes: { fin: h('16:15'), motivo: 'Terminé los ejercicios' } });
  const salida = asignarContexto([seg('15:00', '17:00')], items({ bloques: [terminado] }));
  assert.deepEqual(resumen(salida), [['15:00', '16:15', 'bloque', `b@${F}`], ['16:15', '17:00', 'libre', undefined]]);
});

test('bloque que cruza la medianoche (10-06, 23:30–00:30)', () => {
  const dia = items({ bloques: [bloque('b-p3-mar-noche', 'p3', '23:30', '+00:30')] });
  const salida = asignarContexto([seg('23:00', '23:45', 'distraccion'), seg('23:45', '+01:00')], dia);
  assert.deepEqual(resumen(salida), [
    ['23:00', '23:30', 'libre', undefined],
    ['23:30', '23:45', 'bloque', `b-p3-mar-noche@${F}`],
    ['23:45', '00:30', 'bloque', `b-p3-mar-noche@${F}`],
    ['00:30', '01:00', 'libre', undefined],
  ]);
});

test('ítems inválidos (duración 0 o fin antes del inicio) se ignoran', () => {
  const dia = items({ bloques: [bloque('vacio', 'bd1', '15:00', '15:00'), bloque('alreves', 'bd1', '16:00', '15:30')] });
  assert.deepEqual(asignarContexto([seg('14:00', '17:00')], dia).map((s) => s.contexto), ['libre']);
});

test('listas vacías y entradas nulas', () => {
  assert.deepEqual(asignarContexto([], items({ bloques: [bloque('b', 'bd1', '15:00', '17:00')] })), []);
  assert.deepEqual(asignarContexto(undefined, items()), []);
  const salida = asignarContexto([seg('10:00', '11:00')], undefined);
  assert.equal(salida[0].contexto, 'libre');
  assert.equal(salida[0].bloqueId, null);
});

test('volver a asignar contexto reemplaza el anterior', () => {
  const primero = asignarContexto([seg('15:00', '16:00')], items({ bloques: [bloque('b', 'bd1', '15:00', '17:00')] }));
  const otraVez = asignarContexto(primero, items());
  assert.equal(otraVez[0].contexto, 'libre');
  assert.equal(otraVez[0].bloqueId, null);
  assert.equal(otraVez[0].cursoId, null);
});

test('no modifica las entradas', () => {
  const entrada = [seg('14:00', '16:00'), seg('16:00', '18:00', 'distraccion')];
  const dia = items({ bloques: [bloque('b', 'bd1', '15:00', '17:00')], clases: [clase('c', 'edo', '10:00', '12:00')] });
  const copiaEntrada = structuredClone(entrada);
  const copiaDia = structuredClone(dia);
  const salida = asignarContexto(entrada, dia);
  assert.deepEqual(entrada, copiaEntrada);
  assert.deepEqual(dia, copiaDia);
  assert.notEqual(salida[0], entrada[0]); // objetos nuevos
});

test('~3000 segmentos de un día con varios ítems: cobertura exacta y rápido', () => {
  // Segmentos de 20 s seguidos desde las 06:00 (unas 16 h 40 min), alternando clases.
  const clases = ['estudio', 'distraccion', 'neutral', 'ia', 'afk'];
  const inicio = h('06:00');
  const entrada = Array.from({ length: 3000 }, (_, i) => ({
    ...seg('06:00', '06:01', clases[i % clases.length]), inicio: inicio + i * 20_000, fin: inicio + (i + 1) * 20_000,
  }));
  const dia = items({
    bloques: [bloque('a', 'bd1', '15:00', '17:00'), bloque('b', 'dbp', '16:30', '18:00'), bloque('c', 'p3', '20:00', '21:30')],
    clases: [clase('c1', 'bd1', '08:00', '10:00'), clase('c2', 'edo', '10:00', '12:00')],
    rutinas: [rutina('ingles-pc', 'pc', '21:00', '22:00'), rutina('ejercicio', 'checkin', '19:30', '20:30')],
  });
  const t0 = performance.now();
  const salida = asignarContexto(entrada, dia);
  const ms = performance.now() - t0;
  comprobarCobertura(entrada, salida);
  assert.ok(ms < 200, `tardó ${ms.toFixed(1)} ms`);
  // Tiempo por contexto, calculado a mano. El día va de 06:00 a 22:40.
  const porContexto = {};
  for (const s of salida) porContexto[s.contexto] = (porContexto[s.contexto] ?? 0) + (s.fin - s.inicio);
  for (const clave in porContexto) porContexto[clave] /= MIN; // se suma en ms (enteros) y se pasa a minutos al final
  // bloques: a 15:00–17:00 (120) + b 17:00–18:00 (60) + c 20:00–21:30 (90) = 270
  // clases: 08:00–12:00 = 240
  // rutinas: ejercicio 19:30–20:00 (30; de 20:00 a 20:30 gana el bloque c) + inglés 21:30–22:00 (30) = 60
  // libre: 1000 − 270 − 240 − 60 = 430
  assert.deepEqual(porContexto, { libre: 430, clase: 240, bloque: 270, rutina: 60 });
});
