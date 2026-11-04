// Pruebas de web/motor/checkins.js (F2-01): eventos del bucket rastreador-checkins → Checkin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarCheckins, instanteDeCheckin, ultimoCheckin } from '../web/motor/checkins.js';
import { instanteLocal } from '../web/motor/fechas.js';
import { eventosEjemplo } from './ayudantes/ejemplo.js';

/** Evento de check-in como los guarda AW (duración 0). */
const evento = (timestamp, data, id) => ({ ...(id === undefined ? {} : { id }), timestamp, duration: 0, data });

test('normalizarCheckins con los check-ins de ejemplo: ordenados y con la fecha del día de AW', () => {
  const checkins = normalizarCheckins(eventosEjemplo('rastreador-checkins_ejemplo'));
  assert.equal(checkins.length, 8);
  for (let i = 1; i < checkins.length; i++) assert.ok(checkins[i - 1].instante <= checkins[i].instante);
  assert.deepEqual(checkins[0], {
    id: null, instante: Date.parse('2026-10-05T11:50:00Z'), fecha: '2026-10-05', tipo: 'despertar', refId: 'despertar',
    valor: '06:45', nota: '',
  });
  // Papel de las 21:31 del 7 (02:31 UTC del 8): su fecha es el 7.
  const papel = checkins.find((c) => c.instante === Date.parse('2026-10-08T02:31:00Z'));
  assert.equal(papel.fecha, '2026-10-07');
  assert.equal(papel.refId, 'b-edo-mie');
  // La rutina de las 20:00 del 13 es del 13 (el día sin datos de la PC).
  assert.equal(checkins.find((c) => c.tipo === 'rutina').fecha, '2026-10-13');
  assert.deepEqual(checkins.filter((c) => c.tipo === 'despertar').map((c) => [c.fecha, c.valor]),
    [['2026-10-05', '06:45'], ['2026-10-06', '10:20'], ['2026-10-17', '09:05']]);
});

test('normalizarCheckins: data.fecha manda si es válida; tipos desconocidos y timestamps inválidos se descartan', () => {
  const eventos = [
    evento('2026-10-20T06:00:00Z', { tipo: 'despertar', valor: '07:10', fecha: '2026-10-19' }),     // corrige el 19
    evento('2026-10-20T06:00:00Z', { tipo: 'dormir', valor: '23:50', fecha: '19-10-2026' }),        // fecha inválida → diaDe
    evento('2026-10-20T12:00:00Z', { tipo: 'siesta', valor: '13:00' }),                             // tipo desconocido
    evento('no es una fecha', { tipo: 'rutina', ref_id: 'ejercicio', valor: 'hecho' }),
    evento('2026-10-20T13:00:00Z', {}),
  ];
  const checkins = normalizarCheckins(eventos);
  assert.deepEqual(checkins.map((c) => [c.tipo, c.fecha]), [['despertar', '2026-10-19'], ['dormir', '2026-10-19']]);
  // 06:00 UTC del 20 = 01:00 en Lima: todavía es el día de AW 19. Con inicioDia '00:00', ya es el 20.
  assert.equal(normalizarCheckins([eventos[1]], '00:00')[0].fecha, '2026-10-20');
});

test('normalizarCheckins: refId, valor, nota e id', () => {
  const [dormir, papel, rutina] = normalizarCheckins([
    evento('2026-10-20T15:00:00Z', { tipo: 'dormir', valor: '1:05' }, 7),
    evento('2026-10-20T16:00:00Z', { tipo: 'papel', ref_id: 'b-edo-vie', valor: 'hecho', nota: 'guía 3' }, 8),
    evento('2026-10-20T17:00:00Z', { tipo: 'rutina', ref_id: '', valor: 5 }),
  ]);
  assert.deepEqual(dormir, {
    id: 7, instante: Date.parse('2026-10-20T15:00:00Z'), fecha: '2026-10-20', tipo: 'dormir', refId: 'dormir', valor: '01:05', nota: '',
  });
  assert.equal(papel.refId, 'b-edo-vie');
  assert.equal(papel.nota, 'guía 3');
  assert.equal(papel.id, 8);
  assert.equal(rutina.refId, 'rutina'); // ref_id vacío: el tipo
  assert.equal(rutina.valor, '5');
  assert.equal(rutina.id, null);
});

test('normalizarCheckins: mismo instante → por id; sin id, en el orden de llegada. No modifica la entrada', () => {
  const t = '2026-10-20T15:00:00Z';
  const eventos = [
    evento(t, { tipo: 'rutina', ref_id: 'b', valor: 'hecho' }, 12),
    evento(t, { tipo: 'rutina', ref_id: 'a', valor: 'hecho' }, 11),
    evento('2026-10-20T14:00:00Z', { tipo: 'rutina', ref_id: 'antes', valor: 'hecho' }),
  ];
  const copia = structuredClone(eventos);
  assert.deepEqual(normalizarCheckins(eventos).map((c) => c.refId), ['antes', 'a', 'b']);
  assert.deepEqual(eventos, copia);
  assert.deepEqual(normalizarCheckins([]), []);
  assert.deepEqual(normalizarCheckins(undefined), []);
});

test('instanteDeCheckin: despertar es esa hora del día calendario', () => {
  const despertar = { fecha: '2026-10-20', tipo: 'despertar', valor: '06:45' };
  assert.equal(instanteDeCheckin(despertar), instanteLocal('2026-10-20', '06:45'));
  assert.equal(instanteDeCheckin({ ...despertar, valor: '02:00' }), instanteLocal('2026-10-20', '02:00')); // mismo día
});

test('instanteDeCheckin: dormir es el primer instante con esa hora después del inicio del día', () => {
  const dormir = (valor) => ({ fecha: '2026-10-18', tipo: 'dormir', valor });
  // Sin despuesDe: después de S (el 18 a las 04:00).
  assert.equal(instanteDeCheckin(dormir('23:30')), instanteLocal('2026-10-18', '23:30'));
  assert.equal(instanteDeCheckin(dormir('01:30')), instanteLocal('2026-10-19', '01:30'));
  assert.equal(instanteDeCheckin(dormir('04:00')), instanteLocal('2026-10-19', '04:00')); // justo S no cuenta: después
  // Con el inicio del día lógico (10:30 del 18): '04:30' es la madrugada del 19 (trasnoche).
  const inicio = instanteLocal('2026-10-18', '10:30');
  assert.equal(instanteDeCheckin(dormir('04:30'), '04:00', { despuesDe: inicio }), instanteLocal('2026-10-19', '04:30'));
  assert.equal(instanteDeCheckin(dormir('22:00'), '04:00', { despuesDe: inicio }), instanteLocal('2026-10-18', '22:00'));
  // Con otro inicio de día de AW.
  assert.equal(instanteDeCheckin(dormir('01:30'), '00:00'), instanteLocal('2026-10-18', '01:30'));
});

test('instanteDeCheckin: null si no es despertar ni dormir, o si la hora o la fecha no son válidas', () => {
  assert.equal(instanteDeCheckin({ fecha: '2026-10-18', tipo: 'rutina', valor: '10:00' }), null);
  assert.equal(instanteDeCheckin({ fecha: '2026-10-18', tipo: 'dormir', valor: '25:00' }), null);
  assert.equal(instanteDeCheckin({ fecha: '2026-10-18', tipo: 'despertar', valor: 'temprano' }), null);
  assert.equal(instanteDeCheckin({ fecha: '18/10', tipo: 'despertar', valor: '07:00' }), null);
  assert.equal(instanteDeCheckin(null), null);
});

test('ultimoCheckin: entre varios del mismo tipo y fecha manda el de mayor instante', () => {
  const c = (instante, tipo, fecha, refId = tipo) => ({ id: null, instante, fecha, tipo, refId, valor: 'x', nota: '' });
  const corregido = c(300, 'despertar', '2026-10-20');
  const checkins = [c(100, 'despertar', '2026-10-20'), corregido, c(200, 'despertar', '2026-10-20'),
    c(400, 'despertar', '2026-10-21'), c(500, 'dormir', '2026-10-20')];
  assert.equal(ultimoCheckin(checkins, 'despertar', '2026-10-20'), corregido);
  assert.equal(ultimoCheckin(checkins, 'despertar', '2026-10-22'), null);
  // Mismo instante: el que va después en la lista.
  const segundo = c(300, 'despertar', '2026-10-20');
  assert.equal(ultimoCheckin([...checkins, segundo], 'despertar', '2026-10-20'), segundo);
  // Con refId (rutina, papel, asistencia).
  const rutinas = [c(100, 'rutina', '2026-10-20', 'ejercicio'), c(200, 'rutina', '2026-10-20', 'ingles')];
  assert.equal(ultimoCheckin(rutinas, 'rutina', '2026-10-20', 'ejercicio'), rutinas[0]);
  assert.equal(ultimoCheckin(rutinas, 'rutina', '2026-10-20'), rutinas[1]);
  assert.equal(ultimoCheckin(undefined, 'rutina', '2026-10-20'), null);
});
