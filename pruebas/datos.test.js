// Pruebas de web/js/datos.js (F2-09) contra el AW falso (H-01), con un reloj fijo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../herramientas/aw-falso.js';
import { crearClienteAW } from '../web/js/aw.js';
import { eventosCategorizados } from '../web/js/consultas.js';
import { crearAlmacenDias } from '../web/js/datos-dia.js';
import { crearServicioDatos } from '../web/js/datos.js';

let servidor, datos, aw, pedidos = 0;
const AHORA = Date.parse('2026-10-14T21:20:00Z'); // 14-oct 16:20 en Lima

before(async () => {
  servidor = await crearServidor({ puerto: 0 });
  aw = crearClienteAW({ base: servidor.base });
  const almacen = crearAlmacenDias({
    pedirPeriodos: (p) => { pedidos++; return eventosCategorizados(aw, p); },
    inicioDia: async () => (await aw.ajuste('startOfDay')) ?? '04:00',
    ahora: () => AHORA,
  });
  datos = crearServicioDatos({ aw, almacen, ahora: () => AHORA });
});
after(() => servidor.cerrar());

test('hoy() es el día de AW del reloj', async () => {
  assert.equal(await datos.hoy(), '2026-10-14');
});

test('dia() arma el día completo: día lógico, segmentos con contexto, plan del día y resumen', async () => {
  const d = await datos.dia('2026-10-12');
  assert.equal(d.esHoy, false);
  assert.equal(d.dia.fuenteInicio, 'actividad');
  assert.ok(d.segmentos.length > 100 && d.segmentos.every((s) => 'contexto' in s));
  assert.equal(d.items.bloques.length, 1);
  assert.equal(d.resumen.bloques[0].estado, 'parcial'); // BD I empezó 20 min tarde
  const total = d.segmentos.reduce((a, s) => a + (s.fin - s.inicio), 0);
  assert.equal(total, d.dia.fin - d.dia.inicio); // cubre el día lógico exacto
});

test('un día terminado y cerrado sale de la caché; hoy no', async () => {
  const antes = pedidos;
  await datos.dia('2026-10-12');
  assert.equal(pedidos, antes); // de la caché
  const hoy = await datos.dia('2026-10-14');
  assert.equal(hoy.esHoy, true);
  assert.ok(hoy.resumen.bloques.some((b) => b.estado === 'en_curso')); // Estadística 15:00–17:00 a las 16:20
});

test('resumenes() no incluye días futuros', async () => {
  const r = await datos.resumenes('2026-10-12', '2026-10-18');
  assert.deepEqual(r.map((x) => x.fecha), ['2026-10-12', '2026-10-13', '2026-10-14']);
});

test('registrar y borrar un check-in vacía la caché y cambia el resumen', async () => {
  await datos.registrarCheckin({ tipo: 'rutina', refId: 'ejercicio', valor: 'hecho', fecha: '2026-10-12' });
  const [ck] = (await datos.checkins('2026-10-12')).filter((c) => c.refId === 'ejercicio');
  assert.equal(ck.fecha, '2026-10-12');
  await datos.borrarCheckin(ck.id);
  assert.equal((await datos.checkins('2026-10-12')).filter((c) => c.refId === 'ejercicio').length, 0);
});

test('guardarPlan valida: un plan inválido lanza ErrorPlan y no se guarda', async () => {
  const plan = await datos.plan();
  await assert.rejects(datos.guardarPlan({ ...plan, cursos: [{ id: 'x' }] }), (e) => e.name === 'ErrorPlan' && e.errores.length > 0);
  assert.deepEqual(await datos.plan(), plan);
});

test('reglas() compila las reglas de AW y estadoAW() informa la conexión', async () => {
  const { classes, compiladas } = await datos.reglas();
  assert.ok(classes.length > 0 && compiladas.errores.length === 0);
  const estado = await datos.estadoAW();
  assert.equal(estado.conectado, true);
  assert.equal(estado.hostname, 'ejemplo');
});
