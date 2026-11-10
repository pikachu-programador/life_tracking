// Pruebas de web/js/calculos-vistas.js: lo que las vistas calculan a partir de los datos del motor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDelDia, estadoDeFoco, focoPorBloque } from '../web/js/calculos-vistas.js';
import { UMBRALES_INICIALES } from '../web/motor/plan.js';

// ── Cumplimiento (F4-08) ──

test('estadoDelDia: cumplido desde el umbral, parcial desde la mitad, fallido debajo; sin nada medible, null', () => {
  assert.equal(estadoDelDia(1, 0.8), 'cumplido');
  assert.equal(estadoDelDia(0.8, 0.8), 'cumplido');
  assert.equal(estadoDelDia(0.79, 0.8), 'parcial');
  assert.equal(estadoDelDia(0.4, 0.8), 'parcial');
  assert.equal(estadoDelDia(0.39, 0.8), 'fallido');
  assert.equal(estadoDelDia(0, 0.8), 'fallido');
  assert.equal(estadoDelDia(null, 0.8), null);
  assert.equal(estadoDelDia(undefined, 0.8), null);
});

test('estadoDeFoco usa los umbrales del plan', () => {
  assert.equal(estadoDeFoco(0.7, UMBRALES_INICIALES), 'cumplido');
  assert.equal(estadoDeFoco(0.69, UMBRALES_INICIALES), 'parcial');
  assert.equal(estadoDeFoco(0.4, UMBRALES_INICIALES), 'parcial');
  assert.equal(estadoDeFoco(0.1, UMBRALES_INICIALES), 'fallido');
});

test('focoPorBloque: junta por bloque del plan, promedia foco y retraso, y deja fuera lo que no se midió', () => {
  const b = (bloqueId, estado, foco, retrasoMin = null, tipo = 'estudio_pc') => ({ bloqueId, curso: 'bd1', tipo, estado, foco, retrasoMin });
  const resumenes = [
    { bloques: [b('b-lun', 'cumplido', 0.9, 0), b('b-papel', 'cumplido', null, null, 'estudio_papel')] },
    { bloques: [b('b-lun', 'fallido', 0.1, 30), b('b-lun', 'pendiente', null), b('b-lun', 'en_curso', 0.5)] },
    { bloques: [b('b-lun', 'parcial', 0.5)] },
    { /* día sin bloques */ },
  ];
  const [lun, papel] = focoPorBloque(resumenes);
  assert.deepEqual({ ...lun, foco: Math.round(lun.foco * 100) }, {
    bloqueId: 'b-lun', curso: 'bd1', tipo: 'estudio_pc', veces: 3, cumplido: 1, parcial: 1, fallido: 1, foco: 50, retrasoMin: 15,
  });
  assert.deepEqual(papel, { bloqueId: 'b-papel', curso: 'bd1', tipo: 'estudio_papel', veces: 1, cumplido: 1, parcial: 0, fallido: 0, foco: null, retrasoMin: null });
  assert.deepEqual(focoPorBloque([]), []);
});

// ── Rachas por rutina (F5-05) ──

test('rutinasDelPeriodo: un estado por día (null si no tocaba) y la cuenta de días medidos', async () => {
  const { rutinasDelPeriodo } = await import('../web/js/calculos-vistas.js');
  const r = (rutinaId, estado, nombre = rutinaId) => ({ rutinaId, nombre, medicion: 'checkin', estado });
  const resumenes = [
    { fecha: '2026-10-12', rutinas: [r('ingles', 'cumplido'), r('ejercicio', 'fallido')] },
    { fecha: '2026-10-13', rutinas: [r('ingles', 'parcial')] },
    { fecha: '2026-10-14', rutinas: [r('ingles', 'pendiente'), r('ejercicio', 'cumplido')] },
    { fecha: '2026-10-15' },
  ];
  const [ingles, ejercicio] = rutinasDelPeriodo(resumenes);
  assert.deepEqual(ingles, {
    rutinaId: 'ingles', nombre: 'ingles', medicion: 'checkin', medidos: 2, cumplido: 1, parcial: 1, fallido: 0,
    dias: [
      { fecha: '2026-10-12', estado: 'cumplido' }, { fecha: '2026-10-13', estado: 'parcial' },
      { fecha: '2026-10-14', estado: 'pendiente' }, { fecha: '2026-10-15', estado: null },
    ],
  });
  assert.deepEqual([ejercicio.medidos, ejercicio.cumplido, ejercicio.fallido], [2, 1, 1]);
  assert.deepEqual(ejercicio.dias.map((d) => d.estado), ['fallido', null, 'cumplido', null]);
  assert.deepEqual(rutinasDelPeriodo([]), []);
});
