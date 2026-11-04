// Pruebas de web/js/fechas.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  minutosDeHora, esFechaValida, periodoDelDia, diaDe, sumarDias, diasDelRango, diaTerminado, fechaLegible, fechaCorta,
} from '../web/js/fechas.js';

test('minutosDeHora', () => {
  assert.equal(minutosDeHora('04:00'), 240);
  assert.equal(minutosDeHora('00:30'), 30);
  assert.equal(minutosDeHora(), 240);
});

test('esFechaValida', () => {
  assert.ok(esFechaValida('2026-10-31'));
  assert.ok(esFechaValida('2028-02-29')); // año bisiesto
  assert.ok(!esFechaValida('2026-02-30'));
  assert.ok(!esFechaValida('31-10-2026'));
  assert.ok(!esFechaValida(undefined));
});

test('periodoDelDia: de 04:00 a 04:00 hora Lima (= 09:00 UTC)', () => {
  const [inicio, fin] = periodoDelDia('2026-10-31');
  assert.equal(inicio.toISOString(), '2026-10-31T09:00:00.000Z');
  assert.equal(fin.toISOString(), '2026-11-01T09:00:00.000Z');
  // Con otro inicio de día.
  assert.equal(periodoDelDia('2026-10-31', '00:00')[0].toISOString(), '2026-10-31T05:00:00.000Z');
  // Cambio de mes y de año.
  assert.equal(periodoDelDia('2026-12-31')[1].toISOString(), '2027-01-01T09:00:00.000Z');
});

test('diaDe: la 1:00 a. m. cuenta para el día anterior', () => {
  // 1-nov 01:00 Lima = 06:00 UTC → día 31-oct.
  assert.equal(diaDe(new Date('2026-11-01T06:00:00Z')), '2026-10-31');
  // 1-nov 03:59 Lima → todavía 31-oct; 04:00 → 1-nov.
  assert.equal(diaDe(new Date('2026-11-01T08:59:59Z')), '2026-10-31');
  assert.equal(diaDe(new Date('2026-11-01T09:00:00Z')), '2026-11-01');
  // 31-oct 23:00 Lima = 1-nov 04:00 UTC → 31-oct (aunque en UTC ya es 1-nov).
  assert.equal(diaDe(new Date('2026-11-01T04:00:00Z')), '2026-10-31');
});

test('diaDe y periodoDelDia son coherentes', () => {
  for (const fecha of ['2026-01-01', '2026-10-31', '2026-12-31']) {
    const [inicio, fin] = periodoDelDia(fecha);
    assert.equal(diaDe(inicio), fecha);
    assert.equal(diaDe(new Date(fin.getTime() - 1)), fecha);
    assert.equal(diaDe(fin), sumarDias(fecha, 1));
  }
});

test('sumarDias y diasDelRango', () => {
  assert.equal(sumarDias('2026-10-31', 1), '2026-11-01');
  assert.equal(sumarDias('2026-03-01', -1), '2026-02-28');
  assert.deepEqual(diasDelRango('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(diasDelRango('2026-11-01', '2026-11-01'), ['2026-11-01']);
  assert.deepEqual(diasDelRango('2026-11-02', '2026-11-01'), []);
});

test('diaTerminado depende de "ahora"', () => {
  assert.ok(!diaTerminado('2026-10-31', new Date('2026-11-01T08:59:59Z')));
  assert.ok(diaTerminado('2026-10-31', new Date('2026-11-01T09:00:00Z')));
});

test('fechaLegible y fechaCorta en español', () => {
  assert.equal(fechaLegible('2026-10-31'), 'sábado, 31 de octubre de 2026');
  assert.equal(fechaCorta('2026-10-31'), 'sáb, 31 oct');
});

// ── F1-09: funciones nuevas (web/motor/fechas.js) ──
import {
  esHoraValida, horaDeMinutos, fechaLocal, minutosLocales, horaLocal, horaDelDia, instanteLocal, instanteDelPlan,
  diaSemana, inicioSemana, inicioMes, finMes, diasEntre, periodoDe, largoPeriodo, periodoAnterior, periodoSiguiente,
} from '../web/motor/fechas.js';
import { periodoLegible, fechaMuyCorta, mesLegible } from '../web/js/fechas.js';

test('esHoraValida y horaDeMinutos', () => {
  assert.ok(esHoraValida('00:00') && esHoraValida('23:59') && esHoraValida('07:05'));
  assert.ok(!esHoraValida('24:00') && !esHoraValida('7:05') && !esHoraValida('12:60') && !esHoraValida(undefined));
  assert.equal(horaDeMinutos(240), '04:00');
  assert.equal(horaDeMinutos(1440 + 30), '00:30');
  assert.equal(horaDeMinutos(-30), '23:30');
});

test('hora local de Lima: fecha, minutos y "HH:MM"', () => {
  const t = Date.parse('2026-10-06T05:40:00Z'); // 6-oct 00:40 en Lima
  assert.equal(fechaLocal(t), '2026-10-06');
  assert.equal(minutosLocales(t), 40);
  assert.equal(horaLocal(t), '00:40');
  assert.equal(horaDelDia(t), 0);
  assert.equal(fechaLocal(new Date('2026-10-06T04:59:00Z')), '2026-10-05'); // 23:59 del 5-oct
});

test('instanteLocal e instanteDelPlan (bloques después de medianoche, §8)', () => {
  assert.equal(instanteLocal('2026-10-05', '15:00'), Date.parse('2026-10-05T20:00:00Z'));
  // "lunes 00:30" es el martes a las 00:30; "lunes 23:30" sigue siendo el lunes.
  assert.equal(instanteDelPlan('2026-10-05', '00:30'), Date.parse('2026-10-06T05:30:00Z'));
  assert.equal(instanteDelPlan('2026-10-05', '23:30'), Date.parse('2026-10-06T04:30:00Z'));
  assert.equal(instanteDelPlan('2026-10-05', '04:00'), instanteLocal('2026-10-05', '04:00'));
  assert.equal(instanteDelPlan('2026-10-05', '05:00', '06:00'), instanteLocal('2026-10-06', '05:00'));
});

test('diaSemana, inicioSemana, meses y diasEntre', () => {
  assert.equal(diaSemana('2026-10-05'), 'lun');
  assert.equal(diaSemana('2026-10-11'), 'dom');
  assert.equal(inicioSemana('2026-10-11'), '2026-10-05');
  assert.equal(inicioSemana('2026-10-05'), '2026-10-05');
  assert.equal(inicioMes('2026-10-17'), '2026-10-01');
  assert.equal(finMes('2026-02-10'), '2026-02-28');
  assert.equal(finMes('2028-02-10'), '2028-02-29');
  assert.equal(finMes('2026-12-31'), '2026-12-31');
  assert.equal(diasEntre('2026-10-05', '2026-10-18'), 13);
});

test('períodos: día, semana, mes, rango, anterior y siguiente', () => {
  assert.deepEqual(periodoDe('semana', '2026-10-14'), { tipo: 'semana', desde: '2026-10-12', hasta: '2026-10-18' });
  assert.deepEqual(periodoDe('mes', '2026-10-14'), { tipo: 'mes', desde: '2026-10-01', hasta: '2026-10-31' });
  assert.deepEqual(periodoDe('rango', '2026-10-18', '2026-10-05'), { tipo: 'rango', desde: '2026-10-05', hasta: '2026-10-18' });
  assert.equal(largoPeriodo(periodoDe('semana', '2026-10-14')), 7);
  assert.deepEqual(periodoAnterior(periodoDe('semana', '2026-10-14')), { tipo: 'semana', desde: '2026-10-05', hasta: '2026-10-11' });
  assert.deepEqual(periodoAnterior(periodoDe('mes', '2026-03-15')), { tipo: 'mes', desde: '2026-02-01', hasta: '2026-02-28' });
  assert.deepEqual(periodoSiguiente(periodoDe('mes', '2026-01-31')), { tipo: 'mes', desde: '2026-02-01', hasta: '2026-02-28' });
  assert.deepEqual(periodoAnterior({ tipo: 'rango', desde: '2026-10-10', hasta: '2026-10-12' }), { tipo: 'rango', desde: '2026-10-07', hasta: '2026-10-09' });
  assert.throws(() => periodoDe('año', '2026-10-14'));
});

test('textos de períodos en español', () => {
  assert.equal(fechaMuyCorta('2026-10-05'), '5 oct');
  assert.equal(mesLegible('2026-10-05'), 'octubre de 2026');
  assert.equal(periodoLegible({ tipo: 'semana', desde: '2026-10-05', hasta: '2026-10-11' }), '5 – 11 oct 2026');
  assert.equal(periodoLegible({ tipo: 'rango', desde: '2025-12-28', hasta: '2026-01-04' }), '28 dic 2025 – 4 ene 2026');
  assert.equal(periodoLegible({ tipo: 'mes', desde: '2026-10-01', hasta: '2026-10-31' }), 'octubre de 2026');
});

test('diaDe y diaTerminado aceptan números (ms) además de Date', () => {
  assert.equal(diaDe(Date.parse('2026-11-01T06:00:00Z')), '2026-10-31');
  assert.ok(diaTerminado('2026-10-31', Date.parse('2026-11-01T09:00:00Z')));
});

// ── Revisión de F1-09 ──
import { inicioDelDia } from '../web/motor/fechas.js';

test('diaDe acepta el timestamp ISO de un evento de AW', () => {
  assert.equal(diaDe('2026-11-01T06:00:00.000000+00:00'), '2026-10-31');
});

test('diaDe con otro inicio de día', () => {
  // 1-nov 05:00 Lima: con inicio 06:00 todavía es el 31-oct; con 04:00 ya es el 1-nov.
  assert.equal(diaDe(Date.parse('2026-11-01T10:00:00Z'), '06:00'), '2026-10-31');
  assert.equal(diaDe(Date.parse('2026-11-01T10:00:00Z'), '04:00'), '2026-11-01');
});

test('inicioDelDia devuelve ms', () => {
  assert.equal(inicioDelDia('2026-10-31'), Date.parse('2026-10-31T09:00:00Z'));
  assert.equal(typeof (inicioDelDia('2026-10-31') + 8 * 3600e3), 'number');
});

test('periodoSiguiente en semana y rango', () => {
  assert.deepEqual(periodoSiguiente(periodoDe('semana', '2026-10-14')), { tipo: 'semana', desde: '2026-10-19', hasta: '2026-10-25' });
  assert.deepEqual(periodoSiguiente({ tipo: 'rango', desde: '2026-10-10', hasta: '2026-10-12' }), { tipo: 'rango', desde: '2026-10-13', hasta: '2026-10-15' });
});
