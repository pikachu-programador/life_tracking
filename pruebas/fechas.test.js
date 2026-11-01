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
