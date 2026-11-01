// Selectores de fecha (F2-08): un día, o un rango de días.
// No guardan estado propio: muestran la fecha que reciben y avisan con `alCambiar`.
// Las vistas usan irAParametros() para poner la fecha en la dirección (#/hoy?fecha=...).

import { sumarDias, fechaLegible, esFechaValida } from '../fechas.js';

/** Crea un elemento a partir de etiqueta, atributos e hijos (atajo para no repetir createElement). */
function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributos)) {
    if (k.startsWith('on')) nodo.addEventListener(k.slice(2), v);
    else if (v === true) nodo.setAttribute(k, '');
    else if (v !== false && v !== undefined) nodo.setAttribute(k, v);
  }
  nodo.append(...hijos);
  return nodo;
}

/**
 * Selector de un día:  [‹]  [ 31/10/2026 ]  [›]  [Hoy]   sábado, 31 de octubre de 2026
 * @param {{ fecha: string, hoy: string, alCambiar: (fecha: string) => void }} opciones
 */
export function crearSelectorFecha({ fecha, hoy, alCambiar }) {
  const cambiar = (nueva) => {
    if (esFechaValida(nueva) && nueva <= hoy && nueva !== fecha) alCambiar(nueva);
  };
  const campo = el('input', {
    type: 'date', value: fecha, max: hoy, 'aria-label': 'Fecha',
    onchange: (e) => cambiar(e.target.value),
  });
  return el('div', { class: 'selector-fecha' },
    el('button', { class: 'boton', type: 'button', title: 'Día anterior', onclick: () => cambiar(sumarDias(fecha, -1)) }, '‹'),
    campo,
    el('button', { class: 'boton', type: 'button', title: 'Día siguiente', disabled: fecha >= hoy, onclick: () => cambiar(sumarDias(fecha, 1)) }, '›'),
    el('button', { class: 'boton', type: 'button', disabled: fecha === hoy, onclick: () => cambiar(hoy) }, 'Hoy'),
    el('span', { class: 'selector-fecha-texto' }, fechaLegible(fecha) + (fecha === hoy ? ' (hoy)' : '')),
  );
}

/**
 * Selector de rango:  Desde [ ]  Hasta [ ]  [Últimos 7 días] [Últimos 30 días]
 * @param {{ desde: string, hasta: string, hoy: string, alCambiar: (desde: string, hasta: string) => void }} opciones
 */
export function crearSelectorRango({ desde, hasta, hoy, alCambiar }) {
  const cambiar = (d, h) => {
    if (!esFechaValida(d) || !esFechaValida(h)) return;
    if (h > hoy) h = hoy;
    if (d > h) [d, h] = [h, d]; // si se eligen al revés, se ordenan
    alCambiar(d, h);
  };
  const campoDesde = el('input', { type: 'date', value: desde, max: hoy, 'aria-label': 'Desde', onchange: (e) => cambiar(e.target.value, hasta) });
  const campoHasta = el('input', { type: 'date', value: hasta, max: hoy, 'aria-label': 'Hasta', onchange: (e) => cambiar(desde, e.target.value) });
  return el('div', { class: 'selector-fecha' },
    el('label', {}, 'Desde ', campoDesde),
    el('label', {}, 'Hasta ', campoHasta),
    el('button', { class: 'boton', type: 'button', onclick: () => cambiar(sumarDias(hoy, -6), hoy) }, 'Últimos 7 días'),
    el('button', { class: 'boton', type: 'button', onclick: () => cambiar(sumarDias(hoy, -29), hoy) }, 'Últimos 30 días'),
  );
}

export { el };
