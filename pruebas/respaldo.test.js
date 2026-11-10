// Pruebas de web/js/respaldo.js (F3-02): exportar → importar deja el plan idéntico.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRespaldo, textoDeRespaldo, leerRespaldo, nombreDeRespaldo, FORMATO_RESPALDO } from '../web/js/respaldo.js';
import { normalizarPlan, planVacio } from '../web/motor/plan.js';
import { NIVELES_INICIALES, proponerCambio } from '../web/motor/niveles.js';
import { planEjemplo } from './ayudantes/ejemplo.js';

const AHORA = Date.parse('2026-10-14T21:20:00Z'); // 16:20 en Lima

test('exportar → importar deja el plan idéntico (y los niveles)', () => {
  const plan = normalizarPlan(planEjemplo());
  const niveles = proponerCambio(null, 'friccion.pase_min', 5, { hoy: '2026-10-14', ahora: AHORA }).niveles;
  const texto = textoDeRespaldo({ plan, niveles, ahora: AHORA });
  const leido = leerRespaldo(texto);
  assert.equal(leido.valido, true);
  assert.deepEqual(leido.errores, []);
  assert.deepEqual(leido.plan, plan);
  assert.deepEqual(leido.niveles, niveles);
  assert.equal(leido.exportado, '2026-10-14T21:20:00.000Z');
  // Y otra vuelta da exactamente el mismo texto.
  assert.equal(textoDeRespaldo({ plan: leido.plan, niveles: leido.niveles, ahora: AHORA }), texto);
});

test('crearRespaldo: marca, versión y plan normalizado; sin niveles no los inventa; no modifica la entrada', () => {
  const plan = planEjemplo();
  const copia = structuredClone(plan);
  const respaldo = crearRespaldo({ plan, ahora: AHORA });
  assert.equal(respaldo.formato, FORMATO_RESPALDO);
  assert.equal(respaldo.version, 1);
  assert.deepEqual(respaldo.plan, normalizarPlan(plan));
  assert.equal('niveles' in respaldo, false);
  assert.deepEqual(plan, copia);
  // Los niveles van como copia: cambiar el respaldo no cambia el original (que está congelado).
  const conNiveles = crearRespaldo({ plan, niveles: NIVELES_INICIALES, ahora: AHORA });
  conNiveles.niveles.base.aviso.permiso_min = 99;
  assert.equal(NIVELES_INICIALES.base.aviso.permiso_min, 5);
});

test('leerRespaldo acepta un plan suelto (el JSON de rastreador-plan)', () => {
  const leido = leerRespaldo(JSON.stringify(planEjemplo()));
  assert.equal(leido.valido, true);
  assert.deepEqual(leido.plan, normalizarPlan(planEjemplo()));
  assert.equal(leido.niveles, null);
  assert.equal(leido.exportado, null);
});

test('leerRespaldo: un plan con errores vuelve con valido = false y sus mensajes', () => {
  const plan = planEjemplo();
  plan.bloques[0].inicio = '25:00';
  const leido = leerRespaldo(JSON.stringify({ formato: FORMATO_RESPALDO, version: 1, plan }));
  assert.equal(leido.valido, false);
  assert.ok(leido.errores.some((e) => e.ruta.endsWith('.inicio')));
});

test('leerRespaldo rechaza lo que no es JSON o no parece un plan', () => {
  assert.throws(() => leerRespaldo('esto no es json'), /JSON válido/);
  assert.throws(() => leerRespaldo('[1, 2]'), /objeto JSON/);
  assert.throws(() => leerRespaldo('{"hola": 1}'), /no parece un plan/);
  assert.throws(() => leerRespaldo(JSON.stringify({ formato: FORMATO_RESPALDO })), /falta "plan"/);
  // Un plan vacío sí es un plan.
  assert.equal(leerRespaldo(JSON.stringify(planVacio())).valido, true);
});

test('nombreDeRespaldo usa la fecha de Lima', () => {
  assert.equal(nombreDeRespaldo(AHORA), 'rastreador-plan-2026-10-14.json');
  assert.equal(nombreDeRespaldo(Date.parse('2026-10-15T03:00:00Z')), 'rastreador-plan-2026-10-14.json'); // 22:00 del 14 en Lima
});
