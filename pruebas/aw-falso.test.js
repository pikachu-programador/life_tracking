// Pruebas del AW falso (herramientas/aw-falso.js, H-01): cada ruta con fetch contra el servidor arrancado
// en un puerto libre (puerto 0), la consulta canónica real y el cliente de web/js/aw.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';
import { crearServidor, leerArgumentos } from '../herramientas/aw-falso.js';
import { crearClienteAW, ErrorAW } from '../web/js/aw.js';
import { consultaCanonica, reglasParaConsulta, eventosCategorizados } from '../web/js/consultas.js';
import { datosDiaEjemplo, clasesEjemplo } from './ayudantes/dia-ejemplo.js';
import { planEjemplo } from './ayudantes/ejemplo.js';

let aw;      // { base, url, cerrar, ... }
let cliente; // crearClienteAW contra el AW falso

before(async () => {
  aw = await crearServidor({ puerto: 0 });
  cliente = crearClienteAW({ base: `http://127.0.0.1:${aw.puerto}/api/0` });
});
after(() => aw.cerrar());

/** fetch a la API; devuelve {estado, tipo, cuerpo (JSON o null)}. */
async function pedir(metodo, ruta, cuerpo) {
  const r = await fetch(aw.base + ruta, {
    method: metodo,
    headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
    redirect: 'manual',
  });
  const texto = await r.text();
  return { estado: r.status, tipo: r.headers.get('content-type'), cuerpo: texto ? JSON.parse(texto) : null };
}

/** Pedido HTTP con la ruta EXACTA (fetch normaliza "../", y aquí se quiere probar que el servidor lo frena). */
function pedirCrudo(ruta) {
  return new Promise((listo, fallo) => {
    const p = request({ host: '127.0.0.1', port: aw.puerto, path: ruta, method: 'GET' }, (r) => {
      const trozos = [];
      r.on('data', (t) => trozos.push(t));
      r.on('end', () => listo({ estado: r.statusCode, cabeceras: r.headers, cuerpo: Buffer.concat(trozos).toString('utf8') }));
    });
    p.on('error', fallo);
    p.end();
  });
}

const VENTANA = 'aw-watcher-window_ejemplo';
const DIA = '2026-10-05T09:00:00Z/2026-10-06T09:00:00Z'; // día de AW 2026-10-05 (04:00–04:00 en Lima)

// ── /info y /buckets ──

test('GET /info', async () => {
  const { estado, tipo, cuerpo } = await pedir('GET', '/info');
  assert.equal(estado, 200);
  assert.match(tipo, /application\/json/);
  assert.deepEqual(cuerpo, { hostname: 'ejemplo', version: 'v0.14.1 (aw-falso)', testing: true, device_id: 'aw-falso-ejemplo' });
});

test('GET /buckets/ (y sin barra final) lista los buckets de ejemplo con sus campos', async () => {
  const { estado, cuerpo } = await pedir('GET', '/buckets/');
  assert.equal(estado, 200);
  assert.deepEqual(Object.keys(cuerpo).sort(), [
    'aw-watcher-afk_ejemplo', 'aw-watcher-web-chrome_ejemplo', 'aw-watcher-window_ejemplo', 'rastreador-checkins_ejemplo',
  ]);
  const b = cuerpo[VENTANA];
  assert.deepEqual(Object.keys(b).sort(), ['client', 'created', 'data', 'hostname', 'id', 'last_updated', 'name', 'type']);
  assert.equal(b.type, 'currentwindow');
  assert.equal(b.hostname, 'ejemplo');
  assert.equal(cuerpo['rastreador-checkins_ejemplo'].client, 'rastreador');
  assert.deepEqual((await pedir('GET', '/buckets')).cuerpo, cuerpo);
});

test('GET /buckets/<id> y 404 con {message} si no existe', async () => {
  assert.equal((await pedir('GET', `/buckets/${VENTANA}`)).cuerpo.id, VENTANA);
  const falta = await pedir('GET', '/buckets/no-existe');
  assert.equal(falta.estado, 404);
  assert.match(falta.cuerpo.message, /no-existe/);
  assert.equal((await pedir('GET', '/buckets/no-existe/events')).estado, 404);
});

test('GET /buckets/<id>/events: solapes con [start, end], recortados, del más nuevo al más viejo, con id y limit', async () => {
  const start = '2026-10-05T12:00:00Z';
  const end = '2026-10-05T12:10:00Z';
  const { estado, cuerpo } = await pedir('GET', `/buckets/${VENTANA}/events?start=${start}&end=${end}`);
  assert.equal(estado, 200);
  assert.ok(cuerpo.length > 5);
  for (const e of cuerpo) {
    assert.ok(Number.isInteger(e.id));
    assert.match(e.timestamp, /^2026-10-05T12:\d\d:\d\d\.\d{6}\+00:00$/);
    const ini = Date.parse(e.timestamp);
    assert.ok(ini >= Date.parse(start) && ini + e.duration * 1000 <= Date.parse(end) + 1);
  }
  for (let i = 1; i < cuerpo.length; i++) assert.ok(Date.parse(cuerpo[i - 1].timestamp) >= Date.parse(cuerpo[i].timestamp));
  const dos = await pedir('GET', `/buckets/${VENTANA}/events?start=${start}&end=${end}&limit=2`);
  assert.deepEqual(dos.cuerpo, cuerpo.slice(0, 2));
  assert.equal((await pedir('GET', `/buckets/${VENTANA}/events?start=ayer`)).estado, 400);
  assert.equal((await pedir('GET', `/buckets/${VENTANA}/events?limit=dos`)).estado, 400);
  // Un evento suelto, por su id.
  assert.deepEqual((await pedir('GET', `/buckets/${VENTANA}/events/${cuerpo[0].id}`)).cuerpo.id, cuerpo[0].id);
});

test('POST /buckets/<id> crea (304 si ya existe) y DELETE lo borra', async () => {
  const id = 'rastreador-prueba_ejemplo';
  assert.equal((await pedir('POST', `/buckets/${id}`, { client: 'rastreador', type: 'rastreador.prueba', hostname: 'ejemplo' })).estado, 200);
  assert.equal((await pedir('POST', `/buckets/${id}`, { client: 'rastreador', type: 'rastreador.prueba', hostname: 'ejemplo' })).estado, 304);
  const b = (await pedir('GET', `/buckets/${id}`)).cuerpo;
  assert.equal(b.type, 'rastreador.prueba');
  assert.equal(b.last_updated, b.created); // sin eventos
  assert.equal((await pedir('DELETE', `/buckets/${id}?force=1`)).estado, 200);
  assert.equal((await pedir('GET', `/buckets/${id}`)).estado, 404);
  assert.equal((await pedir('DELETE', `/buckets/${id}?force=1`)).estado, 404);
});

test('POST /buckets/<id>/events inserta uno (lo devuelve con id) o varios (null), y DELETE de un evento', async () => {
  const id = 'rastreador-eventos_ejemplo';
  await pedir('POST', `/buckets/${id}`, { client: 'rastreador', type: 'rastreador.prueba', hostname: 'ejemplo' });
  const uno = await pedir('POST', `/buckets/${id}/events`, { timestamp: '2026-10-05T12:00:00Z', duration: 60, data: { n: 1 } });
  assert.equal(uno.estado, 200);
  assert.ok(Number.isInteger(uno.cuerpo.id));
  assert.deepEqual({ ...uno.cuerpo, id: 0 }, { id: 0, timestamp: '2026-10-05T12:00:00.000000+00:00', duration: 60, data: { n: 1 } });
  const varios = await pedir('POST', `/buckets/${id}/events`, [
    { timestamp: '2026-10-05T12:05:00Z', duration: 1.5, data: { n: 2 } },
    { timestamp: '2026-10-05T11:00:00Z', duration: 0, data: { n: 3 } },
  ]);
  assert.equal(varios.estado, 200);
  assert.equal(varios.cuerpo, null);
  const todos = (await pedir('GET', `/buckets/${id}/events`)).cuerpo;
  assert.deepEqual(todos.map((e) => e.data.n), [2, 1, 3]);

  assert.deepEqual((await pedir('DELETE', `/buckets/${id}/events/${uno.cuerpo.id}`)).cuerpo, { success: true });
  assert.deepEqual((await pedir('DELETE', `/buckets/${id}/events/${uno.cuerpo.id}`)).cuerpo, { success: false });
  assert.deepEqual((await pedir('GET', `/buckets/${id}/events`)).cuerpo.map((e) => e.data.n), [2, 3]);

  assert.equal((await pedir('POST', `/buckets/${id}/events`, { timestamp: 'ayer', data: {} })).estado, 400);
  assert.equal((await pedir('POST', `/buckets/${id}/events`, '{no es json')).estado, 400);
  assert.equal((await pedir('POST', '/buckets/no-existe/events', { timestamp: '2026-10-05T12:00:00Z' })).estado, 404);
  await pedir('DELETE', `/buckets/${id}`);
});

test('POST /buckets/<id>/heartbeat alarga si los datos son iguales y llega dentro de pulsetime', async () => {
  const id = 'rastreador-latido_ejemplo';
  await pedir('POST', `/buckets/${id}`, { client: 'rastreador', type: 'rastreador.prueba', hostname: 'ejemplo' });
  const latido = (t, data, pulsetime = 60) => pedir('POST', `/buckets/${id}/heartbeat?pulsetime=${pulsetime}`, { timestamp: t, duration: 0, data });

  const a = await latido('2026-10-05T12:00:00Z', { estado: 'vivo' });
  const b = await latido('2026-10-05T12:00:30Z', { estado: 'vivo' });
  assert.equal(b.cuerpo.id, a.cuerpo.id);
  assert.equal(b.cuerpo.duration, 30);
  // Uno que termina antes no lo acorta.
  assert.equal((await latido('2026-10-05T12:00:10Z', { estado: 'vivo' })).cuerpo.duration, 30);
  // Datos distintos: evento nuevo. Muy tarde (más de pulsetime después del fin): evento nuevo.
  const c = await latido('2026-10-05T12:00:40Z', { estado: 'otro' });
  assert.notEqual(c.cuerpo.id, a.cuerpo.id);
  const d = await latido('2026-10-05T12:05:00Z', { estado: 'otro' }, 10);
  assert.notEqual(d.cuerpo.id, c.cuerpo.id);
  assert.equal((await pedir('GET', `/buckets/${id}/events`)).cuerpo.length, 3);

  const sinPulso = await pedir('POST', `/buckets/${id}/heartbeat`, { timestamp: '2026-10-05T12:06:00Z', data: {} });
  assert.equal(sinPulso.estado, 400);
  assert.match(sinPulso.cuerpo.message, /pulsetime/);
  await pedir('DELETE', `/buckets/${id}`);
});

// ── /settings ──

test('GET /settings (y /settings/) trae classes, startOfDay y rastreador-plan; GET de una clave', async () => {
  const { estado, cuerpo } = await pedir('GET', '/settings');
  assert.equal(estado, 200);
  assert.deepEqual(cuerpo.classes, clasesEjemplo());
  assert.equal(cuerpo.startOfDay, '04:00');
  assert.deepEqual(cuerpo['rastreador-plan'], planEjemplo()); // sin el campo "nota"
  assert.equal(cuerpo['rastreador-plan'].nota, undefined);
  assert.deepEqual((await pedir('GET', '/settings/')).cuerpo, cuerpo);
  assert.equal((await pedir('GET', '/settings/startOfDay')).cuerpo, '04:00');
  const falta = await pedir('GET', '/settings/no-existe');
  assert.equal(falta.estado, 200);
  assert.equal(falta.cuerpo, null);
});

test('POST /settings/<clave> guarda solo en memoria; DELETE no está permitido (405, como AW)', async () => {
  const valor = { prueba: true, lista: ['a', 'b'], n: 7 };
  const guardado = await pedir('POST', '/settings/rastreador-prueba', valor);
  assert.equal(guardado.estado, 200);
  assert.deepEqual((await pedir('GET', '/settings/rastreador-prueba')).cuerpo, valor);
  assert.equal((await pedir('DELETE', '/settings/rastreador-prueba')).estado, 405);
  // Otro AW falso arranca limpio: lo guardado no se escribió en disco.
  const otro = await crearServidor({ puerto: 0 });
  try {
    const r = await fetch(`${otro.base}/settings/rastreador-prueba`);
    assert.equal(await r.json(), null);
  } finally {
    await otro.cerrar();
  }
});

// ── /query/ ──

const consultaDelEjemplo = () => consultaCanonica({
  bucketVentana: VENTANA,
  bucketAfk: 'aw-watcher-afk_ejemplo',
  navegadores: [{ navegador: 'chrome', id: 'aw-watcher-web-chrome_ejemplo' }],
  reglas: reglasParaConsulta(clasesEjemplo()),
});

/** ¿Los eventos (ordenados) no se solapan? Tolera 1 ms por redondeo. */
function sinSolapes(eventos) {
  const tramos = eventos.map((e) => [Date.parse(e.timestamp), Date.parse(e.timestamp) + e.duration * 1000]).sort((a, b) => a[0] - b[0]);
  return tramos.every((t, i) => i === 0 || t[0] >= tramos[i - 1][1] - 1);
}

test('POST /query/ resuelve la consulta canónica de un día en menos de 300 ms', async () => {
  const query = consultaDelEjemplo();
  await pedir('POST', '/query/', { timeperiods: [DIA], query }); // la primera compila las regex (V8)
  const t0 = performance.now();
  const { estado, cuerpo } = await pedir('POST', '/query/', { timeperiods: [DIA], query });
  const ms = performance.now() - t0;
  assert.equal(estado, 200);
  assert.ok(ms < 300, `tardó ${ms.toFixed(0)} ms`);

  assert.equal(cuerpo.length, 1);
  const { eventos, navegador, no_afk: noAfk, afk } = cuerpo[0];
  assert.deepEqual(Object.keys(cuerpo[0]), ['eventos', 'navegador', 'no_afk', 'afk']);
  assert.ok(eventos.length > 100 && navegador.length > 50 && noAfk.length > 0);

  assert.ok(sinSolapes(eventos), 'los eventos de ventana no se solapan');
  assert.ok(eventos.every((e) => Array.isArray(e.data.$category) && e.data.$category.length > 0), 'todos tienen $category');
  assert.ok(navegador.every((e) => typeof e.data.$domain === 'string' && typeof e.data.url === 'string'), 'el navegador trae $domain');
  assert.ok(navegador.some((e) => e.data.$domain === 'youtube.com'));
  assert.ok(sinSolapes([...noAfk, ...afk]), 'no_afk y afk no se solapan entre sí');
  assert.ok(afk.every((e) => e.data.status === 'afk'));
  // Todo dentro del periodo pedido.
  const [ini, fin] = DIA.split('/').map(Date.parse);
  for (const e of [...eventos, ...navegador, ...noAfk, ...afk]) {
    assert.ok(Date.parse(e.timestamp) >= ini && Date.parse(e.timestamp) + e.duration * 1000 <= fin + 1);
  }
  // Es lo mismo que da el ayudante de las pruebas del motor.
  assert.deepEqual(cuerpo[0], datosDiaEjemplo('2026-10-05'));
});

test('POST /query/ con el audio: la clase grabada sonando sin teclado cuenta como actividad (10-10, 16:00–17:30)', async () => {
  const { cuerpo } = await pedir('POST', '/query/', { timeperiods: ['2026-10-10T09:00:00Z/2026-10-11T09:00:00Z'], query: consultaDelEjemplo() });
  const [{ eventos, afk }] = cuerpo;
  const enClase = (e) => Date.parse(e.timestamp) >= Date.parse('2026-10-10T21:00:00Z') && Date.parse(e.timestamp) < Date.parse('2026-10-10T22:30:00Z');
  const minutos = eventos.filter(enClase).reduce((s, e) => s + e.duration, 0) / 60;
  assert.ok(Math.abs(minutos - 90) < 1, `${minutos} min`);
  assert.ok(eventos.filter(enClase).every((e) => e.data.$category.join('/') === 'Estudio/Matemáticas'));
  assert.ok(afk.some(enClase)); // y AFK también lo registra (sin teclado)
});

test('POST /query/ con otra consulta responde 400 con un mensaje claro', async () => {
  const r = await pedir('POST', '/query/', { timeperiods: [DIA], query: ['events = query_bucket("aw-watcher-window_ejemplo");', 'RETURN = events;'] });
  assert.equal(r.estado, 400);
  assert.match(r.cuerpo.message, /el AW falso solo entiende la consulta canónica de web\/js\/consultas\.js/);
  assert.equal((await pedir('POST', '/query', { timeperiods: [DIA] })).estado, 400);
  assert.equal((await pedir('GET', '/query/')).estado, 405);
});

// ── Rutas desconocidas ──

test('ruta desconocida → 404 JSON; método no permitido → 405', async () => {
  const r = await pedir('GET', '/no/existe');
  assert.equal(r.estado, 404);
  assert.match(r.cuerpo.message, /No existe la ruta/);
  assert.equal((await pedir('POST', '/info')).estado, 405);
  assert.equal((await pedir('PUT', '/buckets/')).estado, 405);
  assert.equal((await fetch(`${aw.url}/otra/cosa`)).status, 404);
});

// ── Estáticos ──

test('GET /pages/rastreador/ sirve web/index.html; / y /pages/rastreador redirigen (conservando ?ahora=)', async () => {
  const r = await fetch(`${aw.url}/pages/rastreador/`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/html/);
  assert.equal(await r.text(), readFileSync(new URL('../web/index.html', import.meta.url), 'utf8'));

  const raiz = await fetch(`${aw.url}/?ahora=2026-10-14T16:20`, { redirect: 'manual' });
  assert.equal(raiz.status, 302);
  assert.equal(raiz.headers.get('location'), '/pages/rastreador/?ahora=2026-10-14T16:20');
  const sinBarra = await fetch(`${aw.url}/pages/rastreador`, { redirect: 'manual' });
  assert.equal(sinBarra.headers.get('location'), '/pages/rastreador/');
});

test('los estáticos salen con el tipo MIME correcto (los módulos ES necesitan text/javascript)', async () => {
  const tipos = {
    'js/app.js': /^text\/javascript/,
    'motor/tipos.js': /^text\/javascript/,
    'css/tokens.css': /^text\/css/,
    'lib/LICENSE-echarts.txt': /^text\/plain/,
    'index.html': /^text\/html/,
  };
  for (const [ruta, tipo] of Object.entries(tipos)) {
    const r = await fetch(`${aw.url}/pages/rastreador/${ruta}`);
    assert.equal(r.status, 200, ruta);
    assert.match(r.headers.get('content-type'), tipo, ruta);
    await r.arrayBuffer();
  }
  assert.equal((await fetch(`${aw.url}/pages/rastreador/no-existe.js`)).status, 404);
  assert.equal((await fetch(`${aw.url}/pages/rastreador/js/app.js`, { method: 'POST' })).status, 405);
});

test('los estáticos no dejan salir de web/ (../, codificado, barras invertidas)', async () => {
  for (const ruta of [
    '/pages/rastreador/../package.json',
    '/pages/rastreador/%2e%2e/package.json',
    '/pages/rastreador/%2e%2e%2fpackage.json',
    '/pages/rastreador/..%5cpackage.json',
    '/pages/rastreador/js/../../package.json',
    '/pages/rastreador/%2e%2e%2f%2e%2e%2fCLAUDE.md',
    '/pages/rastreador/%00',
    '/pages/rastreador/%E0%A4%A',
  ]) {
    const r = await pedirCrudo(ruta);
    assert.equal(r.estado, 404, ruta);
    assert.ok(!r.cuerpo.includes('"name"'), ruta); // nunca el contenido de package.json
  }
});

// ── El cliente del dashboard contra el AW falso ──

test('crearClienteAW (web/js/aw.js) funciona contra el AW falso', async () => {
  const info = await cliente.info();
  assert.equal(info.hostname, 'ejemplo');
  assert.ok(VENTANA in await cliente.buckets());
  assert.equal(await cliente.ajuste('startOfDay'), '04:00');
  assert.ok('classes' in await cliente.ajustes());

  await cliente.guardarAjuste('rastreador-niveles', { version: 1, cambios: [] });
  assert.deepEqual(await cliente.ajuste('rastreador-niveles'), { version: 1, cambios: [] });

  const bucket = 'rastreador-cliente_ejemplo';
  await cliente.crearBucket(bucket, { tipo: 'rastreador.prueba', hostname: 'ejemplo' });
  await cliente.crearBucket(bucket, { tipo: 'rastreador.prueba', hostname: 'ejemplo' }); // 304: no lanza
  const t0 = new Date('2026-10-05T12:00:00Z');
  await cliente.insertarEventos(bucket, [
    { timestamp: t0, duration: 60, data: { n: 1 } },
    { timestamp: new Date(t0.getTime() + 120_000), duration: 30, data: { n: 2 } },
  ]);
  const todos = await cliente.eventos(bucket);
  assert.deepEqual(todos.map((e) => e.data.n), [2, 1]);
  assert.deepEqual((await cliente.eventos(bucket, { inicio: new Date(t0.getTime() + 90_000) })).map((e) => e.data.n), [2]);
  assert.equal((await cliente.eventos(bucket, { limite: 1 })).length, 1);
  await cliente.borrarEvento(bucket, todos[0].id);
  assert.deepEqual((await cliente.eventos(bucket)).map((e) => e.data.n), [1]);

  await cliente.latido(bucket, { timestamp: new Date(t0.getTime() + 300_000), data: { estado: 'vivo' } }, 60);
  await cliente.latido(bucket, { timestamp: new Date(t0.getTime() + 310_000), data: { estado: 'vivo' } }, 60);
  const vivos = (await cliente.eventos(bucket)).filter((e) => e.data.estado === 'vivo');
  assert.equal(vivos.length, 1);
  assert.equal(vivos[0].duration, 10);

  const [resultado] = await cliente.consulta([[new Date('2026-10-05T09:00:00Z'), new Date('2026-10-06T09:00:00Z')]], consultaDelEjemplo());
  assert.ok(resultado.eventos.length > 100);
  await assert.rejects(cliente.consulta([[t0, t0]], ['RETURN = 1;']), (e) => e instanceof ErrorAW && e.estado === 400);
  await assert.rejects(cliente.eventos('no-existe'), (e) => e instanceof ErrorAW && e.estado === 404);

  await cliente.borrarBucket(bucket);
  assert.ok(!(bucket in await cliente.buckets()));
});

test('eventosCategorizados (web/js/consultas.js) arma la consulta con los datos del AW falso y la resuelve', async () => {
  const dias = [[new Date('2026-10-05T09:00:00Z'), new Date('2026-10-06T09:00:00Z')], [new Date('2026-10-13T09:00:00Z'), new Date('2026-10-14T09:00:00Z')]];
  const [lunes, sinDatos] = await eventosCategorizados(cliente, dias);
  assert.deepEqual(lunes, datosDiaEjemplo('2026-10-05'));
  assert.deepEqual(sinDatos, { eventos: [], navegador: [], no_afk: [], afk: [] });
});

// ── Arranque ──

test('leerArgumentos lee --puerto, --host y --datos', () => {
  assert.deepEqual(leerArgumentos([]), { puerto: 5600, host: '127.0.0.1' });
  const o = leerArgumentos(['--puerto', '5655', '--host', '0.0.0.0']);
  assert.equal(o.puerto, 5655);
  assert.equal(o.host, '0.0.0.0');
  assert.match(leerArgumentos(['--datos', 'datos-ejemplo']).carpetaDatos, /datos-ejemplo$/);
  assert.throws(() => leerArgumentos(['--puerto', 'abc']), /Puerto inválido/);
  assert.throws(() => leerArgumentos(['--puerto', '70000']), /Puerto inválido/);
  assert.throws(() => leerArgumentos(['--otra']), /desconocido/);
});

test('crearServidor falla con EADDRINUSE si el puerto está ocupado', async () => {
  await assert.rejects(crearServidor({ puerto: aw.puerto }), (e) => e.code === 'EADDRINUSE');
});
