// Pruebas de web/js/periodo.js (V-04): la parte pura, y leer/guardar con un localStorage y una dirección falsos.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAVE_PERIODO, contieneHoy, periodosIguales, limitarAHoy, periodoConHoy, siguienteHastaHoy, cambiarTipo,
  periodoDeParametros, aParametros, textoGuardado, periodoGuardado, resolverPeriodo,
  leerPeriodo, guardarPeriodo, irAPeriodo,
} from '../web/js/periodo.js';

const HOY = '2026-11-04'; // miércoles
const p = (tipo, desde, hasta = desde) => ({ tipo, desde, hasta });
const params = (texto) => new URLSearchParams(texto);

// localStorage y location falsos (en Node no existen). Se quitan después de cada prueba.
function localStorageFalso(inicial = {}) {
  const datos = { ...inicial };
  return {
    datos,
    getItem: (k) => (k in datos ? datos[k] : null),
    setItem: (k, v) => { datos[k] = String(v); },
    removeItem: (k) => { delete datos[k]; },
  };
}
afterEach(() => {
  delete globalThis.localStorage;
  delete globalThis.location;
});

test('contieneHoy y periodosIguales', () => {
  assert.ok(contieneHoy(p('semana', '2026-11-02', '2026-11-08'), HOY));
  assert.ok(contieneHoy(p('dia', HOY), HOY));
  assert.ok(!contieneHoy(p('dia', '2026-11-03'), HOY));
  assert.ok(periodosIguales(p('dia', HOY), p('dia', HOY)));
  assert.ok(!periodosIguales(p('dia', HOY), p('rango', HOY)));
  assert.ok(!periodosIguales(null, p('dia', HOY)));
});

test('limitarAHoy: nunca empieza después de hoy; semana y mes en curso se dejan', () => {
  assert.deepEqual(limitarAHoy(p('dia', '2026-11-10'), HOY), p('dia', HOY));
  assert.deepEqual(limitarAHoy(p('semana', '2026-11-09', '2026-11-15'), HOY), p('semana', '2026-11-02', '2026-11-08'));
  assert.deepEqual(limitarAHoy(p('mes', '2026-12-01', '2026-12-31'), HOY), p('mes', '2026-11-01', '2026-11-30'));
  // En curso: termina después de hoy y se deja así.
  assert.deepEqual(limitarAHoy(p('semana', '2026-11-02', '2026-11-08'), HOY), p('semana', '2026-11-02', '2026-11-08'));
  assert.deepEqual(limitarAHoy(p('mes', '2026-11-01', '2026-11-30'), HOY), p('mes', '2026-11-01', '2026-11-30'));
  // Rango: el fin no pasa de hoy; si empezaba después, termina hoy con el mismo largo.
  assert.deepEqual(limitarAHoy(p('rango', '2026-10-30', '2026-11-10'), HOY), p('rango', '2026-10-30', HOY));
  assert.deepEqual(limitarAHoy(p('rango', '2026-11-10', '2026-11-12'), HOY), p('rango', '2026-11-02', HOY));
  // No cambia el objeto que recibe.
  const original = p('dia', '2026-11-10');
  limitarAHoy(original, HOY);
  assert.deepEqual(original, p('dia', '2026-11-10'));
});

test('periodoConHoy (botón "Hoy")', () => {
  assert.deepEqual(periodoConHoy(p('dia', '2026-10-05'), HOY), p('dia', HOY));
  assert.deepEqual(periodoConHoy(p('semana', '2026-10-05', '2026-10-11'), HOY), p('semana', '2026-11-02', '2026-11-08'));
  assert.deepEqual(periodoConHoy(p('mes', '2026-09-01', '2026-09-30'), HOY), p('mes', '2026-11-01', '2026-11-30'));
  // Rango de 10 días → los últimos 10 días.
  assert.deepEqual(periodoConHoy(p('rango', '2026-10-01', '2026-10-10'), HOY), p('rango', '2026-10-26', HOY));
});

test('siguienteHastaHoy: null si el siguiente empezaría después de hoy', () => {
  assert.equal(siguienteHastaHoy(p('dia', HOY), HOY), null);
  assert.deepEqual(siguienteHastaHoy(p('dia', '2026-11-03'), HOY), p('dia', HOY));
  assert.equal(siguienteHastaHoy(p('semana', '2026-11-02', '2026-11-08'), HOY), null);
  // La semana pasada → esta semana (aunque termine después de hoy).
  assert.deepEqual(siguienteHastaHoy(p('semana', '2026-10-26', '2026-11-01'), HOY), p('semana', '2026-11-02', '2026-11-08'));
  // Mes: octubre → noviembre (en curso); noviembre → null.
  assert.deepEqual(siguienteHastaHoy(p('mes', '2026-10-01', '2026-10-31'), HOY), p('mes', '2026-11-01', '2026-11-30'));
  assert.equal(siguienteHastaHoy(p('mes', '2026-11-01', '2026-11-30'), HOY), null);
  // Rango: se corre su largo, pero sin pasar de hoy.
  assert.deepEqual(siguienteHastaHoy(p('rango', '2026-10-20', '2026-10-26'), HOY), p('rango', '2026-10-27', '2026-11-02'));
  assert.deepEqual(siguienteHastaHoy(p('rango', '2026-10-25', '2026-10-31'), HOY), p('rango', '2026-10-29', HOY));
  assert.equal(siguienteHastaHoy(p('rango', '2026-10-29', HOY), HOY), null);
});

test('cambiarTipo: conserva la fecha de referencia', () => {
  // Período en curso → el nuevo tipo con hoy.
  assert.deepEqual(cambiarTipo(p('semana', '2026-11-02', '2026-11-08'), 'mes', HOY), p('mes', '2026-11-01', '2026-11-30'));
  assert.deepEqual(cambiarTipo(p('mes', '2026-11-01', '2026-11-30'), 'dia', HOY), p('dia', HOY));
  // Período pasado → desde su primer día.
  assert.deepEqual(cambiarTipo(p('dia', '2026-10-14'), 'semana', HOY), p('semana', '2026-10-12', '2026-10-18'));
  assert.deepEqual(cambiarTipo(p('semana', '2026-10-12', '2026-10-18'), 'dia', HOY), p('dia', '2026-10-12'));
  assert.deepEqual(cambiarTipo(p('semana', '2026-09-28', '2026-10-04'), 'mes', HOY), p('mes', '2026-09-01', '2026-09-30'));
  // A rango: las mismas fechas, sin pasar de hoy.
  assert.deepEqual(cambiarTipo(p('semana', '2026-11-02', '2026-11-08'), 'rango', HOY), p('rango', '2026-11-02', HOY));
  assert.deepEqual(cambiarTipo(p('mes', '2026-10-01', '2026-10-31'), 'rango', HOY), p('rango', '2026-10-01', '2026-10-31'));
  // De rango a semana: la semana de su primer día (o la actual si incluye hoy).
  assert.deepEqual(cambiarTipo(p('rango', '2026-10-14', '2026-10-20'), 'semana', HOY), p('semana', '2026-10-12', '2026-10-18'));
  assert.deepEqual(cambiarTipo(p('rango', '2026-10-29', HOY), 'semana', HOY), p('semana', '2026-11-02', '2026-11-08'));
  // Mismo tipo → una copia igual.
  assert.deepEqual(cambiarTipo(p('dia', '2026-10-14'), 'dia', HOY), p('dia', '2026-10-14'));
});

test('periodoDeParametros: día, semana, mes y rango', () => {
  const o = { hoy: HOY };
  assert.deepEqual(periodoDeParametros(params('periodo=dia&fecha=2026-10-14'), o), p('dia', '2026-10-14'));
  // "fecha" puede ser cualquier día del período.
  assert.deepEqual(periodoDeParametros(params('periodo=semana&fecha=2026-10-14'), o), p('semana', '2026-10-12', '2026-10-18'));
  assert.deepEqual(periodoDeParametros(params('periodo=mes&fecha=2026-02-17'), o), p('mes', '2026-02-01', '2026-02-28'));
  assert.deepEqual(periodoDeParametros(params('periodo=rango&desde=2026-10-01&hasta=2026-10-10'), o), p('rango', '2026-10-01', '2026-10-10'));
  // Rango al revés → se ordena.
  assert.deepEqual(periodoDeParametros(params('periodo=rango&desde=2026-10-10&hasta=2026-10-01'), o), p('rango', '2026-10-01', '2026-10-10'));
  // Sin fecha → el que contiene hoy.
  assert.deepEqual(periodoDeParametros(params('periodo=mes'), o), p('mes', '2026-11-01', '2026-11-30'));
  // También acepta un objeto común.
  assert.deepEqual(periodoDeParametros({ periodo: 'dia', fecha: '2026-10-14' }, o), p('dia', '2026-10-14'));
});

test('periodoDeParametros: compatibilidad con F2-08 y tipos de la vista', () => {
  // Solo "fecha" (como #/hoy?fecha=…) → el tipo por defecto de la vista.
  assert.deepEqual(periodoDeParametros(params('fecha=2026-10-14'), { hoy: HOY, tipoPorDefecto: 'dia' }), p('dia', '2026-10-14'));
  assert.deepEqual(periodoDeParametros(params('fecha=2026-10-14'), { hoy: HOY }), p('semana', '2026-10-12', '2026-10-18'));
  // Solo "desde" y "hasta" (como #/horas?desde=…&hasta=…) → rango.
  assert.deepEqual(periodoDeParametros(params('desde=2026-10-01&hasta=2026-10-07'), { hoy: HOY }), p('rango', '2026-10-01', '2026-10-07'));
  // La vista no acepta el tipo pedido → su tipo por defecto, con la misma fecha.
  assert.deepEqual(
    periodoDeParametros(params('periodo=semana&fecha=2026-10-14'), { hoy: HOY, tipos: ['dia'], tipoPorDefecto: 'dia' }),
    p('dia', '2026-10-14'));
  // Rango sin fechas válidas → 7 días que terminan en la fecha (o en hoy).
  assert.deepEqual(periodoDeParametros(params('periodo=rango'), { hoy: HOY }), p('rango', '2026-10-29', HOY));
});

test('periodoDeParametros: null si no hay nada válido; futuro → limitado a hoy', () => {
  assert.equal(periodoDeParametros(params(''), { hoy: HOY }), null);
  assert.equal(periodoDeParametros(null, { hoy: HOY }), null);
  assert.equal(periodoDeParametros(params('periodo=anio&fecha=31-10-2026'), { hoy: HOY }), null);
  assert.equal(periodoDeParametros(params('fecha=2026-02-30&nivel=total'), { hoy: HOY }), null);
  // Fecha inválida pero tipo válido → el que contiene hoy.
  assert.deepEqual(periodoDeParametros(params('periodo=dia&fecha=basura'), { hoy: HOY }), p('dia', HOY));
  // Futuro.
  assert.deepEqual(periodoDeParametros(params('periodo=dia&fecha=2027-01-01'), { hoy: HOY }), p('dia', HOY));
  assert.deepEqual(periodoDeParametros(params('periodo=rango&desde=2026-11-01&hasta=2026-11-30'), { hoy: HOY }), p('rango', '2026-11-01', HOY));
});

test('aParametros: lo que va en la dirección', () => {
  assert.deepEqual(aParametros(p('dia', '2026-10-14')), { periodo: 'dia', fecha: '2026-10-14' });
  assert.deepEqual(aParametros(p('semana', '2026-10-12', '2026-10-18')), { periodo: 'semana', fecha: '2026-10-12' });
  assert.deepEqual(aParametros(p('mes', '2026-10-01', '2026-10-31')), { periodo: 'mes', fecha: '2026-10-01' });
  assert.deepEqual(aParametros(p('rango', '2026-10-01', '2026-10-10')), { periodo: 'rango', desde: '2026-10-01', hasta: '2026-10-10' });
  // Con hoy: el período en curso va sin fecha (la dirección significa "el actual").
  assert.deepEqual(aParametros(p('semana', '2026-11-02', '2026-11-08'), { hoy: HOY }), { periodo: 'semana' });
  assert.deepEqual(aParametros(p('dia', '2026-10-14'), { hoy: HOY }), { periodo: 'dia', fecha: '2026-10-14' });
  assert.deepEqual(aParametros(p('rango', '2026-10-29', HOY), { hoy: HOY }), { periodo: 'rango', desde: '2026-10-29', hasta: HOY });
});

test('aParametros y periodoDeParametros van y vuelven', () => {
  const casos = [p('dia', '2026-10-14'), p('semana', '2026-10-12', '2026-10-18'), p('mes', '2026-09-01', '2026-09-30'),
    p('rango', '2026-09-20', '2026-10-03'), p('semana', '2026-11-02', '2026-11-08')];
  for (const caso of casos) {
    const ida = new URLSearchParams(aParametros(caso, { hoy: HOY }));
    assert.deepEqual(periodoDeParametros(ida, { hoy: HOY }), caso, ida.toString());
  }
});

test('textoGuardado y periodoGuardado', () => {
  // Período pasado: se guardan sus fechas.
  const pasado = textoGuardado(p('semana', '2026-10-12', '2026-10-18'), HOY);
  assert.deepEqual(JSON.parse(pasado), { tipo: 'semana', desde: '2026-10-12', hasta: '2026-10-18' });
  assert.deepEqual(periodoGuardado(pasado, { hoy: HOY }), p('semana', '2026-10-12', '2026-10-18'));
  // Período en curso: "el actual"; otro día vuelve como el período actual de ese día.
  const actual = textoGuardado(p('semana', '2026-11-02', '2026-11-08'), HOY);
  assert.deepEqual(JSON.parse(actual), { tipo: 'semana', actual: true });
  assert.deepEqual(periodoGuardado(actual, { hoy: '2026-11-12' }), p('semana', '2026-11-09', '2026-11-15'));
  const rango = textoGuardado(p('rango', '2026-10-29', HOY), HOY);
  assert.deepEqual(JSON.parse(rango), { tipo: 'rango', actual: true, dias: 7 });
  assert.deepEqual(periodoGuardado(rango, { hoy: '2026-11-10' }), p('rango', '2026-11-04', '2026-11-10'));
  // Sin hoy: siempre las fechas.
  assert.deepEqual(JSON.parse(textoGuardado(p('dia', HOY))), { tipo: 'dia', desde: HOY, hasta: HOY });
});

test('periodoGuardado: dañado, tipo no aceptado o futuro', () => {
  assert.equal(periodoGuardado(null, { hoy: HOY }), null);
  assert.equal(periodoGuardado('{no es json', { hoy: HOY }), null);
  assert.equal(periodoGuardado('"semana"', { hoy: HOY }), null);
  assert.equal(periodoGuardado('{"tipo":"anio","actual":true}', { hoy: HOY }), null);
  assert.equal(periodoGuardado('{"tipo":"dia","desde":"2026-13-01"}', { hoy: HOY }), null);
  assert.equal(periodoGuardado('{"tipo":"rango","desde":"2026-10-01"}', { hoy: HOY }), null);
  // La vista no acepta ese tipo → null (resolverPeriodo usará el tipo por defecto).
  assert.equal(periodoGuardado('{"tipo":"semana","actual":true}', { hoy: HOY, tipos: ['dia'] }), null);
  // Guardado en el futuro (reloj de prueba, H-02) → limitado a hoy.
  assert.deepEqual(periodoGuardado('{"tipo":"dia","desde":"2026-12-01","hasta":"2026-12-01"}', { hoy: HOY }), p('dia', HOY));
  // Rango "actual" sin largo válido → 7 días.
  assert.deepEqual(periodoGuardado('{"tipo":"rango","actual":true,"dias":-3}', { hoy: HOY }), p('rango', '2026-10-29', HOY));
});

test('resolverPeriodo: dirección → guardado → por defecto', () => {
  const guardado = '{"tipo":"mes","desde":"2026-09-01","hasta":"2026-09-30"}';
  // La dirección manda.
  assert.deepEqual(resolverPeriodo(params('periodo=dia&fecha=2026-10-14'), { hoy: HOY, guardado }), p('dia', '2026-10-14'));
  // Sin dirección: lo guardado.
  assert.deepEqual(resolverPeriodo(params(''), { hoy: HOY, guardado }), p('mes', '2026-09-01', '2026-09-30'));
  // Sin nada: el tipo por defecto (semana) con hoy.
  assert.deepEqual(resolverPeriodo(null, { hoy: HOY }), p('semana', '2026-11-02', '2026-11-08'));
  assert.deepEqual(resolverPeriodo(null, { hoy: HOY, tipoPorDefecto: 'rango' }), p('rango', '2026-10-29', HOY));
  // La vista no acepta lo guardado → su tipo por defecto con hoy.
  assert.deepEqual(resolverPeriodo(null, { hoy: HOY, guardado, tipos: ['dia'], tipoPorDefecto: 'dia' }), p('dia', HOY));
  // Tipo por defecto que la vista no acepta → el primero que acepta.
  assert.deepEqual(resolverPeriodo(null, { hoy: HOY, tipos: ['mes', 'rango'] }), p('mes', '2026-11-01', '2026-11-30'));
  // Lista de tipos vacía o inválida → todos.
  assert.deepEqual(resolverPeriodo(null, { hoy: HOY, tipos: [] }), p('semana', '2026-11-02', '2026-11-08'));
});

test('leerPeriodo y guardarPeriodo sin localStorage (Node, modo privado)', () => {
  assert.equal(typeof globalThis.localStorage, 'undefined');
  assert.doesNotThrow(() => guardarPeriodo(p('dia', HOY), { hoy: HOY }));
  assert.deepEqual(leerPeriodo(params(''), { hoy: HOY }), p('semana', '2026-11-02', '2026-11-08'));
  // Un localStorage que falla (por ejemplo, sin permiso) tampoco rompe nada.
  globalThis.localStorage = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  assert.doesNotThrow(() => guardarPeriodo(p('dia', HOY)));
  assert.deepEqual(leerPeriodo(params(''), { hoy: HOY, tipoPorDefecto: 'mes' }), p('mes', '2026-11-01', '2026-11-30'));
});

test('leerPeriodo: se mantiene al pasar a otra vista', () => {
  globalThis.localStorage = localStorageFalso();
  // En Resumen se eligió una semana pasada (llega por la dirección y queda guardada).
  assert.deepEqual(leerPeriodo(params('periodo=semana&fecha=2026-10-12'), { hoy: HOY }), p('semana', '2026-10-12', '2026-10-18'));
  assert.ok(globalThis.localStorage.datos[CLAVE_PERIODO]);
  // En otra vista, desde el menú (sin parámetros): la misma semana.
  assert.deepEqual(leerPeriodo(params(''), { hoy: HOY, tipoPorDefecto: 'mes' }), p('semana', '2026-10-12', '2026-10-18'));
  // Una vista que solo acepta días: no la puede mostrar → su tipo por defecto con hoy, y no pisa lo guardado.
  assert.deepEqual(leerPeriodo(params(''), { hoy: HOY, tipos: ['dia'], tipoPorDefecto: 'dia' }), p('dia', HOY));
  assert.deepEqual(leerPeriodo(params(''), { hoy: HOY }), p('semana', '2026-10-12', '2026-10-18'));
});

test('irAPeriodo: guarda, pone la dirección y conserva los demás parámetros', () => {
  globalThis.localStorage = localStorageFalso();
  globalThis.location = { hash: '#/simulador?nivel=friccion&fecha=2026-10-01' };
  irAPeriodo(p('dia', '2026-10-14'), { hoy: HOY, parametros: params('nivel=friccion&fecha=2026-10-01') });
  assert.equal(globalThis.location.hash, '#/simulador?nivel=friccion&periodo=dia&fecha=2026-10-14');
  assert.deepEqual(JSON.parse(globalThis.localStorage.datos[CLAVE_PERIODO]), { tipo: 'dia', desde: '2026-10-14', hasta: '2026-10-14' });
  // Período en curso → sin fecha en la dirección.
  globalThis.location = { hash: '#/resumen' };
  irAPeriodo(p('mes', '2026-11-01', '2026-11-30'), { hoy: HOY });
  assert.equal(globalThis.location.hash, '#/resumen?periodo=mes');
});
