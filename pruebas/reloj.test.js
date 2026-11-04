// Pruebas de web/js/reloj.js (H-02): reloj de prueba con ?ahora=.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearReloj } from '../web/js/reloj.js';

test('sin ?ahora= es la hora real', () => {
  const r = crearReloj(null, () => 123);
  assert.equal(r.dePrueba, false);
  assert.equal(r.ahora(), 123);
});

test('con ?ahora= arranca en esa hora de Lima y sigue corriendo', () => {
  let real = Date.parse('2026-11-04T12:00:00Z');
  const r = crearReloj('2026-10-14T16:20', () => real);
  assert.equal(r.dePrueba, true);
  assert.equal(r.ahora(), Date.parse('2026-10-14T21:20:00Z')); // 16:20 en Lima = 21:20 UTC
  real += 90_000; // pasa minuto y medio
  assert.equal(r.ahora(), Date.parse('2026-10-14T21:21:30Z'));
});

test('un ?ahora= inválido se ignora', () => {
  for (const malo of ['2026-10-14', '2026-13-01T10:00', '2026-10-14T25:00', 'mañana']) {
    assert.equal(crearReloj(malo, () => 5).dePrueba, false, malo);
  }
});

test('acepta segundos y rechaza un ?ahora= en el futuro (revisión de H-02)', () => {
  const real = Date.parse('2026-11-04T12:00:00Z');
  const r = crearReloj('2026-10-14T16:20:30', () => real);
  assert.equal(r.ahora(), Date.parse('2026-10-14T21:20:30Z'));
  const futuro = crearReloj('2027-01-01T10:00', () => real);
  assert.equal(futuro.dePrueba, false);
  assert.equal(futuro.error, 'futuro');
  assert.equal(crearReloj('2026-10-14 16:20', () => real).error, 'invalido');
});
