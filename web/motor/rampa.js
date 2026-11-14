// Rampa del foco (arquitectura §8 y §9, v6.4; propuesta de Dremy del 2026-11-14).
//
// Para formar el hábito, el foco que hace falta para que un bloque salga "cumplido" no es fijo: empieza bajo
// y sube un poco cada semana hasta llegar a una meta. Por ejemplo: 40 % → 70 %, +4 puntos por semana.
//
// - El umbral depende SOLO de la fecha: no baja si un día (o una semana) sale mal.
// - Cada día se evalúa con el umbral de SU fecha: el martes pasado se sigue midiendo con el umbral de ese martes.
// - La rampa vive en el plan, en `umbrales.rampas_foco`: una lista de versiones, cada una con el día lógico desde
//   el que vale (`aplica_desde`). Así se puede cambiar la rampa sin reescribir el pasado, y aflojarla queda
//   pendiente hasta mañana (misma asimetría que los niveles, §11). Nadie "activa" nada: lo vigente se calcula.
//
//   umbrales.rampas_foco = [
//     { aplica_desde: '2026-11-14', rampa: { inicio: '2026-11-14', valor_inicial: 0.4, meta: 0.7, paso_por_semana: 0.04 } },
//     { aplica_desde: '2026-12-01', rampa: null },   // rampa: null = sin rampa (vale el foco_cumplido fijo)
//   ]
//
// Funciones puras: no leen el reloj ni modifican lo que reciben.

import { esFechaValida, diasEntre, sumarDias } from './fechas.js';

/** Valores iniciales de la rampa (el `inicio` lo pone quien la crea: normalmente hoy). */
export const RAMPA_FOCO_INICIAL = Object.freeze({ valor_inicial: 0.4, meta: 0.7, paso_por_semana: 0.04 });

/** Días hacia adelante que se comparan para saber si un cambio de rampa endurece o afloja (2 años). */
const HORIZONTE_DIAS = 730;
const EPSILON = 1e-9;

/** 0.44000000000000006 → 0.44 (las sumas con decimales dejan "polvo"; con 4 decimales alcanza). */
const redondear = (x) => Math.round(x * 1e4) / 1e4;

const esProporcion = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1;

/**
 * Por qué una rampa no sirve (texto en español), o null si sirve.
 * @param {*} rampa  {inicio, valor_inicial, meta, paso_por_semana}
 * @returns {string|null}
 */
export function errorDeRampa(rampa) {
  if (rampa === null || typeof rampa !== 'object' || Array.isArray(rampa)) return 'la rampa tiene que ser un objeto con inicio, valor_inicial, meta y paso_por_semana.';
  if (!esFechaValida(rampa.inicio)) return 'la fecha de inicio de la rampa no es válida (usa AAAA-MM-DD).';
  if (!esProporcion(rampa.valor_inicial)) return 'el valor inicial de la rampa tiene que estar entre 0 y 1 (0.4 = 40 %).';
  if (!esProporcion(rampa.meta)) return 'la meta de la rampa tiene que estar entre 0 y 1 (0.7 = 70 %).';
  if (rampa.valor_inicial > rampa.meta) return 'el valor inicial de la rampa no puede ser mayor que su meta.';
  const paso = rampa.paso_por_semana;
  if (typeof paso !== 'number' || !Number.isFinite(paso) || paso < 0 || paso > 1) return 'el paso por semana de la rampa tiene que estar entre 0 y 1 (0.04 = 4 puntos).';
  return null;
}

/** Versiones bien formadas de la rampa, en el orden en que valen (por aplica_desde; en empate, la posterior). */
function versiones(umbrales) {
  const lista = Array.isArray(umbrales?.rampas_foco) ? umbrales.rampas_foco : [];
  return lista
    .map((v, indice) => ({ v, indice }))
    .filter(({ v }) => v && esFechaValida(v.aplica_desde) && (v.rampa === null || errorDeRampa(v.rampa) === null))
    .sort((a, b) => (a.v.aplica_desde < b.v.aplica_desde ? -1 : a.v.aplica_desde > b.v.aplica_desde ? 1 : a.indice - b.indice))
    .map(({ v }) => v);
}

/**
 * La rampa que vale en el día lógico `fecha`: la de la última versión con aplica_desde ≤ fecha.
 * @param {import('./tipos.js').Umbrales} umbrales
 * @param {string} fecha  'AAAA-MM-DD'
 * @returns {{inicio: string, valor_inicial: number, meta: number, paso_por_semana: number}|null}  null = sin rampa
 */
export function rampaVigente(umbrales, fecha) {
  let vigente = null;
  for (const version of versiones(umbrales)) {
    if (version.aplica_desde <= fecha) vigente = version.rampa;
  }
  return vigente;
}

/**
 * Foco que hace falta para "cumplido" en el día lógico `fecha` (0 a 1).
 * - Sin rampa vigente ese día (o antes de su `inicio`): el `foco_cumplido` fijo del plan.
 * - Con rampa: valor_inicial + paso_por_semana × semanas completas desde `inicio`, sin pasar de `meta`.
 *   La primera semana (días 0 a 6) vale valor_inicial; el día 7 sube el primer paso.
 * Solo depende de la fecha: fallar no lo baja.
 * @param {import('./tipos.js').Umbrales} umbrales
 * @param {string} fecha  'AAAA-MM-DD'
 * @returns {number}
 */
export function umbralFoco(umbrales, fecha) {
  const fijo = umbrales?.foco_cumplido ?? 0.7;
  const rampa = rampaVigente(umbrales, fecha);
  if (!rampa || fecha < rampa.inicio) return fijo;
  const semanas = Math.floor(diasEntre(rampa.inicio, fecha) / 7);
  return redondear(Math.min(rampa.meta, rampa.valor_inicial + rampa.paso_por_semana * semanas));
}

/**
 * Los umbrales con los que se evalúa el día `fecha`: los del plan, con foco_cumplido = umbralFoco(fecha).
 * Si la rampa deja el foco de "cumplido" por debajo del de "parcial", el de "parcial" baja con él.
 * @param {import('./tipos.js').Umbrales} umbrales
 * @param {string} fecha
 * @returns {import('./tipos.js').Umbrales}  copia (no modifica la entrada)
 */
export function umbralesDelDia(umbrales, fecha) {
  const foco = umbralFoco(umbrales, fecha);
  return { ...umbrales, foco_cumplido: foco, foco_parcial: Math.min(umbrales?.foco_parcial ?? 0.4, foco) };
}

/**
 * El cambio de rampa guardado que todavía no vale en `hoy` ("se aplica mañana"), o null.
 * @returns {{aplica_desde: string, rampa: object|null}|null}
 */
export function rampaPendiente(umbrales, hoy) {
  return versiones(umbrales).filter((v) => v.aplica_desde > hoy).at(-1) ?? null;
}

/**
 * Cambia la rampa con la asimetría de §11: si el cambio ENDURECE (pide más foco algún día y nunca menos) vale desde
 * `hoy`; si AFLOJA (pide menos foco algún día de aquí en adelante) queda pendiente hasta el día lógico siguiente.
 * - Se compara contra lo vigente hoy (no contra un cambio pendiente), día por día, de hoy a dos años.
 * - Un cambio pendiente anterior se reemplaza; volver a lo vigente hoy lo cancela.
 * - `rampa` null quita la rampa (vuelve al foco_cumplido fijo).
 * No modifica `umbrales`: devuelve una copia.
 * @param {import('./tipos.js').Umbrales} umbrales
 * @param {{inicio: string, valor_inicial: number, meta: number, paso_por_semana: number}|null} rampa
 * @param {{hoy: string}} cuando  día lógico actual
 * @returns {{umbrales: import('./tipos.js').Umbrales, aplicaDesde: string, inmediato: boolean, tipo: ('endurece'|'afloja'|'igual')}}
 * @throws {Error} si falta hoy o la rampa no sirve
 */
export function proponerRampa(umbrales, rampa, { hoy } = {}) {
  if (!esFechaValida(hoy)) throw new Error('Falta la fecha de hoy (AAAA-MM-DD)');
  if (rampa !== null) {
    const error = errorDeRampa(rampa);
    if (error) throw new Error(error[0].toUpperCase() + error.slice(1));
  }
  const vigentes = versiones(umbrales).filter((v) => v.aplica_desde <= hoy); // sin lo pendiente
  const actual = { ...umbrales, rampas_foco: vigentes };
  const nueva = { ...umbrales, rampas_foco: [{ aplica_desde: hoy, rampa }] };

  let sube = false;
  let baja = false;
  for (let d = 0; d <= HORIZONTE_DIAS; d++) {
    const fecha = sumarDias(hoy, d);
    const diferencia = umbralFoco(nueva, fecha) - umbralFoco(actual, fecha);
    if (diferencia > EPSILON) sube = true;
    else if (diferencia < -EPSILON) baja = true;
  }
  const tipo = baja ? 'afloja' : sube ? 'endurece' : 'igual';
  const aplicaDesde = tipo === 'afloja' ? sumarDias(hoy, 1) : hoy;

  let lista = vigentes.map((v) => structuredClone(v));
  if (tipo !== 'igual') {
    lista = lista.filter((v) => v.aplica_desde !== aplicaDesde); // una sola versión por día
    lista.push({ aplica_desde: aplicaDesde, rampa: rampa === null ? null : { inicio: rampa.inicio, valor_inicial: rampa.valor_inicial, meta: rampa.meta, paso_por_semana: rampa.paso_por_semana } });
  }
  const copia = { ...umbrales };
  if (lista.length) copia.rampas_foco = lista;
  else delete copia.rampas_foco;
  return { umbrales: copia, aplicaDesde, inmediato: aplicaDesde === hoy, tipo };
}

/**
 * Día en que la rampa llega a su meta (o null si no sube: paso 0 y valor inicial menor que la meta).
 * @returns {string|null}
 */
export function fechaDeMeta(rampa) {
  if (rampa.valor_inicial >= rampa.meta) return rampa.inicio;
  if (!(rampa.paso_por_semana > 0)) return null;
  const semanas = Math.ceil((rampa.meta - rampa.valor_inicial) / rampa.paso_por_semana - EPSILON);
  return sumarDias(rampa.inicio, semanas * 7);
}
