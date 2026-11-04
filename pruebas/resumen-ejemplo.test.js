// Prueba de integración de V-01: el día completo con los datos de ejemplo, como lo arma el dashboard (§6.7):
// datos de AW (D−1, D, D+1) → segmentar → unir → día lógico → recortar → resumirDia, contra verdad.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datosDiaEjemplo } from './ayudantes/dia-ejemplo.js';
import { FECHAS_EJEMPLO, planEjemplo, eventosEjemplo, verdadDelDia } from './ayudantes/ejemplo.js';
import { segmentar, unirSegmentos, recortarSegmentos } from '../web/motor/segmentos.js';
import { normalizarCheckins } from '../web/motor/checkins.js';
import { calcularDiaLogico } from '../web/motor/dia-logico.js';
import { resumirDia } from '../web/motor/resumen.js';
import { periodoDelDia, sumarDias } from '../web/motor/fechas.js';

const plan = planEjemplo();
const checkins = normalizarCheckins(eventosEjemplo('rastreador-checkins_ejemplo'));
const min = (s) => Math.round(s / 60);

function segmentosAW(fecha) {
  const [inicio, fin] = periodoDelDia(fecha);
  return segmentar(datosDiaEjemplo(fecha), { inicio: inicio.getTime(), fin: fin.getTime() });
}

function resumen(fecha) {
  const todos = unirSegmentos(segmentosAW(sumarDias(fecha, -1)), segmentosAW(fecha), segmentosAW(sumarDias(fecha, 1)));
  const dia = calcularDiaLogico({ fecha, segmentos: todos, checkins });
  return resumirDia(recortarSegmentos(todos, dia.inicio, dia.fin), plan, checkins.filter((c) => c.fecha === fecha), dia);
}

// Diferencias explicadas (las mismas que en clasificacion-ejemplo.test.js):
// - 10-10: la clase grabada de EDO sonó 90 min sin teclado; AW la cuenta como actividad (pestaña con audio), así que
//   suma a Estudio > Matemáticas, mientras verdad.json la anota como "Estudio (sin teclado)".
// - 10-15: un título raro de VS Code que el generador anota como Sin clasificar cuenta como Programación (68 min).
const EXPLICADO = { '2026-10-10': { Matemáticas: 90 }, '2026-10-15': { Programación: 68 } };

test('Estudio por área e IA de cada día coinciden con verdad.json (±2 min, salvo lo explicado)', () => {
  for (const fecha of FECHAS_EJEMPLO) {
    const r = resumen(fecha);
    const verdad = verdadDelDia(fecha).minutos_por_clase_y_area;
    for (const [clave, esperados] of Object.entries(verdad)) {
      if (!clave.startsWith('Estudio/')) continue;
      const area = clave.slice('Estudio/'.length);
      const obtenidos = min(r.porArea[area] ?? 0) - (EXPLICADO[fecha]?.[area] ?? 0);
      assert.ok(Math.abs(obtenidos - esperados) <= 2, `${fecha} ${area}: ${obtenidos} contra ${esperados}`);
    }
    assert.ok(Math.abs(min(r.porEstado.ia) - (verdad.IA ?? 0)) <= 2, `${fecha} IA`);
  }
});

test('el estudio en papel coincide con "Estudio (sin teclado)" de verdad.json (salvo el video del 10-10)', () => {
  for (const fecha of FECHAS_EJEMPLO) {
    if (fecha === '2026-10-10') continue; // ese "sin teclado" es el video con audio, no papel
    const esperados = verdadDelDia(fecha).minutos_por_clase_y_area['Estudio (sin teclado)'] ?? 0;
    assert.ok(Math.abs(min(resumen(fecha).papelSeg) - esperados) <= 2, fecha);
  }
});

test('casos: trasnoche, día sin datos y feriado', () => {
  const trasnoche = resumen('2026-10-18');
  assert.equal(new Date(trasnoche.dia.fin).toISOString(), '2026-10-19T09:30:00.000Z'); // 04:30 del 19 en Lima
  for (const hora of trasnoche.porHora) {
    const total = Object.values(hora.estados).reduce((a, b) => a + b, 0);
    assert.ok(total <= 3600 + 1e-6);
  }
  const sinDatos = resumen('2026-10-13');
  assert.equal(sinDatos.sinDatos, true);
  assert.equal(sinDatos.activoSeg, 0);
  const feriado = resumen('2026-10-08');
  assert.equal(feriado.bloques.length, 0);
  assert.equal(feriado.clasesSeg, 0);
  assert.ok(feriado.porEstado.distraccion > 3 * 3600); // mucha distracción en tiempo libre, que no es fallo
});
