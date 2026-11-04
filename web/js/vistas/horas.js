// Vista "Horas del día" (arquitectura §13). Barras por hora, mapa de calor y reloj de 24 h.
// Por ahora (F2-08): selector de rango y un resumen provisional por clase y por día. Se completa en la fase 2.

import { almacen } from '../almacen.js';
import { reloj } from '../reloj.js';
import { diaDe, esFechaValida, sumarDias, fechaCorta } from '../fechas.js';
import { irAParametros } from '../router.js';
import { el, crearSelectorRango } from '../componentes/selector-fecha.js';
import { crearResumenClases, crearNotaCarga } from '../componentes/resumen-clases.js';
import { duracionLegible, sumarPorClase } from '../formato.js';

export const titulo = 'Horas del día';

const MAX_DIAS = 92; // un rango muy largo haría una consulta enorme

export function render(contenedor, parametros) {
  const zonaSelector = el('div');
  const zonaDatos = el('div', {}, el('p', {}, 'Cargando…'));
  contenedor.append(el('h1', {}, titulo), zonaSelector, zonaDatos);

  (async () => {
    const hoy = diaDe(reloj.ahora(), await almacen.inicioDia()) // reloj de prueba (H-02) o la hora real;
    let hasta = esFechaValida(parametros.get('hasta')) ? parametros.get('hasta') : hoy;
    let desde = esFechaValida(parametros.get('desde')) ? parametros.get('desde') : sumarDias(hasta, -6);
    if (hasta > hoy) hasta = hoy;
    if (desde > hasta) desde = hasta;
    if (desde < sumarDias(hasta, -(MAX_DIAS - 1))) desde = sumarDias(hasta, -(MAX_DIAS - 1));

    zonaSelector.append(crearSelectorRango({ desde, hasta, hoy, alCambiar: (d, h) => irAParametros({ desde: d, hasta: h }) }));

    const t0 = performance.now();
    try {
      const dias = await almacen.rango(desde, hasta);
      const ms = performance.now() - t0;
      const todos = dias.flatMap((d) => d.datos.eventos);
      const filas = dias.map(({ fecha, datos }) =>
        el('li', {}, el('span', {}, fechaCorta(fecha)), el('span', { class: 'valor' }, duracionLegible(sumarPorClase(datos.eventos).total))));
      zonaDatos.replaceChildren(
        el('div', { class: 'rejilla' },
          crearResumenClases(todos, `Tiempo activo del ${desde} al ${hasta} (resumen provisional)`),
          el('section', { class: 'tarjeta' }, el('h3', { class: 'tarjeta-titulo' }, 'Por día'), el('ul', { class: 'lista-totales' }, ...filas))),
        crearNotaCarga(dias.map((d) => d.desdeCache), ms));
    } catch (error) {
      zonaDatos.replaceChildren(el('p', { class: 'aviso' }, 'No se pudieron cargar los datos: ' + error.message));
    }
  })();
}
