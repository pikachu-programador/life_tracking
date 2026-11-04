// Pruebas de web/motor/horario.js (F3-03): expandirDia, expandirRango, itemsEnCurso y proximoItem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandirDia, expandirRango, itemsEnCurso, proximoItem } from '../web/motor/horario.js';
import { diaDe } from '../web/motor/fechas.js';
import { planEjemplo, FECHAS_EJEMPLO } from './ayudantes/ejemplo.js';

const HORA = 60 * 60 * 1000;

/** Instante de una hora de Lima (UTC−5), escrito aparte de fechas.js para no probar el código con él mismo. */
const lima = (fecha, hora) => Date.parse(`${fecha}T${hora}:00-05:00`);

const ids = (lista) => lista.map((x) => x.id);

/** Bloque semanal para los planes armados a mano. */
function bloque(id, dias, inicio, fin, extra = {}) {
  return {
    id, tipo: 'estudio_pc', curso: 'bd1', repeticion: { tipo: 'semanal', dias }, inicio, fin,
    nivel: 'aviso', objetivo: '', por_que: '', ...extra,
  };
}

/** Plan de ejemplo con bloques y excepciones extra. */
function planCon({ bloques = [], excepciones = [], rutinas = [] } = {}) {
  const plan = planEjemplo();
  plan.bloques.push(...bloques);
  plan.excepciones.push(...excepciones);
  plan.rutinas.push(...rutinas);
  return plan;
}

// ── expandirDia: un día normal ──

test('expandirDia: un lunes del plan de ejemplo (clases, bloque y rutinas con sus instantes)', () => {
  const dia = expandirDia(planEjemplo(), '2026-10-05');
  assert.equal(dia.fecha, '2026-10-05');
  assert.equal(dia.enCiclo, true);
  assert.deepEqual(dia.excepciones, []);
  assert.deepEqual(dia.clases, [
    {
      id: 'c-bd1-lun-0800@2026-10-05', claseId: 'c-bd1-lun-0800', curso: 'bd1', tipo: 'teoria',
      inicio: lima('2026-10-05', '08:00'), fin: lima('2026-10-05', '10:00'), lugar: 'UTEC', usaPc: false,
    },
    {
      id: 'c-edo-lun-1000@2026-10-05', claseId: 'c-edo-lun-1000', curso: 'edo', tipo: 'teoria',
      inicio: lima('2026-10-05', '10:00'), fin: lima('2026-10-05', '12:00'), lugar: 'UTEC', usaPc: false,
    },
  ]);
  assert.deepEqual(dia.bloques, [{
    id: 'b-bd1-lun@2026-10-05', bloqueId: 'b-bd1-lun', tipo: 'estudio_pc', curso: 'bd1',
    inicio: lima('2026-10-05', '15:00'), fin: lima('2026-10-05', '17:00'), finPlan: lima('2026-10-05', '17:00'),
    nivel: 'friccion', subidoPorExcepcion: false,
    objetivo: 'Ejercicios de normalización y SQL', porQue: 'Quiero llegar al final de BD I sin depender del examen.',
    terminadoAntes: null,
  }]);
  assert.deepEqual(ids(dia.rutinas), ['despertar@2026-10-05', 'dormir@2026-10-05', 'ingles-pc@2026-10-05']);
  assert.deepEqual(dia.rutinas[2], {
    id: 'ingles-pc@2026-10-05', rutinaId: 'ingles-pc', nombre: 'Inglés en la PC', medicion: 'pc', evento: null,
    inicio: lima('2026-10-05', '21:00'), fin: lima('2026-10-05', '22:00'),
    categoria: ['Estudio', 'Inglés'], minutosMeta: 30, toleranciaMin: 10,
  });
});

test('expandirDia: bloques y clases ordenados por inicio; rutinas en el orden del plan', () => {
  const plan = planCon({ bloques: [bloque('b-temprano', ['lun'], '06:00', '07:00'), bloque('b-noche', ['lun'], '00:30', '01:30')] });
  const dia = expandirDia(plan, '2026-10-05');
  assert.deepEqual(ids(dia.bloques), ['b-temprano@2026-10-05', 'b-bd1-lun@2026-10-05', 'b-noche@2026-10-05']);
  for (const lista of [dia.bloques, dia.clases]) {
    for (let i = 1; i < lista.length; i++) assert.ok(lista[i - 1].inicio <= lista[i].inicio);
  }
});

// ── Hecho cuando de F3-03: feriado, semana de exámenes, cruce de medianoche y fin de ciclo ──

test('feriado (2026-10-08): sin clases ni bloques; las rutinas sí', () => {
  const dia = expandirDia(planEjemplo(), '2026-10-08');
  assert.equal(dia.enCiclo, true);
  assert.deepEqual(dia.clases, []);
  assert.deepEqual(dia.bloques, []);
  assert.deepEqual(ids(dia.rutinas), ['despertar@2026-10-08', 'dormir@2026-10-08', 'ingles-pc@2026-10-08', 'ejercicio@2026-10-08']);
  assert.deepEqual(dia.excepciones, [{ desde: '2026-10-08', hasta: '2026-10-08', tipo: 'feriado', efecto: 'cancelar_clases_y_bloques', nota: 'Combate de Angamos' }]);
  // El jueves siguiente es normal.
  const siguiente = expandirDia(planEjemplo(), '2026-10-15');
  assert.deepEqual(ids(siguiente.clases), ['c-p3-jue-0800@2026-10-15', 'c-pi2-jue-1000@2026-10-15']);
  assert.deepEqual(ids(siguiente.bloques), ['b-pi2-jue@2026-10-15']);
  assert.deepEqual(siguiente.excepciones, []);
});

test('semana de exámenes: subir_bloques_a_total pone todos los bloques en total; las clases siguen', () => {
  const examenes = { desde: '2026-10-12', hasta: '2026-10-16', tipo: 'examenes', efecto: 'subir_bloques_a_total' };
  const plan = planCon({ excepciones: [examenes] });
  const semana = expandirRango(plan, '2026-10-12', '2026-10-16');
  const bloques = semana.flatMap((d) => d.bloques);
  assert.equal(bloques.length, 7); // lun, mar (2), mie (2), jue y vie
  for (const b of bloques) {
    assert.equal(b.nivel, 'total');
    assert.equal(b.subidoPorExcepcion, true);
  }
  assert.equal(semana.flatMap((d) => d.clases).length, 7); // las clases no cambian
  assert.deepEqual(semana[0].excepciones, [examenes]);
  // Fuera de la excepción, cada bloque tiene el nivel del plan.
  const sabado = expandirDia(plan, '2026-10-17');
  assert.deepEqual(sabado.bloques.map((b) => [b.bloqueId, b.nivel, b.subidoPorExcepcion]), [
    ['b-dbp-sab', 'friccion', false], ['b-examen-bd1', 'total', false],
  ]);
  assert.equal(expandirDia(plan, '2026-10-11').excepciones.length, 0);
});

test('cancelar_bloques quita los bloques semanales pero no las clases; los bloques únicos se quedan', () => {
  const plan = planCon({ excepciones: [{ desde: '2026-10-12', hasta: '2026-10-17', tipo: 'libre', efecto: 'cancelar_bloques' }] });
  const lunes = expandirDia(plan, '2026-10-12');
  assert.deepEqual(lunes.bloques, []);
  assert.equal(lunes.clases.length, 2);
  // El sábado 17 se cancela el semanal, pero el examen (bloque único) sigue.
  assert.deepEqual(ids(expandirDia(plan, '2026-10-17').bloques), ['b-examen-bd1@2026-10-17']);
  // Con cancelar_clases_y_bloques pasa lo mismo con los únicos.
  const feriado = planCon({ excepciones: [{ desde: '2026-10-17', hasta: '2026-10-17', tipo: 'feriado', efecto: 'cancelar_clases_y_bloques' }] });
  assert.deepEqual(ids(expandirDia(feriado, '2026-10-17').bloques), ['b-examen-bd1@2026-10-17']);
});

test('dos excepciones el mismo día: cancelar gana a subir a total (lo que queda, los únicos, sí sube)', () => {
  const plan = planCon({
    bloques: [bloque('b-repaso', [], '18:00', '19:00', { repeticion: { tipo: 'unica', fecha: '2026-10-14' } })],
    excepciones: [
      { desde: '2026-10-12', hasta: '2026-10-16', tipo: 'examenes', efecto: 'subir_bloques_a_total' },
      { desde: '2026-10-14', hasta: '2026-10-14', tipo: 'feriado', efecto: 'cancelar_clases_y_bloques' },
    ],
  });
  const miercoles = expandirDia(plan, '2026-10-14');
  assert.equal(miercoles.excepciones.length, 2);
  assert.deepEqual(miercoles.clases, []);
  // Los semanales del miércoles (b-est-mie y b-edo-mie) se cancelan: no aparecen en total.
  assert.deepEqual(miercoles.bloques.map((b) => [b.bloqueId, b.nivel, b.subidoPorExcepcion]), [['b-repaso', 'total', true]]);
  // El martes solo hay exámenes: sus bloques suben.
  assert.ok(expandirDia(plan, '2026-10-13').bloques.every((b) => b.nivel === 'total'));
});

test('bloque que cruza la medianoche: b-p3-mar-noche del martes 2026-10-06 termina el 7 a las 00:30', () => {
  const martes = expandirDia(planEjemplo(), '2026-10-06');
  assert.deepEqual(ids(martes.bloques), ['b-dbp-mar@2026-10-06', 'b-p3-mar-noche@2026-10-06']);
  const noche = martes.bloques[1];
  assert.equal(noche.inicio, lima('2026-10-06', '23:30'));
  assert.equal(noche.fin, lima('2026-10-07', '00:30'));
  assert.equal(noche.finPlan, noche.fin);
  assert.equal(noche.fin - noche.inicio, HORA);
  // Es del martes, no del miércoles.
  assert.equal(expandirDia(planEjemplo(), '2026-10-07').bloques.some((b) => b.bloqueId === 'b-p3-mar-noche'), false);
  // Si el fin es posterior al inicio del día (05:00 ≥ 04:00) pero anterior al inicio, también es del día siguiente.
  const largo = expandirDia(planCon({ bloques: [bloque('b-trasnoche', ['lun'], '22:00', '05:00')] }), '2026-10-05');
  const trasnoche = largo.bloques.find((b) => b.bloqueId === 'b-trasnoche');
  assert.equal(trasnoche.inicio, lima('2026-10-05', '22:00'));
  assert.equal(trasnoche.fin, lima('2026-10-06', '05:00'));
});

test('bloque de madrugada: "lunes 00:30–01:30" es el martes calendario a las 00:30', () => {
  const plan = planCon({ bloques: [bloque('b-madrugada', ['lun'], '00:30', '01:30'), bloque('b-cruza-inicio', ['lun'], '03:00', '05:00')] });
  const lunes = expandirDia(plan, '2026-10-05');
  const madrugada = lunes.bloques.find((b) => b.bloqueId === 'b-madrugada');
  assert.equal(madrugada.inicio, lima('2026-10-06', '00:30'));
  assert.equal(madrugada.fin, lima('2026-10-06', '01:30'));
  assert.equal(diaDe(madrugada.inicio), '2026-10-05'); // y para AW también es del lunes
  // 03:00–05:00 empieza en la madrugada del martes y termina pasado el inicio del día.
  const cruza = lunes.bloques.find((b) => b.bloqueId === 'b-cruza-inicio');
  assert.equal(cruza.inicio, lima('2026-10-06', '03:00'));
  assert.equal(cruza.fin, lima('2026-10-06', '05:00'));
  // El martes no los repite.
  assert.equal(expandirDia(plan, '2026-10-06').bloques.some((b) => b.bloqueId === 'b-madrugada'), false);
});

test('con inicioDia 00:00 no hay madrugada del día siguiente: solo cruza lo que termina antes de empezar', () => {
  const plan = planCon({ bloques: [bloque('b-madrugada', ['lun'], '00:30', '01:30'), bloque('b-noche', ['lun'], '23:30', '00:30')] });
  const lunes = expandirDia(plan, '2026-10-05', { inicioDia: '00:00' });
  const madrugada = lunes.bloques.find((b) => b.bloqueId === 'b-madrugada');
  assert.equal(madrugada.inicio, lima('2026-10-05', '00:30'));
  const noche = lunes.bloques.find((b) => b.bloqueId === 'b-noche');
  assert.equal(noche.inicio, lima('2026-10-05', '23:30'));
  assert.equal(noche.fin, lima('2026-10-06', '00:30'));
});

test('fin de ciclo: después de ciclo.fin no hay clases ni bloques semanales, pero sí rutinas y bloques únicos', () => {
  const plan = planCon({ bloques: [bloque('b-vacaciones', [], '10:00', '12:00', { repeticion: { tipo: 'unica', fecha: '2026-12-14' } })] });
  // El último día del ciclo (sábado 12-12) todavía cuenta.
  const ultimo = expandirDia(plan, '2026-12-12');
  assert.equal(ultimo.enCiclo, true);
  assert.deepEqual(ids(ultimo.bloques), ['b-dbp-sab@2026-12-12']);
  // El lunes 12-14 ya está fuera.
  const fuera = expandirDia(plan, '2026-12-14');
  assert.equal(fuera.enCiclo, false);
  assert.deepEqual(fuera.clases, []);
  assert.deepEqual(ids(fuera.bloques), ['b-vacaciones@2026-12-14']);
  assert.deepEqual(ids(fuera.rutinas), ['despertar@2026-12-14', 'dormir@2026-12-14', 'ingles-pc@2026-12-14']);
  // Y el inicio: el lunes 08-24 es el primer día; el anterior no tiene nada semanal.
  assert.equal(expandirDia(plan, '2026-08-24').clases.length, 2);
  const antes = expandirDia(plan, '2026-08-17');
  assert.equal(antes.enCiclo, false);
  assert.deepEqual([antes.clases, antes.bloques], [[], []]);
  assert.equal(antes.rutinas.length, 3);
});

test('sin ciclo: solo rutinas y bloques únicos', () => {
  const plan = planEjemplo();
  delete plan.ciclo;
  const sabado = expandirDia(plan, '2026-10-17');
  assert.equal(sabado.enCiclo, false);
  assert.deepEqual(ids(sabado.bloques), ['b-examen-bd1@2026-10-17']);
  assert.deepEqual(ids(sabado.rutinas), ['despertar-finde@2026-10-17', 'dormir@2026-10-17']);
});

// ── Bloques únicos y terminados antes ──

test('bloque único: b-examen-bd1 solo el 2026-10-17', () => {
  const dia = expandirDia(planEjemplo(), '2026-10-17');
  assert.deepEqual(ids(dia.bloques), ['b-dbp-sab@2026-10-17', 'b-examen-bd1@2026-10-17']);
  const examen = dia.bloques[1];
  assert.equal(examen.tipo, 'examen');
  assert.equal(examen.nivel, 'total');
  assert.equal(examen.subidoPorExcepcion, false);
  assert.equal(examen.inicio, lima('2026-10-17', '14:00'));
  assert.equal(examen.fin, lima('2026-10-17', '17:00'));
  for (const otroSabado of ['2026-10-10', '2026-10-24']) {
    assert.deepEqual(ids(expandirDia(planEjemplo(), otroSabado).bloques), [`b-dbp-sab@${otroSabado}`]);
  }
});

test('terminado antes: fin = la hora real, finPlan = la planificada, solo ese día', () => {
  const plan = planEjemplo();
  plan.bloques[0].terminados_antes = [{ fecha: '2026-10-05', fin: '16:10', motivo: 'Me dio sueño' }];
  const [lunes] = expandirDia(plan, '2026-10-05').bloques;
  assert.equal(lunes.fin, lima('2026-10-05', '16:10'));
  assert.equal(lunes.finPlan, lima('2026-10-05', '17:00'));
  assert.deepEqual(lunes.terminadoAntes, { fin: lima('2026-10-05', '16:10'), motivo: 'Me dio sueño' });
  const [otroLunes] = expandirDia(plan, '2026-10-12').bloques;
  assert.equal(otroLunes.fin, lima('2026-10-12', '17:00'));
  assert.equal(otroLunes.terminadoAntes, null);
});

test('terminado antes en un bloque que cruza la medianoche, repetido, fuera del bloque o al empezar', () => {
  const conTerminado = (...terminados) => {
    const plan = planEjemplo();
    plan.bloques.find((b) => b.id === 'b-p3-mar-noche').terminados_antes = terminados;
    return expandirDia(plan, '2026-10-06').bloques.find((b) => b.bloqueId === 'b-p3-mar-noche');
  };
  // 00:10 es de la madrugada del 7; 23:50 todavía del 6.
  assert.equal(conTerminado({ fecha: '2026-10-06', fin: '00:10', motivo: '' }).fin, lima('2026-10-07', '00:10'));
  assert.equal(conTerminado({ fecha: '2026-10-06', fin: '23:50', motivo: '' }).fin, lima('2026-10-06', '23:50'));
  // Si hay varios para el mismo día, manda el último.
  const varios = conTerminado({ fecha: '2026-10-06', fin: '23:50', motivo: 'a' }, { fecha: '2026-10-06', fin: '00:05', motivo: 'b' });
  assert.deepEqual(varios.terminadoAntes, { fin: lima('2026-10-07', '00:05'), motivo: 'b' });
  // Una hora después del fin planificado (validarPlan la marca como error) no alarga el bloque.
  const despues = conTerminado({ fecha: '2026-10-06', fin: '02:00', motivo: '' });
  assert.equal(despues.fin, despues.finPlan);
  // Terminado justo al empezar: el bloque real dura 0 (el planificado sigue igual).
  const alEmpezar = conTerminado({ fecha: '2026-10-06', fin: '23:30', motivo: '' });
  assert.equal(alEmpezar.fin, alEmpezar.inicio);
  assert.equal(alEmpezar.finPlan - alEmpezar.inicio, HORA);
  // Sin motivo: ''.
  assert.equal(conTerminado({ fecha: '2026-10-06', fin: '00:00' }).terminadoAntes.motivo, '');
});

// ── Rutinas ──

test('rutina sin franja: inicio y fin null (cuenta en todo el día lógico)', () => {
  const plan = planCon({
    rutinas: [{ id: 'ingles-diario', nombre: 'Inglés diario', dias: ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'], medicion: 'pc', categoria: ['Estudio', 'Inglés'], minutos_meta: 15, tolerancia_min: 0 }],
  });
  const dia = expandirDia(plan, '2026-10-05');
  assert.deepEqual(dia.rutinas.find((r) => r.rutinaId === 'ingles-diario'), {
    id: 'ingles-diario@2026-10-05', rutinaId: 'ingles-diario', nombre: 'Inglés diario', medicion: 'pc', evento: null,
    inicio: null, fin: null, categoria: ['Estudio', 'Inglés'], minutosMeta: 15, toleranciaMin: 0,
  });
  // Las rutinas también aparecen el feriado.
  assert.ok(expandirDia(plan, '2026-10-08').rutinas.some((r) => r.rutinaId === 'ingles-diario'));
});

test('rutina checkin con franja, y con franja que cruza la medianoche', () => {
  const plan = planCon({ rutinas: [{ id: 'leer', nombre: 'Leer', dias: ['mar'], inicio: '23:00', fin: '00:30', medicion: 'checkin', tolerancia_min: 0 }] });
  const martes = expandirDia(plan, '2026-10-06');
  const ejercicio = martes.rutinas.find((r) => r.rutinaId === 'ejercicio');
  assert.deepEqual([ejercicio.inicio, ejercicio.fin, ejercicio.categoria, ejercicio.minutosMeta], [lima('2026-10-06', '19:30'), lima('2026-10-06', '20:30'), null, null]);
  const leer = martes.rutinas.find((r) => r.rutinaId === 'leer');
  assert.deepEqual([leer.inicio, leer.fin], [lima('2026-10-06', '23:00'), lima('2026-10-07', '00:30')]);
});

test('despertar y dormir: inicio = fin = la hora objetivo (dormir 01:00 es la madrugada siguiente)', () => {
  const sabado = expandirDia(planEjemplo(), '2026-10-10');
  const [despertar, dormir] = sabado.rutinas;
  assert.equal(despertar.rutinaId, 'despertar-finde');
  assert.equal(despertar.evento, 'despertar');
  assert.equal(despertar.inicio, lima('2026-10-10', '09:30'));
  assert.equal(despertar.fin, despertar.inicio);
  assert.equal(dormir.rutinaId, 'dormir');
  assert.equal(dormir.evento, 'dormir');
  assert.equal(dormir.inicio, lima('2026-10-11', '01:00'));
  assert.equal(dormir.fin, dormir.inicio);
  assert.equal(dormir.toleranciaMin, 30);
  // Sin hora objetivo: null (cumplimiento no la podrá medir).
  const sinHora = planCon({ rutinas: [{ id: 'dormir-2', nombre: 'Dormir', dias: ['sab'], medicion: 'dia_logico', tolerancia_min: 0 }] });
  const r = expandirDia(sinHora, '2026-10-10').rutinas.find((x) => x.rutinaId === 'dormir-2');
  assert.deepEqual([r.inicio, r.fin, r.evento], [null, null, 'dormir']);
});

// ── itemsEnCurso ──

test('itemsEnCurso en los bordes: [inicio, fin) incluye el inicio y no el fin', () => {
  const lunes = expandirDia(planEjemplo(), '2026-10-05');
  const bloqueId = (instante) => itemsEnCurso(lunes, instante).bloque?.bloqueId ?? null;
  assert.equal(bloqueId(lima('2026-10-05', '15:00') - 1), null);
  assert.equal(bloqueId(lima('2026-10-05', '15:00')), 'b-bd1-lun');
  assert.equal(bloqueId(lima('2026-10-05', '17:00') - 1), 'b-bd1-lun');
  assert.equal(bloqueId(lima('2026-10-05', '17:00')), null);
  // Dos clases seguidas: a las 10:00 ya es la segunda.
  assert.equal(itemsEnCurso(lunes, lima('2026-10-05', '10:00') - 1).clase.claseId, 'c-bd1-lun-0800');
  assert.equal(itemsEnCurso(lunes, lima('2026-10-05', '10:00')).clase.claseId, 'c-edo-lun-1000');
  assert.equal(itemsEnCurso(lunes, lima('2026-10-05', '12:00')).clase, null);
  // Devuelve el mismo objeto de la lista.
  assert.equal(itemsEnCurso(lunes, lima('2026-10-05', '16:00')).bloque, lunes.bloques[0]);
});

test('itemsEnCurso: rutinas solo con franja (nunca las de despertar y dormir ni las sin franja)', () => {
  const plan = planCon({ rutinas: [{ id: 'todo-el-dia', nombre: 'X', dias: ['lun'], medicion: 'checkin', tolerancia_min: 0 }] });
  const lunes = expandirDia(plan, '2026-10-05');
  assert.equal(itemsEnCurso(lunes, lima('2026-10-05', '21:30')).rutina.rutinaId, 'ingles-pc');
  assert.equal(itemsEnCurso(lunes, lima('2026-10-05', '22:00')).rutina, null);
  assert.equal(itemsEnCurso(lunes, lima('2026-10-05', '07:00')).rutina, null); // despertar
  assert.equal(itemsEnCurso(lunes, lima('2026-10-06', '01:00')).rutina, null); // dormir
  assert.deepEqual(itemsEnCurso(lunes, lima('2026-10-05', '13:00')), { bloque: null, clase: null, rutina: null });
});

test('itemsEnCurso: un bloque terminado antes deja de estar en curso a la hora real', () => {
  const plan = planEjemplo();
  plan.bloques[0].terminados_antes = [{ fecha: '2026-10-05', fin: '16:10', motivo: '' }];
  const lunes = expandirDia(plan, '2026-10-05');
  assert.equal(itemsEnCurso(lunes, lima('2026-10-05', '16:09')).bloque.bloqueId, 'b-bd1-lun');
  assert.equal(itemsEnCurso(lunes, lima('2026-10-05', '16:10')).bloque, null);
});

test('itemsEnCurso con varios días: un bloque de anoche que sigue pasada la medianoche', () => {
  const plan = planCon({ bloques: [bloque('b-lun-noche', ['lun'], '23:30', '00:30')] });
  const [lunes, martes] = expandirRango(plan, '2026-10-05', '2026-10-06');
  const instante = lima('2026-10-06', '00:10');
  assert.equal(itemsEnCurso([lunes, martes], instante).bloque.id, 'b-lun-noche@2026-10-05');
  assert.equal(itemsEnCurso(martes, instante).bloque, null);
  assert.deepEqual(itemsEnCurso(null, instante), { bloque: null, clase: null, rutina: null });
  assert.deepEqual(itemsEnCurso([], instante), { bloque: null, clase: null, rutina: null });
});

// ── proximoItem ──

test('proximoItem: lo primero que empieza estrictamente después del instante', () => {
  const [lunes, martes] = expandirRango(planEjemplo(), '2026-10-05', '2026-10-06');
  const proximo = (instante, dias = [lunes, martes]) => {
    const p = proximoItem(dias, instante);
    return p && [p.tipo, p.item.id];
  };
  assert.deepEqual(proximo(lima('2026-10-05', '07:00')), ['clase', 'c-bd1-lun-0800@2026-10-05']);
  assert.deepEqual(proximo(lima('2026-10-05', '08:00')), ['clase', 'c-edo-lun-1000@2026-10-05']); // a las 08:00 ya empezó
  assert.deepEqual(proximo(lima('2026-10-05', '10:00')), ['bloque', 'b-bd1-lun@2026-10-05']);
  // Después del último del lunes, lo primero del martes.
  assert.deepEqual(proximo(lima('2026-10-05', '15:00')), ['clase', 'c-dbp-mar-1400@2026-10-06']);
  assert.equal(proximo(lima('2026-10-05', '15:00'), [lunes]), null);
  assert.equal(proximo(lima('2026-10-06', '23:30')), null);
  // Un solo día también se acepta, y devuelve el mismo objeto.
  assert.equal(proximoItem(lunes, lima('2026-10-05', '07:00')).item, lunes.clases[0]);
  assert.equal(proximoItem([], 0), null);
  assert.equal(proximoItem(null, 0), null);
});

test('proximoItem: si un bloque y una clase empiezan a la vez, gana el bloque', () => {
  const plan = planCon({ bloques: [bloque('b-a-la-vez', ['lun'], '08:00', '09:00')] });
  const lunes = expandirDia(plan, '2026-10-05');
  const p = proximoItem([lunes], lima('2026-10-05', '07:59'));
  assert.equal(p.tipo, 'bloque');
  assert.equal(p.item.bloqueId, 'b-a-la-vez');
  // Aunque la clase venga en un día anterior de la lista.
  const soloClase = { ...lunes, bloques: [] };
  const soloBloque = { ...lunes, clases: [] };
  assert.equal(proximoItem([soloClase, soloBloque], lima('2026-10-05', '07:59')).tipo, 'bloque');
});

// ── expandirRango, entradas y pureza ──

test('expandirRango: un ItemsDelDia por día, igual que expandirDia', () => {
  const plan = planEjemplo();
  const semana = expandirRango(plan, '2026-10-05', '2026-10-11');
  assert.deepEqual(semana.map((d) => d.fecha), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  semana.forEach((d) => assert.deepEqual(d, expandirDia(plan, d.fecha)));
  assert.deepEqual(expandirRango(plan, '2026-10-11', '2026-10-05'), []);
  assert.equal(expandirRango(plan, '2026-10-05', '2026-10-05').length, 1);
  // Cada día tiene sus propias copias de las excepciones.
  const conRango = planCon({ excepciones: [{ desde: '2026-10-12', hasta: '2026-10-13', tipo: 'libre', efecto: 'cancelar_bloques' }] });
  const [d12, d13] = expandirRango(conRango, '2026-10-12', '2026-10-13');
  assert.notEqual(d12.excepciones[0], d13.excepciones[0]);
});

test('expandirDia no modifica el plan, y cambiar el resultado no cambia el plan', () => {
  const plan = planEjemplo();
  plan.bloques[0].terminados_antes = [{ fecha: '2026-10-05', fin: '16:10', motivo: 'x' }];
  const copia = structuredClone(plan);
  const dia = expandirDia(plan, '2026-10-05');
  expandirRango(plan, '2026-10-01', '2026-10-31');
  assert.deepEqual(plan, copia);
  dia.rutinas.find((r) => r.rutinaId === 'ingles-pc').categoria.push('Otra');
  const feriado = expandirDia(plan, '2026-10-08');
  feriado.excepciones[0].nota = 'cambiada';
  assert.deepEqual(plan, copia);
});

test('expandirDia acepta planes viejos o incompletos y salta lo que no se puede expandir', () => {
  assert.deepEqual(expandirDia(null, '2026-10-05'), {
    fecha: '2026-10-05', enCiclo: false, excepciones: [], bloques: [], clases: [], rutinas: [],
  });
  const plan = planEjemplo();
  plan.bloques[0].fin = '25:00';
  plan.bloques.push({ id: 'b-sin-repeticion', inicio: '18:00', fin: '19:00' });
  plan.clases[0] = { dias: ['lun'], inicio: '08:00', fin: '10:00' }; // sin curso: sin id
  plan.rutinas.push({ nombre: 'Sin id', dias: ['lun'] }, null);
  plan.excepciones.push({ desde: 'mañana', efecto: 'cancelar_bloques' });
  const lunes = expandirDia(plan, '2026-10-05');
  assert.deepEqual(lunes.bloques, []);
  assert.deepEqual(ids(lunes.clases), ['c-edo-lun-1000@2026-10-05']);
  assert.equal(lunes.rutinas.length, 3);
  assert.deepEqual(lunes.excepciones, []);
});

test('expandirDia y expandirRango lanzan TypeError con una fecha o un inicioDia inválidos', () => {
  assert.throws(() => expandirDia(planEjemplo(), '2026-02-30'), { name: 'TypeError', message: /fecha "2026-02-30" no es válida/ });
  assert.throws(() => expandirDia(planEjemplo(), undefined), TypeError);
  assert.throws(() => expandirDia(planEjemplo(), '2026-10-05', { inicioDia: '4:00' }), /inicioDia/);
  assert.throws(() => expandirRango(planEjemplo(), '2026-10-05', 'hoy'), TypeError);
  // Sin opciones (o null) se usa 04:00.
  assert.deepEqual(expandirDia(planEjemplo(), '2026-10-05', null), expandirDia(planEjemplo(), '2026-10-05'));
});

test('en los 14 días de ejemplo, todo lo que tiene franja dura más de 0', () => {
  for (const dia of expandirRango(planEjemplo(), FECHAS_EJEMPLO[0], FECHAS_EJEMPLO.at(-1))) {
    for (const item of [...dia.bloques, ...dia.clases]) {
      assert.ok(item.fin > item.inicio, item.id);
      assert.ok(item.fin - item.inicio <= 24 * HORA, item.id);
    }
    for (const r of dia.rutinas) if (r.medicion !== 'dia_logico' && r.inicio !== null) assert.ok(r.fin > r.inicio, r.id);
  }
});
