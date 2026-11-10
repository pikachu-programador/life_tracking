// Pruebas de los textos del plan (web/js/textos-plan.js) y de los ayudantes de formularios (F3-04).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoDias, textoFranja, textoCategoria, textoRepeticion, nombreCurso, colorCurso, diaCorto } from '../web/js/textos-plan.js';
import { aId, idLibre } from '../web/js/componentes/formulario.js';
import { erroresParaFormulario } from '../web/js/vistas/horario-editor.js';
import { validarPlan } from '../web/motor/plan.js';
import { planEjemplo } from './ayudantes/ejemplo.js';

test('textoDias: todos, seguidos, sueltos, desordenados y vacío', () => {
  assert.equal(textoDias(['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']), 'todos los días');
  assert.equal(textoDias(['lun', 'mar', 'mie', 'jue', 'vie']), 'lun a vie');
  assert.equal(textoDias(['dom', 'sab']), 'sáb y dom');
  assert.equal(textoDias(['vie', 'lun', 'mie']), 'lun, mié y vie');
  assert.equal(textoDias(['mar']), 'mar');
  assert.equal(textoDias([]), '—');
  assert.equal(textoDias(undefined), '—');
  assert.equal(diaCorto('mie'), 'mié');
});

test('textoFranja, textoCategoria y textoRepeticion', () => {
  assert.equal(textoFranja('15:00', '17:00'), '15:00 – 17:00');
  assert.equal(textoFranja('07:00', '07:00'), '07:00');
  assert.equal(textoFranja(undefined, undefined), 'todo el día');
  assert.equal(textoCategoria(['Estudio', 'Inglés']), 'Estudio > Inglés');
  assert.equal(textoCategoria('Estudio > Inglés'), 'Estudio > Inglés');
  assert.equal(textoRepeticion({ repeticion: { tipo: 'semanal', dias: ['lun', 'mie'] }, inicio: '15:00', fin: '17:00' }), 'lun y mié · 15:00 – 17:00');
  assert.match(textoRepeticion({ repeticion: { tipo: 'unica', fecha: '2026-10-17' }, inicio: '14:00', fin: '17:00' }), /17 oct · 14:00 – 17:00$/);
  assert.equal(textoRepeticion({ repeticion: { tipo: 'unica', fecha: '' }, inicio: '14:00', fin: '17:00' }), 'sin fecha · 14:00 – 17:00');
});

test('nombreCurso y colorCurso: un curso que ya no existe muestra su id', () => {
  const plan = { cursos: [{ id: 'bd1', nombre: 'BD I', color: 'curso-2' }] };
  assert.equal(nombreCurso(plan, 'bd1'), 'BD I');
  assert.equal(colorCurso(plan, 'bd1'), 'curso-2');
  assert.equal(nombreCurso(plan, 'borrado'), 'borrado');
  assert.equal(colorCurso(plan, 'borrado'), undefined);
});

test('aId: minúsculas, sin tildes ni símbolos; idLibre no repite', () => {
  assert.equal(aId('Bases de Datos I'), 'bases-de-datos-i');
  assert.equal(aId('  Inglés diario!  '), 'ingles-diario');
  assert.equal(aId('¿¡!?'), '');
  assert.equal(aId('日本語 N5'), 'n5');
  assert.equal(idLibre('b-bd1-lun-1500', []), 'b-bd1-lun-1500');
  assert.equal(idLibre('b-bd1-lun-1500', ['b-bd1-lun-1500', 'b-bd1-lun-1500-2']), 'b-bd1-lun-1500-3');
});

test('erroresParaFormulario: cada error de validarPlan va a su campo, sin el prefijo; lo demás, a general', () => {
  const plan = planEjemplo();
  plan.bloques[0].fin = plan.bloques[0].inicio;        // misma hora
  plan.bloques[0].repeticion = { tipo: 'semanal', dias: [] };
  plan.cursos[0].meta_horas_semana = -1;                // de otro formulario
  const { errores } = validarPlan(plan);
  const r = erroresParaFormulario(errores, ['curso', 'dias', 'inicio', 'fin', 'nivel']);
  assert.match(r.errores.fin, /^Empieza y termina a la misma hora/);
  assert.ok(r.errores.dias);
  assert.equal(/^Bloque/.test(r.errores.dias), false);   // sin 'Bloque "b-bd1-lun": '
  assert.match(r.general, /Curso "bd1"/);                 // el error del curso no tiene campo aquí
  assert.deepEqual(erroresParaFormulario([], ['fin']), { errores: {}, general: '' });
});
