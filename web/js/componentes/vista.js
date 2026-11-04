// Piezas comunes de todas las vistas (V-11): la cabecera y el texto de los errores.
// Los estados de carga, vacío y error (con su dibujo) están en componentes/ui.js (V-10).

import { el } from '../dom.js';

/**
 * Cabecera de una vista: título y subtítulo a la izquierda; selector de período y acciones a la derecha.
 *   crearCabecera({ titulo: 'Hoy', subtitulo: 'miércoles, 14 de octubre', acciones: [selector, boton] })
 * @param {{titulo: string, subtitulo?: string|Node, acciones?: Node[]}} opciones
 * @returns {HTMLElement}  con .subtitulo y .acciones accesibles para cambiarlos después
 */
export function crearCabecera({ titulo, subtitulo = '', acciones = [] }) {
  const sub = el('p', { class: 'vista-subtitulo' }, subtitulo);
  const zonaAcciones = el('div', { class: 'vista-acciones' }, acciones);
  const cabecera = el('header', { class: 'vista-cabecera' }, el('div', {}, el('h1', {}, titulo), sub), zonaAcciones);
  cabecera.subtitulo = sub;
  cabecera.acciones = zonaAcciones;
  return cabecera;
}

/**
 * Texto corto y entendible para un error al cargar datos.
 * Si AW no responde, el aviso de arriba (app.js) ya lo dice: aquí basta una frase sin detalles técnicos.
 * @param {Error} error
 * @returns {string}
 */
export function textoDeError(error) {
  if (error?.name === 'ErrorAW' && error.tipo === 'sin-conexion') return 'No hay datos porque ActivityWatch no responde.';
  if (error?.name === 'ErrorAW' && error.estado === 404) return 'ActivityWatch no tiene esos datos (respondió 404).';
  if (error?.name === 'ErrorPlan') return 'El plan tiene errores: revísalo en Horario.';
  return 'No se pudieron cargar los datos: ' + (error?.message ?? String(error));
}
