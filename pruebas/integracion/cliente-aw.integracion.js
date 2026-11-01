// Prueba de integración del cliente de AW (F1-03): habla con el AW real de esta PC.
// No corre con `npm test` (que es solo para el motor); se corre a mano con AW abierto:
//   npm run test:aw
// Solo escribe en un bucket de prueba (que borra al final) y en el ajuste `rastreador-prueba`.
// No lee ni muestra eventos reales (títulos y URLs son privados).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteAW, ErrorAW } from '../../web/js/aw.js';

const aw = crearClienteAW({ base: 'http://localhost:5600/api/0' });
let hostname;
let bucket;

before(async () => {
  hostname = (await aw.info()).hostname;
  bucket = `rastreador-prueba_${hostname}`;
  await aw.borrarBucket(bucket).catch(() => {}); // por si quedó de una corrida anterior
});

after(async () => {
  await aw.borrarBucket(bucket).catch(() => {});
});

test('info() trae versión y hostname', async () => {
  const info = await aw.info();
  assert.match(info.version, /^v\d+\.\d+/);
  assert.equal(typeof info.hostname, 'string');
});

test('buckets() lista los watchers de ventana y AFK', async () => {
  const ids = Object.keys(await aw.buckets());
  assert.ok(ids.includes(`aw-watcher-window_${hostname}`));
  assert.ok(ids.includes(`aw-watcher-afk_${hostname}`));
});

test('crearBucket() crea el bucket y repetirlo no falla', async () => {
  await aw.crearBucket(bucket, { tipo: 'rastreador.prueba', hostname });
  await aw.crearBucket(bucket, { tipo: 'rastreador.prueba', hostname }); // ya existe: no debe lanzar error
  const b = (await aw.buckets())[bucket];
  assert.equal(b.client, 'rastreador');
  assert.equal(b.type, 'rastreador.prueba');
});

test('insertarEventos(), eventos() y borrarEvento()', async () => {
  const t0 = new Date(Date.now() - 60 * 60 * 1000); // hace una hora
  await aw.insertarEventos(bucket, [
    { timestamp: t0, duration: 60, data: { n: 1 } },
    { timestamp: new Date(t0.getTime() + 120_000), duration: 30, data: { n: 2 } },
  ]);
  const todos = await aw.eventos(bucket);
  assert.equal(todos.length, 2);
  assert.deepEqual(todos.map((e) => e.data.n), [2, 1]); // del más nuevo al más viejo

  const filtrados = await aw.eventos(bucket, { inicio: new Date(t0.getTime() + 90_000) });
  assert.deepEqual(filtrados.map((e) => e.data.n), [2]);
  assert.equal((await aw.eventos(bucket, { limite: 1 })).length, 1);

  await aw.borrarEvento(bucket, todos[0].id);
  assert.deepEqual((await aw.eventos(bucket)).map((e) => e.data.n), [1]);
});

test('latido() alarga el evento si los datos no cambian', async () => {
  const t = new Date(Date.now() - 30_000);
  await aw.latido(bucket, { timestamp: t, data: { estado: 'vivo' } }, 60);
  await aw.latido(bucket, { timestamp: new Date(t.getTime() + 10_000), data: { estado: 'vivo' } }, 60);
  const vivos = (await aw.eventos(bucket)).filter((e) => e.data.estado === 'vivo');
  assert.equal(vivos.length, 1);
  assert.ok(Math.abs(vivos[0].duration - 10) < 0.01);
  assert.throws(() => aw.latido(bucket, { timestamp: t, data: {} }), /pulsetime/);
});

test('consulta() con el lenguaje de AW', async () => {
  const fin = new Date();
  const inicio = new Date(fin.getTime() - 2 * 60 * 60 * 1000);
  const [resultado] = await aw.consulta([[inicio, fin]], [
    `eventos = query_bucket("${bucket}");`,
    'RETURN = sum_durations(eventos);',
  ]);
  assert.ok(Math.abs(resultado - 70) < 0.01); // 60 s (evento n=1) + 10 s (latido)
});

test('ajustes(), ajuste() y guardarAjuste()', async () => {
  const valor = { prueba: true, numero: 7, lista: ['a', 'b'] };
  await aw.guardarAjuste('rastreador-prueba', valor);
  assert.deepEqual(await aw.ajuste('rastreador-prueba'), valor);
  const todos = await aw.ajustes();
  assert.deepEqual(todos['rastreador-prueba'], valor);
  assert.ok('startOfDay' in todos);
});

test('si AW no responde, lanza ErrorAW de tipo "sin-conexion"', async () => {
  const apagado = crearClienteAW({ base: 'http://127.0.0.1:5999/api/0', tiempoLimiteMs: 2000 });
  await assert.rejects(apagado.info(), (e) => e instanceof ErrorAW && e.tipo === 'sin-conexion');
});

test('un error HTTP lanza ErrorAW de tipo "http"', async () => {
  await assert.rejects(aw.eventos('bucket-que-no-existe'), (e) => e instanceof ErrorAW && e.tipo === 'http' && e.estado === 404);
});
