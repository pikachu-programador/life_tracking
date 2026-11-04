// Pruebas de web/js/formato.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claseDe, duracionLegible, sumarPorClase } from '../web/js/formato.js';

test('claseDe usa el primer nivel de la categoría', () => {
  assert.deepEqual(claseDe(['Estudio', 'Inglés']), { clave: 'estudio', nombre: 'Estudio' });
  assert.deepEqual(claseDe(['IA']), { clave: 'ia', nombre: 'IA' });
  assert.deepEqual(claseDe(['Uncategorized']), { clave: 'sin-clasificar', nombre: 'Sin clasificar' });
  assert.deepEqual(claseDe(['Otra cosa']), { clave: 'sin-clasificar', nombre: 'Sin clasificar' });
  assert.deepEqual(claseDe(undefined), { clave: 'sin-clasificar', nombre: 'Sin clasificar' });
});

test('duracionLegible', () => {
  assert.equal(duracionLegible(0), '0 min');
  assert.equal(duracionLegible(29), '0 min');
  assert.equal(duracionLegible(45 * 60), '45 min');
  assert.equal(duracionLegible(2 * 3600 + 5 * 60), '2 h 05 min');
  assert.equal(duracionLegible(9 * 3600 + 26 * 60 + 57), '9 h 27 min');
});

test('sumarPorClase', () => {
  const eventos = [
    { duration: 60, data: { $category: ['Estudio', 'Inglés'] } },
    { duration: 30, data: { $category: ['Estudio', 'Programación'] } },
    { duration: 10, data: { $category: ['Uncategorized'] } },
  ];
  assert.deepEqual(sumarPorClase(eventos), { total: 100, porClase: { estudio: 90, 'sin-clasificar': 10 } });
  assert.deepEqual(sumarPorClase([]), { total: 0, porClase: {} });
});

// ── F1-09: formatos nuevos ──
import { porcentajeLegible, diferenciaLegible, duracionCompacta, horasLegibles, numeroLegible } from '../web/js/formato.js';

test('porcentajeLegible', () => {
  assert.equal(porcentajeLegible(0.724), '72 %');
  assert.equal(porcentajeLegible(0.7245, 1), '72,5 %');
  assert.equal(porcentajeLegible(null), '—');
});

test('diferenciaLegible', () => {
  assert.equal(diferenciaLegible(2 * 3600 + 600), '+2 h 10 min');
  assert.equal(diferenciaLegible(-900), '−15 min');
  assert.equal(diferenciaLegible(10), '±0 min');
  assert.equal(diferenciaLegible(null), '—');
});

test('duracionCompacta, horasLegibles y numeroLegible', () => {
  assert.equal(duracionCompacta(45 * 60), '45 min');
  assert.equal(duracionCompacta(2 * 3600 + 5 * 60), '2:05 h');
  assert.equal(horasLegibles(5400), '1,5 h');
  assert.equal(numeroLegible(12840), '12 840');
  assert.equal(numeroLegible(2.5, 1), '2,5');
  assert.equal(numeroLegible(-1234), '−1 234');
});
