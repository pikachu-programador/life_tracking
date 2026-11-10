// Pruebas de web/js/planificador.js (F3-05): lo planificado de cada día → cajas con posición.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { disponerSemana, horaDeRelativo, franjaDeClic } from '../web/js/planificador.js';
import { expandirRango } from '../web/motor/horario.js';
import { normalizarPlan } from '../web/motor/plan.js';
import { planEjemplo } from './ayudantes/ejemplo.js';

const semana = (desde = '2026-10-12', hasta = '2026-10-18', plan = planEjemplo()) => disponerSemana(expandirRango(plan, desde, hasta));
const corto = (caja) => [caja.tipo, horaDeRelativo(caja.desdeMin), horaDeRelativo(caja.hastaMin), caja.columna, caja.columnas];

test('la semana de ejemplo: 7 días, cada caja con su hora y sin salirse del tramo', () => {
  const { dias, desdeMin, hastaMin } = semana();
  assert.equal(dias.length, 7);
  assert.deepEqual(dias.map((d) => d.fecha), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  for (const dia of dias) {
    for (const caja of dia.cajas) {
      assert.ok(caja.hastaMin > caja.desdeMin);
      assert.ok(caja.desdeMin >= desdeMin && caja.hastaMin <= hastaMin, `${dia.fecha} ${caja.tipo} dentro del tramo`);
      assert.ok(caja.columna < caja.columnas);
    }
  }
  // Lunes 12: clases de 08:00 y 10:00, y el bloque de BD I de 15:00 a 17:00.
  const lunes = dias[0].cajas.map(corto);
  assert.deepEqual(lunes.filter((c) => c[0] === 'clase').map((c) => c[1]), ['08:00', '10:00']);
  assert.deepEqual(lunes.find((c) => c[0] === 'bloque'), ['bloque', '15:00', '17:00', 0, 1]);
  // El tramo son horas enteras.
  assert.equal(desdeMin % 60, 0);
  assert.equal(hastaMin % 60, 0);
});

test('un bloque que cruza la medianoche queda entero en la columna de su día y amplía el tramo', () => {
  const { dias, hastaMin } = semana();
  const martes = dias[1];
  const noche = martes.cajas.find((c) => c.tipo === 'bloque' && c.item.bloqueId === 'b-p3-mar-noche');
  assert.deepEqual([horaDeRelativo(noche.desdeMin), horaDeRelativo(noche.hastaMin)], ['23:30', '00:30']);
  assert.equal(noche.hastaMin - noche.desdeMin, 60);
  assert.ok(hastaMin >= noche.hastaMin); // por defecto termina a las 23:00; aquí llega a la 01:00
  assert.equal(horaDeRelativo(hastaMin), '01:00');
});

test('despertar y dormir son marcas; las rutinas con franja, cajas; las sin franja van aparte', () => {
  const plan = planEjemplo();
  plan.rutinas.push({ id: 'ingles-diario', nombre: 'Inglés diario', dias: ['lun'], medicion: 'pc', categoria: ['Estudio', 'Inglés'], minutos_meta: 15, tolerancia_min: 0 });
  const { dias } = semana('2026-10-12', '2026-10-12', plan);
  const [lunes] = dias;
  assert.deepEqual(lunes.marcas.map((m) => [m.item.evento, horaDeRelativo(m.desdeMin)]).sort(), [['despertar', '07:00'], ['dormir', '01:00']]);
  assert.deepEqual(lunes.cajas.filter((c) => c.tipo === 'rutina').map(corto), [['rutina', '21:00', '22:00', 0, 1]]);
  assert.deepEqual(lunes.sinFranja.map((r) => r.rutinaId), ['ingles-diario']);
});

test('las cajas que se solapan se reparten en columnas; las que solo se tocan, no', () => {
  const plan = normalizarPlan({
    ciclo: { nombre: 'x', inicio: '2026-10-01', fin: '2026-10-31' },
    cursos: [{ id: 'a', nombre: 'A', area: ['Estudio', 'Programación'], meta_horas_semana: 1, prioridad: 'media' }],
    clases: [{ curso: 'a', tipo: 'teoria', dias: ['lun'], inicio: '10:00', fin: '12:00' }],
    bloques: [
      { id: 'b1', tipo: 'estudio_pc', curso: 'a', repeticion: { tipo: 'semanal', dias: ['lun'] }, inicio: '11:00', fin: '13:00', nivel: 'aviso' },
      { id: 'b2', tipo: 'estudio_pc', curso: 'a', repeticion: { tipo: 'semanal', dias: ['lun'] }, inicio: '12:30', fin: '14:00', nivel: 'aviso' },
      { id: 'b3', tipo: 'estudio_pc', curso: 'a', repeticion: { tipo: 'semanal', dias: ['lun'] }, inicio: '14:00', fin: '15:00', nivel: 'aviso' },
    ],
  });
  const [lunes] = semana('2026-10-12', '2026-10-12', plan).dias;
  assert.deepEqual(lunes.cajas.map(corto), [
    ['clase', '10:00', '12:00', 0, 2],
    ['bloque', '11:00', '13:00', 1, 2],
    ['bloque', '12:30', '14:00', 0, 2],   // la columna 0 quedó libre a las 12:00
    ['bloque', '14:00', '15:00', 0, 1],   // empieza justo cuando termina el grupo: columna entera
  ]);
});

test('una semana sin nada planificado usa el tramo por defecto (07:00 a 23:00)', () => {
  const { dias, desdeMin, hastaMin } = semana('2026-10-12', '2026-10-18', normalizarPlan({})); // plan vacío
  assert.equal(dias.every((d) => d.cajas.length === 0 && d.marcas.length === 0), true);
  // Fuera del ciclo no hay clases ni bloques semanales (las rutinas siguen).
  assert.equal(semana('2027-03-01', '2027-03-07').dias.every((d) => d.cajas.every((c) => c.tipo === 'rutina')), true);
  assert.deepEqual([horaDeRelativo(desdeMin), horaDeRelativo(hastaMin)], ['07:00', '23:00']);
  assert.deepEqual(disponerSemana([]), { dias: [], desdeMin: 180, hastaMin: 1140 });
});

test('franjaDeClic redondea a media hora y propone 90 min; horaDeRelativo da la vuelta a la medianoche', () => {
  assert.deepEqual(franjaDeClic(11 * 60 + 17), { inicio: '15:00', fin: '16:30' });  // 15:17 → 15:00
  assert.deepEqual(franjaDeClic(11 * 60 + 45), { inicio: '15:30', fin: '17:00' });
  assert.deepEqual(franjaDeClic(19 * 60), { inicio: '23:00', fin: '00:30' });
  assert.deepEqual(franjaDeClic(-20), { inicio: '04:00', fin: '05:30' });
  assert.equal(horaDeRelativo(0), '04:00');
  assert.equal(horaDeRelativo(20 * 60), '00:00');
  assert.equal(horaDeRelativo(600, '00:00'), '10:00');
});
