// Selectores de fecha (F2-08): un día, o un rango de días.
// No guardan estado propio: muestran la fecha que reciben y avisan con `alCambiar`.
// Las vistas usan irAParametros() para poner la fecha en la dirección (#/hoy?fecha=...).
//
// (V-04) Ahora son dos casos del selector de período (componentes/selector-periodo.js): el de un día es el
// selector con solo "Día", y el de rango, con solo "Rango". Se mantienen con la misma forma de uso para las
// vistas que ya los usan; las vistas nuevas usan crearSelectorPeriodo directamente.

import { periodoDe } from '../fechas.js';
import { crearSelectorPeriodo } from './selector-periodo.js';

// el() se mudó a js/dom.js (lo usan todas las vistas); se reexporta para quien lo importaba desde aquí.
export { el } from '../dom.js';

/**
 * Selector de un día:  [‹]  sábado, 31 de octubre de 2026 · hoy  [›]  [Hoy]
 * (clic en el texto: calendario para elegir otro día; teclas ← y →: día anterior y siguiente)
 * @param {{ fecha: string, hoy: string, alCambiar: (fecha: string) => void }} opciones
 */
export function crearSelectorFecha({ fecha, hoy, alCambiar }) {
  return crearSelectorPeriodo({
    periodo: periodoDe('dia', fecha), hoy, tipos: ['dia'],
    alCambiar: (periodo) => alCambiar(periodo.desde),
  });
}

/**
 * Selector de rango:  Desde [ ]  Hasta [ ]  [Últimos 7 días] [Últimos 30 días]
 * (además, ‹ y › corren el rango su mismo largo; nunca pasa de hoy)
 * @param {{ desde: string, hasta: string, hoy: string, alCambiar: (desde: string, hasta: string) => void }} opciones
 */
export function crearSelectorRango({ desde, hasta, hoy, alCambiar }) {
  return crearSelectorPeriodo({
    periodo: periodoDe('rango', desde, hasta), hoy, tipos: ['rango'], rapidos: [7, 30],
    alCambiar: (periodo) => alCambiar(periodo.desde, periodo.hasta),
  });
}
