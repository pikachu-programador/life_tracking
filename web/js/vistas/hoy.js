// Vista "Hoy" (arquitectura §13). Horas despierto, bloque actual, línea de tiempo y cumplimiento del día.
// Por ahora (F2-08): selector de fecha y un resumen provisional por clase. Se completa en las fases 1 a 6.

import { almacen } from '../almacen.js';
import { reloj } from '../reloj.js';
import { diaDe, esFechaValida } from '../fechas.js';
import { irAParametros } from '../router.js';
import { el, crearSelectorFecha } from '../componentes/selector-fecha.js';
import { crearResumenClases, crearNotaCarga } from '../componentes/resumen-clases.js';

export const titulo = 'Hoy';

/** Dibuja la vista dentro de `contenedor`. `parametros.fecha` elige el día (por defecto, hoy). */
export function render(contenedor, parametros) {
  const h1 = el('h1', {}, titulo);
  const zonaSelector = el('div');
  const zonaDatos = el('div', {}, el('p', {}, 'Cargando…'));
  contenedor.append(h1, zonaSelector, zonaDatos);

  (async () => {
    const hoy = diaDe(reloj.ahora(), await almacen.inicioDia()) // reloj de prueba (H-02) o la hora real;
    const pedida = parametros.get('fecha');
    const fecha = esFechaValida(pedida) && pedida <= hoy ? pedida : hoy;
    if (pedida !== null && pedida !== fecha) {
      // Fecha inválida, futura o igual a hoy: se limpia la dirección (replace no deja rastro en el historial).
      location.replace('#/hoy');
      return;
    }
    if (fecha !== hoy) h1.textContent = 'Día';

    zonaSelector.append(crearSelectorFecha({
      fecha, hoy,
      alCambiar: (nueva) => irAParametros({ fecha: nueva === hoy ? null : nueva }),
    }));

    const t0 = performance.now();
    try {
      const { datos, desdeCache } = await almacen.dia(fecha);
      const ms = performance.now() - t0;
      zonaDatos.replaceChildren(
        crearResumenClases(datos.eventos, 'Tiempo activo (resumen provisional)'),
        crearNotaCarga([desdeCache], ms));
    } catch (error) {
      zonaDatos.replaceChildren(el('p', { class: 'aviso' }, 'No se pudieron cargar los datos: ' + error.message));
    }
  })();
}
