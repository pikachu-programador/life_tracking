// Resumen de tiempo activo por clase (provisional, F2-08): una lista simple con etiqueta y duración.
// F1-07 lo reemplaza en Hoy por la barra apilada; se mantiene como respaldo legible.
import { el } from './selector-fecha.js';
import { ORDEN_CLASES, duracionLegible, sumarPorClase } from '../formato.js';

const NOMBRES = { estudio: 'Estudio', ia: 'IA', neutral: 'Neutral', distraccion: 'Distracción', 'sin-clasificar': 'Sin clasificar' };

/** Tarjeta con el total activo y los minutos de cada clase. */
export function crearResumenClases(eventos, titulo = 'Tiempo activo') {
  const { total, porClase } = sumarPorClase(eventos);
  const filas = ORDEN_CLASES.filter((c) => porClase[c] > 0).map((c) =>
    el('li', {},
      el('span', { class: 'etiqueta', 'data-clase': c }, NOMBRES[c]),
      el('span', { class: 'valor' }, `${duracionLegible(porClase[c])} · ${Math.round((100 * porClase[c]) / total)} %`)));
  return el('section', { class: 'tarjeta' },
    el('h3', { class: 'tarjeta-titulo' }, titulo),
    el('div', { class: 'kpi' }, el('span', { class: 'kpi-valor' }, duracionLegible(total))),
    filas.length ? el('ul', { class: 'lista-totales' }, ...filas) : el('p', {}, 'Sin actividad registrada.'));
}

/** Texto pequeño que dice de dónde salieron los datos y cuánto tardaron (sirve para comprobar la caché). */
export function crearNotaCarga(origenes, ms) {
  const desdeCache = origenes.every(Boolean);
  const nota = el('p', { class: 'nota-carga', 'data-origen': desdeCache ? 'cache' : 'aw', 'data-ms': ms.toFixed(1) },
    desdeCache ? `De la caché en ${ms.toFixed(0)} ms.` : `Consultado a ActivityWatch en ${ms.toFixed(0)} ms.`);
  return nota;
}
