// Pruebas de la base de pruebas (F1-08): los datos de ejemplo se leen bien desde pruebas/ayudantes/ejemplo.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOST_EJEMPLO, FECHAS_EJEMPLO, bucketsEjemplo, eventosEjemplo, planEjemplo, verdadEjemplo, verdadDelDia,
} from './ayudantes/ejemplo.js';

test('están los buckets de ventana, AFK, web y check-ins del host de ejemplo', () => {
  const ids = Object.keys(bucketsEjemplo()).sort();
  assert.deepEqual(ids, [
    `aw-watcher-afk_${HOST_EJEMPLO}`, `aw-watcher-web-chrome_${HOST_EJEMPLO}`,
    `aw-watcher-window_${HOST_EJEMPLO}`, `rastreador-checkins_${HOST_EJEMPLO}`,
  ]);
});

test('eventosEjemplo devuelve los eventos en orden y como copia', () => {
  const a = eventosEjemplo(`aw-watcher-window_${HOST_EJEMPLO}`);
  assert.ok(a.length > 10000);
  for (let i = 1; i < a.length; i++) assert.ok(Date.parse(a[i - 1].timestamp) <= Date.parse(a[i].timestamp));
  a[0].data.app = 'modificado';
  assert.notEqual(eventosEjemplo(`aw-watcher-window_${HOST_EJEMPLO}`)[0].data.app, 'modificado');
});

test('verdad.json tiene los 14 días y el plan tiene cursos, clases, rutinas y bloques', () => {
  assert.deepEqual(verdadEjemplo().dias.map((d) => d.fecha), FECHAS_EJEMPLO);
  assert.deepEqual(verdadDelDia('2026-10-13').minutos_por_clase_y_area, {}); // día sin datos
  const plan = planEjemplo();
  assert.equal(plan.nota, undefined);
  for (const lista of ['cursos', 'clases', 'rutinas', 'bloques', 'excepciones']) assert.ok(plan[lista].length > 0, lista);
});
