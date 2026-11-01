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
