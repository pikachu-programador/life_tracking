// Pruebas de web/motor/niveles.js: ajuste rastreador-niveles, configuración vigente y asimetría (§11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NIVELES_INICIALES, configuracionVigente, tipoDeCambio, proponerCambio, cambiosPendientes, nivelDeBloque,
} from '../web/motor/niveles.js';

const HOY = '2026-10-06';
const MANANA = '2026-10-07';
const sumarDias = (fecha, n) => (n === 1 && fecha === HOY ? MANANA : fecha);
const AHORA = Date.parse('2026-10-06T22:00:00Z'); // 17:00 en Lima

/** Congela un objeto entero: si el código lo modifica, la prueba falla con TypeError. */
function congelar(objeto) {
  for (const valor of Object.values(objeto)) if (valor && typeof valor === 'object') congelar(valor);
  return Object.freeze(objeto);
}

/** Atajo: propone un cambio sobre `niveles` con hoy = HOY. */
const proponer = (niveles, ruta, valor, extra = {}) => proponerCambio(niveles, ruta, valor, { hoy: HOY, ahora: AHORA, ...extra });

// ── NIVELES_INICIALES ──

test('NIVELES_INICIALES tiene los valores de §11 y no se puede modificar', () => {
  assert.equal(NIVELES_INICIALES.version, 1);
  assert.deepEqual(NIVELES_INICIALES.base.aviso, { permiso_min: 5 });
  assert.deepEqual(NIVELES_INICIALES.base.friccion, { espera_s: 60, pase_min: 10, comodines_semana: 5 });
  assert.equal(NIVELES_INICIALES.base.total.espera_salida_min, 10);
  assert.equal(NIVELES_INICIALES.base.total.bloquear_sin_clasificar, true);
  assert.equal(NIVELES_INICIALES.base.escalamiento.avisos_para_friccion, 3);
  assert.deepEqual(NIVELES_INICIALES.cambios, []);
  assert.throws(() => { NIVELES_INICIALES.base.aviso.permiso_min = 60; }, TypeError);
  assert.throws(() => { NIVELES_INICIALES.base.patrones_url.push('x'); }, TypeError);
  assert.throws(() => { NIVELES_INICIALES.cambios.push({}); }, TypeError);
});

// ── configuracionVigente ──

test('sin ajuste (null o undefined) da la base inicial, como copia que se puede modificar', () => {
  for (const vacio of [null, undefined]) {
    const config = configuracionVigente(vacio, HOY);
    assert.deepEqual(config, NIVELES_INICIALES.base);
    config.aviso.permiso_min = 99;
    config.patrones_url.push('x');
    assert.equal(NIVELES_INICIALES.base.aviso.permiso_min, 5);
    assert.deepEqual(NIVELES_INICIALES.base.patrones_url, []);
  }
});

test('completa con la base inicial lo que falte o tenga un tipo equivocado', () => {
  const niveles = {
    version: 1,
    base: { aviso: {}, friccion: { pase_min: 15, comodines_semana: 'muchos' }, patrones_url: 'no es lista', bloques: { a: 'total', b: 'maximo' } },
  };
  const config = configuracionVigente(niveles, HOY);
  assert.equal(config.aviso.permiso_min, 5);
  assert.equal(config.friccion.pase_min, 15);
  assert.equal(config.friccion.comodines_semana, 5);
  assert.equal(config.friccion.espera_s, 60);
  assert.deepEqual(config.patrones_url, []);
  assert.deepEqual(config.bloques, { a: 'total' });
  assert.deepEqual(config.total, NIVELES_INICIALES.base.total);
});

test('aplica solo los cambios con aplica_desde ≤ fecha, en orden de aplica_desde y luego de creado', () => {
  const niveles = congelar({
    version: 1,
    base: structuredClone(NIVELES_INICIALES.base),
    cambios: [
      // Guardados fuera de orden a propósito.
      { aplica_desde: '2026-10-05', creado: '2026-10-05T15:00:00.000Z', ruta: 'friccion.comodines_semana', valor: 3 },
      { aplica_desde: '2026-10-05', creado: '2026-10-05T14:00:00.000Z', ruta: 'friccion.comodines_semana', valor: 4 },
      { aplica_desde: '2026-10-07', creado: '2026-10-06T10:00:00.000Z', ruta: 'friccion.comodines_semana', valor: 8 },
      { aplica_desde: '2026-10-06', creado: '2026-10-06T09:00:00.000Z', ruta: 'bloques.b-bd1-lun', valor: 'total' },
      { aplica_desde: '2026-10-06', creado: '2026-10-06T09:00:00.000Z', ruta: 'patrones_url', valor: ['youtube\\.com/shorts'] },
    ],
  });
  assert.equal(configuracionVigente(niveles, '2026-10-04').friccion.comodines_semana, 5);
  // El 05 aplican los dos: primero el de las 14:00 (4) y después el de las 15:00 (3), que gana.
  assert.equal(configuracionVigente(niveles, '2026-10-05').friccion.comodines_semana, 3);
  const hoy = configuracionVigente(niveles, HOY);
  assert.equal(hoy.friccion.comodines_semana, 3);
  assert.deepEqual(hoy.bloques, { 'b-bd1-lun': 'total' });
  assert.deepEqual(hoy.patrones_url, ['youtube\\.com/shorts']);
  assert.equal(configuracionVigente(niveles, MANANA).friccion.comodines_semana, 8);
  assert.deepEqual(configuracionVigente(niveles, '2026-10-05').bloques, {});
});

test('la lista nueva reemplaza a la anterior entera y es una copia', () => {
  const niveles = {
    version: 1,
    base: { ...structuredClone(NIVELES_INICIALES.base), patrones_url: ['a', 'b'] },
    cambios: [{ aplica_desde: HOY, creado: '2026-10-06T09:00:00.000Z', ruta: 'patrones_url', valor: ['c'] }],
  };
  const config = configuracionVigente(niveles, HOY);
  assert.deepEqual(config.patrones_url, ['c']);
  config.patrones_url.push('d');
  assert.deepEqual(niveles.cambios[0].valor, ['c']);
});

test('ignora cambios con ruta desconocida, valor que no sirve o mal formados', () => {
  const niveles = {
    version: 1,
    base: structuredClone(NIVELES_INICIALES.base),
    cambios: [
      { aplica_desde: HOY, creado: 'x', ruta: 'aviso.inventado', valor: 1 },
      { aplica_desde: HOY, creado: 'x', ruta: 'aviso.permiso_min', valor: -3 },
      { aplica_desde: HOY, creado: 'x', ruta: 'bloques.b1', valor: 'maximo' },
      { aplica_desde: HOY, creado: 'x', ruta: 'total.bloquear_sin_clasificar', valor: 'no' },
      null,
      { ruta: 'aviso.permiso_min', valor: 1 },
    ],
  };
  assert.deepEqual(configuracionVigente(niveles, HOY), NIVELES_INICIALES.base);
});

// ── tipoDeCambio ──

test('tipoDeCambio: niveles de bloque (bajar afloja)', () => {
  assert.equal(tipoDeCambio('bloques.b1', 'aviso', 'friccion'), 'endurece');
  assert.equal(tipoDeCambio('bloques.b1', 'aviso', 'total'), 'endurece');
  assert.equal(tipoDeCambio('bloques.b1', 'total', 'friccion'), 'afloja');
  assert.equal(tipoDeCambio('bloques.b1', 'aviso', 'ninguno'), 'afloja');
  assert.equal(tipoDeCambio('bloques.b1', 'friccion', 'friccion'), 'igual');
  // Sin saber el nivel anterior, ante la duda cuenta como total.
  assert.equal(tipoDeCambio('bloques.b1', undefined, 'aviso'), 'afloja');
  assert.equal(tipoDeCambio('bloques.b1', undefined, 'total'), 'igual');
});

test('tipoDeCambio: números (según el campo, subir o bajar afloja)', () => {
  assert.equal(tipoDeCambio('aviso.permiso_min', 5, 10), 'afloja');
  assert.equal(tipoDeCambio('aviso.permiso_min', 5, 2), 'endurece');
  assert.equal(tipoDeCambio('friccion.pase_min', 10, 15), 'afloja');
  assert.equal(tipoDeCambio('friccion.comodines_semana', 5, 6), 'afloja');
  assert.equal(tipoDeCambio('friccion.comodines_semana', 5, 0), 'endurece');
  assert.equal(tipoDeCambio('escalamiento.avisos_para_friccion', 3, 5), 'afloja');
  assert.equal(tipoDeCambio('escalamiento.avisos_para_friccion', 3, 1), 'endurece');
  assert.equal(tipoDeCambio('friccion.espera_s', 60, 30), 'afloja');
  assert.equal(tipoDeCambio('friccion.espera_s', 60, 120), 'endurece');
  assert.equal(tipoDeCambio('total.espera_salida_min', 10, 5), 'afloja');
  assert.equal(tipoDeCambio('total.espera_salida_min', 10, 15), 'endurece');
  assert.equal(tipoDeCambio('aviso.permiso_min', 5, 5), 'igual');
});

test('tipoDeCambio: bloquear_sin_clasificar, frase y listas', () => {
  assert.equal(tipoDeCambio('total.bloquear_sin_clasificar', true, false), 'afloja');
  assert.equal(tipoDeCambio('total.bloquear_sin_clasificar', false, true), 'endurece');
  assert.equal(tipoDeCambio('total.bloquear_sin_clasificar', true, true), 'igual');
  assert.equal(tipoDeCambio('total.frase_salida', 'una', 'otra'), 'afloja');
  assert.equal(tipoDeCambio('total.frase_salida', 'una', 'una'), 'igual');

  assert.equal(tipoDeCambio('patrones_url', ['a'], ['a', 'b']), 'endurece');
  assert.equal(tipoDeCambio('patrones_url', ['a', 'b'], ['a']), 'afloja');
  assert.equal(tipoDeCambio('patrones_url', ['a'], ['b']), 'afloja'); // quita y agrega: afloja
  assert.equal(tipoDeCambio('patrones_url', ['a', 'b'], ['b', 'a']), 'igual');
  assert.equal(tipoDeCambio('patrones_url', [], []), 'igual');

  assert.equal(tipoDeCambio('nunca_bloquear', [], ['obsidian']), 'afloja');
  assert.equal(tipoDeCambio('nunca_bloquear', ['a', 'b'], ['a']), 'endurece');
  assert.equal(tipoDeCambio('nunca_bloquear', ['a'], ['b']), 'afloja'); // agrega (y quita): afloja
});

test('tipoDeCambio lanza un error con rutas o valores que no sirven', () => {
  assert.throws(() => tipoDeCambio('aviso.inventado', 1, 2), /desconocida/);
  assert.throws(() => tipoDeCambio('bloques.b1', 'aviso', 'maximo'), /Nivel desconocido/);
  assert.throws(() => tipoDeCambio('aviso.permiso_min', 5, '10'), /número/);
  assert.throws(() => tipoDeCambio('patrones_url', [], 'a'), /lista/);
});

// ── proponerCambio ──

test('endurecer aplica hoy', () => {
  const r = proponer(null, 'friccion.comodines_semana', 3);
  assert.equal(r.tipo, 'endurece');
  assert.equal(r.aplicaDesde, HOY);
  assert.equal(r.inmediato, true);
  assert.deepEqual(r.niveles.cambios, [
    { aplica_desde: HOY, creado: '2026-10-06T22:00:00.000Z', ruta: 'friccion.comodines_semana', valor: 3 },
  ]);
  assert.equal(configuracionVigente(r.niveles, HOY).friccion.comodines_semana, 3);
  assert.deepEqual(cambiosPendientes(r.niveles, HOY), []);
});

test('aflojar aplica desde el día lógico siguiente', () => {
  const r = proponer(null, 'friccion.comodines_semana', 8);
  assert.equal(r.tipo, 'afloja');
  assert.equal(r.aplicaDesde, MANANA);
  assert.equal(r.inmediato, false);
  assert.equal(configuracionVigente(r.niveles, HOY).friccion.comodines_semana, 5);
  assert.equal(configuracionVigente(r.niveles, MANANA).friccion.comodines_semana, 8);
  assert.equal(cambiosPendientes(r.niveles, HOY).length, 1);
  assert.deepEqual(cambiosPendientes(r.niveles, MANANA), []);
});

test('el cambio de fin de mes y de año cae en el día siguiente correcto', () => {
  const r = proponerCambio(null, 'aviso.permiso_min', 10, { hoy: '2026-12-31', ahora: AHORA });
  assert.equal(r.aplicaDesde, '2027-01-01');
});

test('un cambio nuevo reemplaza al pendiente de la misma ruta; el tipo se compara con lo vigente hoy', () => {
  const primero = proponer(null, 'friccion.comodines_semana', 8).niveles; // pendiente: 8 desde mañana
  // 6 es menos que 8 (lo pendiente), pero más que 5 (lo vigente hoy): sigue siendo aflojar.
  const segundo = proponer(primero, 'friccion.comodines_semana', 6);
  assert.equal(segundo.tipo, 'afloja');
  assert.equal(segundo.aplicaDesde, MANANA);
  assert.deepEqual(cambiosPendientes(segundo.niveles, HOY).map((c) => c.valor), [6]);
  assert.equal(configuracionVigente(segundo.niveles, MANANA).friccion.comodines_semana, 6);

  // Endurecer borra lo pendiente y aplica hoy.
  const tercero = proponer(segundo.niveles, 'friccion.comodines_semana', 2);
  assert.equal(tercero.tipo, 'endurece');
  assert.deepEqual(cambiosPendientes(tercero.niveles, HOY), []);
  assert.equal(configuracionVigente(tercero.niveles, HOY).friccion.comodines_semana, 2);
  assert.equal(configuracionVigente(tercero.niveles, MANANA).friccion.comodines_semana, 2);
});

test('volver al valor de hoy cancela lo pendiente', () => {
  const pendiente = proponer(null, 'aviso.permiso_min', 15).niveles;
  const r = proponer(pendiente, 'aviso.permiso_min', 5);
  assert.equal(r.tipo, 'igual');
  assert.equal(r.inmediato, true);
  assert.deepEqual(cambiosPendientes(r.niveles, HOY), []);
  assert.equal(configuracionVigente(r.niveles, MANANA).aviso.permiso_min, 5);
});

test('los pendientes de otras rutas no se tocan', () => {
  const a = proponer(null, 'aviso.permiso_min', 15).niveles;
  const b = proponer(a, 'friccion.pase_min', 20).niveles;
  assert.deepEqual(cambiosPendientes(b, HOY).map((c) => c.ruta), ['aviso.permiso_min', 'friccion.pase_min']);
});

test('el mismo valor sin nada pendiente no agrega un cambio', () => {
  const r = proponer(null, 'friccion.pase_min', 10);
  assert.equal(r.tipo, 'igual');
  assert.deepEqual(r.niveles.cambios, []);
});

test('cambiar la frase de salida cuenta como aflojar: aplica mañana', () => {
  const r = proponer(null, 'total.frase_salida', 'Dejo el bloque');
  assert.equal(r.tipo, 'afloja');
  assert.equal(r.inmediato, false);
  assert.equal(r.aplicaDesde, sumarDias(HOY, 1));
  assert.equal(configuracionVigente(r.niveles, HOY).total.frase_salida, NIVELES_INICIALES.base.total.frase_salida);
  assert.equal(configuracionVigente(r.niveles, sumarDias(HOY, 1)).total.frase_salida, 'Dejo el bloque');
});

test('listas: agregar un patrón de URL endurece; agregar a nunca_bloquear afloja', () => {
  const r1 = proponer(null, 'patrones_url', ['youtube\\.com/shorts']);
  assert.equal(r1.tipo, 'endurece');
  assert.deepEqual(configuracionVigente(r1.niveles, HOY).patrones_url, ['youtube\\.com/shorts']);
  const r2 = proponer(r1.niveles, 'patrones_url', []);
  assert.equal(r2.tipo, 'afloja');
  assert.deepEqual(configuracionVigente(r2.niveles, HOY).patrones_url, ['youtube\\.com/shorts']);
  assert.deepEqual(configuracionVigente(r2.niveles, MANANA).patrones_url, []);

  const r3 = proponer(null, 'nunca_bloquear', ['^obsidian\\.exe$']);
  assert.equal(r3.tipo, 'afloja');
  assert.equal(r3.aplicaDesde, MANANA);
});

test('nivel de un bloque: con el nivel del plan, sin él y con un nivel ya elegido', () => {
  const subir = proponer(null, 'bloques.b-dbp-mar', 'total', { nivelPlan: 'friccion' });
  assert.equal(subir.tipo, 'endurece');
  assert.equal(subir.inmediato, true);
  assert.deepEqual(configuracionVigente(subir.niveles, HOY).bloques, { 'b-dbp-mar': 'total' });

  const bajar = proponer(null, 'bloques.b-dbp-mar', 'aviso', { nivelPlan: 'friccion' });
  assert.equal(bajar.tipo, 'afloja');
  assert.equal(bajar.aplicaDesde, MANANA);

  // Sin el nivel del plan, cualquier cosa que no sea total espera a mañana.
  assert.equal(proponer(null, 'bloques.b-dbp-mar', 'friccion').tipo, 'afloja');

  // Con un nivel ya elegido (total), ese es el valor de hoy, aunque nivelPlan diga otra cosa.
  const otraVez = proponer(subir.niveles, 'bloques.b-dbp-mar', 'friccion', { nivelPlan: 'aviso' });
  assert.equal(otraVez.tipo, 'afloja');
  assert.equal(configuracionVigente(otraVez.niveles, HOY).bloques['b-dbp-mar'], 'total');
  assert.equal(configuracionVigente(otraVez.niveles, MANANA).bloques['b-dbp-mar'], 'friccion');

  // Igual al plan y sin nada pendiente: no agrega nada.
  assert.deepEqual(proponer(null, 'bloques.b-dbp-mar', 'friccion', { nivelPlan: 'friccion' }).niveles.cambios, []);
});

test('proponerCambio no modifica la entrada y conserva lo demás del ajuste', () => {
  const niveles = congelar({
    version: 1,
    base: structuredClone(NIVELES_INICIALES.base),
    cambios: [{ aplica_desde: '2026-10-01', creado: '2026-10-01T10:00:00.000Z', ruta: 'aviso.permiso_min', valor: 3 }],
    nota: 'lo que traiga el ajuste se conserva',
  });
  const r = proponer(niveles, 'friccion.espera_s', 90);
  assert.equal(r.niveles.cambios.length, 2);
  assert.equal(r.niveles.nota, 'lo que traiga el ajuste se conserva');
  assert.equal(niveles.cambios.length, 1);
  assert.notEqual(r.niveles.base, niveles.base);
});

test('proponerCambio rechaza rutas, valores y patrones que no sirven', () => {
  assert.throws(() => proponer(null, 'aviso.inventado', 1), /desconocida/);
  assert.throws(() => proponer(null, 'bloques.b1', 'maximo'), /Nivel desconocido/);
  assert.throws(() => proponer(null, 'aviso.permiso_min', -1), /mayor o igual a 0/);
  assert.throws(() => proponer(null, 'escalamiento.avisos_para_friccion', 0), /mayor o igual a 1/);
  assert.throws(() => proponer(null, 'total.frase_salida', '  '), /vacío/);
  assert.throws(() => proponer(null, 'patrones_url', ['(sin cerrar']), /no sirve/);
  assert.throws(() => proponerCambio(null, 'aviso.permiso_min', 1, { ahora: AHORA }), /fecha de hoy/);
  assert.throws(() => proponerCambio(null, 'aviso.permiso_min', 1, { hoy: HOY }), /ahora/);
});

// ── cambiosPendientes ──

test('cambiosPendientes: vacío sin ajuste; ordenados y como copias', () => {
  assert.deepEqual(cambiosPendientes(null, HOY), []);
  assert.deepEqual(cambiosPendientes({ version: 1, base: {} }, HOY), []);
  const niveles = {
    version: 1,
    base: {},
    cambios: [
      { aplica_desde: '2026-10-09', creado: 'b', ruta: 'patrones_url', valor: [] },
      { aplica_desde: '2026-10-07', creado: 'a', ruta: 'aviso.permiso_min', valor: 9 },
      { aplica_desde: '2026-10-06', creado: 'a', ruta: 'friccion.pase_min', valor: 5 },
    ],
  };
  const pendientes = cambiosPendientes(niveles, HOY);
  assert.deepEqual(pendientes.map((c) => c.aplica_desde), ['2026-10-07', '2026-10-09']);
  pendientes[1].valor.push('x');
  assert.deepEqual(niveles.cambios[0].valor, []);
});

// ── nivelDeBloque ──

test('nivelDeBloque: excepción > nivel elegido > nivel del plan', () => {
  const bloque = { id: 'b-dbp-mar@2026-10-06', bloqueId: 'b-dbp-mar', nivel: 'aviso', subidoPorExcepcion: false };
  const config = configuracionVigente(null, HOY);
  assert.equal(nivelDeBloque(bloque, config), 'aviso');
  assert.equal(nivelDeBloque(bloque, { ...config, bloques: { 'b-dbp-mar': 'friccion' } }), 'friccion');
  assert.equal(nivelDeBloque(bloque, { ...config, bloques: { 'otro': 'total' } }), 'aviso');
  assert.equal(nivelDeBloque({ ...bloque, subidoPorExcepcion: true }, { ...config, bloques: { 'b-dbp-mar': 'ninguno' } }), 'total');
  assert.equal(nivelDeBloque(bloque, null), 'aviso');
  assert.equal(nivelDeBloque({ ...bloque, nivel: 'raro' }, config), 'ninguno');
  assert.equal(nivelDeBloque(null, config), 'ninguno');
});
