// Pruebas de la caché de días (web/js/datos-dia.js), con un AW falso y un reloj fijo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearAlmacenDias } from '../web/js/datos-dia.js';

// AW falso: anota cada pedido y devuelve, por periodo, el inicio en texto.
function awFalso() {
  const pedidos = [];
  return {
    pedidos,
    pedirPeriodos: async (periodos) => {
      pedidos.push(periodos.map(([inicio]) => inicio.toISOString()));
      return periodos.map(([inicio]) => ({ inicio: inicio.toISOString() }));
    },
  };
}

// "Ahora" = 1-nov 12:00 Lima (17:00 UTC): el 31-oct ya terminó, el 1-nov no.
const ahora = () => new Date('2026-11-01T17:00:00Z');

test('un día terminado se pide una vez y luego sale de la caché', async () => {
  const aw = awFalso();
  const almacen = crearAlmacenDias({ pedirPeriodos: aw.pedirPeriodos, ahora });
  const a = await almacen.dia('2026-10-31');
  const b = await almacen.dia('2026-10-31');
  assert.equal(a.desdeCache, false);
  assert.equal(b.desdeCache, true);
  assert.deepEqual(b.datos, { inicio: '2026-10-31T09:00:00.000Z' });
  assert.equal(aw.pedidos.length, 1);
});

test('hoy se pide siempre de nuevo', async () => {
  const aw = awFalso();
  const almacen = crearAlmacenDias({ pedirPeriodos: aw.pedirPeriodos, ahora });
  await almacen.dia('2026-11-01');
  const otraVez = await almacen.dia('2026-11-01');
  assert.equal(otraVez.desdeCache, false);
  assert.equal(aw.pedidos.length, 2);
  assert.ok(!almacen.enCache('2026-11-01'));
});

test('un rango pide solo los días que faltan, en una sola consulta y en orden', async () => {
  const aw = awFalso();
  const almacen = crearAlmacenDias({ pedirPeriodos: aw.pedirPeriodos, ahora });
  await almacen.dia('2026-10-30');
  const r = await almacen.rango('2026-10-29', '2026-11-01');
  assert.deepEqual(r.map((d) => [d.fecha, d.desdeCache]), [
    ['2026-10-29', false], ['2026-10-30', true], ['2026-10-31', false], ['2026-11-01', false],
  ]);
  // Segundo pedido: solo 29, 31 y 1 (el 30 ya estaba), uno por día.
  assert.deepEqual(aw.pedidos[1], ['2026-10-29T09:00:00.000Z', '2026-10-31T09:00:00.000Z', '2026-11-01T09:00:00.000Z']);
});

test('dos pedidos simultáneos del mismo día hacen una sola consulta', async () => {
  const aw = awFalso();
  const almacen = crearAlmacenDias({ pedirPeriodos: aw.pedirPeriodos, ahora });
  const [a, b] = await Promise.all([almacen.dia('2026-10-31'), almacen.dia('2026-10-31')]);
  assert.deepEqual(a.datos, b.datos);
  assert.equal(aw.pedidos.length, 1);
});

test('usa el startOfDay de AW', async () => {
  const aw = awFalso();
  const almacen = crearAlmacenDias({ pedirPeriodos: aw.pedirPeriodos, ahora, inicioDia: async () => '06:00' });
  const { datos } = await almacen.dia('2026-10-31');
  assert.equal(datos.inicio, '2026-10-31T11:00:00.000Z'); // 06:00 Lima
});

test('vaciar() borra la caché', async () => {
  const aw = awFalso();
  const almacen = crearAlmacenDias({ pedirPeriodos: aw.pedirPeriodos, ahora });
  await almacen.dia('2026-10-31');
  almacen.vaciar();
  assert.equal((await almacen.dia('2026-10-31')).desdeCache, false);
  assert.equal(aw.pedidos.length, 2);
});

test('el reloj puede ser un número en ms (reloj de prueba, H-02)', async () => {
  const aw = awFalso();
  const almacen = crearAlmacenDias({ pedirPeriodos: aw.pedirPeriodos, ahora: () => Date.parse('2026-11-01T17:00:00Z') });
  await almacen.dia('2026-10-31');
  assert.ok(almacen.enCache('2026-10-31'));
  await almacen.dia('2026-11-01');
  assert.ok(!almacen.enCache('2026-11-01'));
});
