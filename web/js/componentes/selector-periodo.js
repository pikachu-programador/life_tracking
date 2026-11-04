// Selector de período (V-04), compartido por todas las vistas. Amplía el selector de fecha de F2-08.
//
//   [ Día | Semana | Mes | Rango ]   ‹   5 – 11 oct 2026 · esta semana   ›   [Hoy]
//
// - El control segmentado solo muestra los `tipos` que acepta la vista (con un solo tipo, no aparece).
// - Clic en el texto del período: abre el calendario del navegador para saltar a otra fecha.
// - En Rango aparecen dos campos de fecha (Desde y Hasta) en lugar del calendario.
// - Atajos: ← y → cambian al período anterior y al siguiente (si el foco no está en un campo de texto).
//
// No decide nada por su cuenta: muestra el período que recibe, se actualiza al cambiar y avisa con `alCambiar`.
// La vista decide qué hacer (normalmente irAPeriodo() de js/periodo.js, que lo guarda y lo pone en la dirección).
//
// Uso:
//   const selector = crearSelectorPeriodo({ periodo, hoy, alCambiar: (p) => irAPeriodo(p, { hoy, parametros }) });
//   cabecera.append(selector);
// Los atajos de teclado se quitan solos cuando el selector sale de la página (al cambiar de vista);
// también se pueden quitar a mano con selector.limpiar().

import { el, svg } from '../dom.js';
import { TIPOS_PERIODO, periodoAnterior, periodoDe, periodoLegible, esFechaValida, largoPeriodo, sumarDias } from '../fechas.js';
import {
  NOMBRE_TIPO_PERIODO, cambiarTipo, contieneHoy, limitarAHoy, periodoConHoy, periodosIguales, siguienteHastaHoy,
} from '../periodo.js';

const NOMBRE_ANTERIOR = { dia: 'Día anterior', semana: 'Semana anterior', mes: 'Mes anterior', rango: 'Rango anterior' };
const NOMBRE_SIGUIENTE = { dia: 'Día siguiente', semana: 'Semana siguiente', mes: 'Mes siguiente', rango: 'Rango siguiente' };
const NOMBRE_ACTUAL = { dia: 'hoy', semana: 'esta semana', mes: 'este mes', rango: 'hasta hoy' };

// Elementos que usan las flechas del teclado por su cuenta: ahí los atajos no actúan.
const USAN_FLECHAS = 'input, textarea, select, [contenteditable], [role="slider"], [role="spinbutton"], '
  + '[role="listbox"], [role="radiogroup"], [role="tablist"], [role="menu"], [role="grid"]';

// Si la vista se vuelve a dibujar tras un cambio (lo normal con irAPeriodo), el selector nuevo
// devuelve el foco al mismo botón: así quien usa el teclado no pierde su lugar.
let focoPendiente = null; // { control: 'anterior' | 'siguiente' | 'hoy' | 'texto' | 'tipo-semana' | …, hasta: ms }

/** Icono de flecha (‹ o ›) dibujado con SVG, para que se vea nítido en cualquier tamaño. */
function iconoFlecha(direccion) {
  const d = direccion === 'izquierda' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6';
  return svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', class: 'selector-periodo-icono' }, svg('path', { d }));
}

/** Icono de calendario (al lado del texto del período: indica que se puede elegir otra fecha). */
function iconoCalendario() {
  return svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', class: 'selector-periodo-icono selector-periodo-icono-calendario' },
    svg('rect', { x: 3.5, y: 5, width: 17, height: 15, rx: 2 }), svg('path', { d: 'M3.5 10h17M8 3v4M16 3v4' }));
}

/**
 * Crea el selector de período.
 * @param {Object} opciones
 * @param {import('../../motor/fechas.js').Periodo} opciones.periodo  el período que se muestra
 * @param {string} opciones.hoy  fecha del día lógico actual ('AAAA-MM-DD'): no se puede ir más allá
 * @param {string[]} [opciones.tipos]  tipos que acepta la vista, en orden (por defecto los cuatro)
 * @param {(periodo: import('../../motor/fechas.js').Periodo) => void} opciones.alCambiar  se llama con el período nuevo
 * @param {boolean} [opciones.atajos=true]  ← y → del teclado (en una vista con dos selectores, solo uno debería tenerlos)
 * @param {number[]} [opciones.rapidos=[]]  en Rango, botones "Últimos N días" (por ejemplo [7, 30])
 * @returns {HTMLElement & {limpiar: () => void}}  el elemento; limpiar() quita los atajos de teclado
 */
export function crearSelectorPeriodo({ periodo, hoy, tipos = TIPOS_PERIODO, alCambiar, atajos = true, rapidos = [] }) {
  const permitidos = tipos.filter((t) => TIPOS_PERIODO.includes(t));
  let actual = limitarAHoy(periodo, hoy);

  // ── Control segmentado: un botón por tipo (aria-pressed dice cuál está elegido) ──
  const botonesTipo = permitidos.map((tipo) => el('button', {
    type: 'button', class: 'selector-periodo-tipo', 'data-control': `tipo-${tipo}`,
    onclick: () => cambiar(cambiarTipo(actual, tipo, hoy), `tipo-${tipo}`),
  }, NOMBRE_TIPO_PERIODO[tipo]));
  const grupoTipos = permitidos.length > 1
    ? el('div', { class: 'selector-periodo-tipos', role: 'group', 'aria-label': 'Tipo de período' }, botonesTipo)
    : null;

  // ── Navegación: ‹ texto › ──
  const anterior = el('button', {
    type: 'button', class: 'boton selector-periodo-flecha', 'data-control': 'anterior', 'aria-keyshortcuts': 'ArrowLeft',
    onclick: () => cambiar(periodoAnterior(actual), 'anterior'),
  }, iconoFlecha('izquierda'));
  const siguiente = el('button', {
    type: 'button', class: 'boton selector-periodo-flecha', 'data-control': 'siguiente', 'aria-keyshortcuts': 'ArrowRight',
    onclick: () => { const s = siguienteHastaHoy(actual, hoy); if (s) cambiar(s, 'siguiente'); },
  }, iconoFlecha('derecha'));

  // Texto del período. En día, semana y mes es un botón que abre el calendario del navegador;
  // el <input type="date"> está escondido debajo (showPicker() necesita que exista en la página).
  const etiqueta = el('span', { class: 'selector-periodo-etiqueta' });
  const etiquetaActual = el('span', { class: 'selector-periodo-actual' });
  const campoOculto = el('input', {
    type: 'date', class: 'selector-periodo-campo-oculto', tabindex: '-1', 'aria-label': 'Ir a una fecha', max: hoy,
    onchange: (e) => {
      const fecha = e.target.value;
      if (esFechaValida(fecha) && actual.tipo !== 'rango') cambiar(periodoDe(actual.tipo, fecha), 'texto');
    },
  });
  const botonTexto = el('button', {
    type: 'button', class: 'selector-periodo-texto', 'data-control': 'texto',
    onclick: abrirCalendario,
  }, etiqueta, etiquetaActual, iconoCalendario());
  const zonaTexto = el('span', { class: 'selector-periodo-fecha' }, botonTexto, campoOculto);

  const botonHoy = el('button', {
    type: 'button', class: 'boton selector-periodo-hoy', 'data-control': 'hoy',
    onclick: () => cambiar(periodoConHoy(actual, hoy), 'hoy'),
  }, 'Hoy');

  // ── Rango: Desde y Hasta (y, si se piden, "Últimos N días") ──
  const campoDesde = el('input', {
    type: 'date', max: hoy, 'aria-label': 'Desde',
    onchange: (e) => { if (esFechaValida(e.target.value)) cambiar(periodoDe('rango', e.target.value, actual.hasta), 'desde'); else pintar(); },
  });
  const campoHasta = el('input', {
    type: 'date', max: hoy, 'aria-label': 'Hasta',
    onchange: (e) => { if (esFechaValida(e.target.value)) cambiar(periodoDe('rango', actual.desde, e.target.value), 'hasta'); else pintar(); },
  });
  const botonesRapidos = rapidos.map((dias) => el('button', {
    type: 'button', class: 'boton selector-periodo-rapido', 'data-control': `rapido-${dias}`, 'data-dias': dias,
    onclick: () => cambiar({ tipo: 'rango', desde: sumarDias(hoy, -(dias - 1)), hasta: hoy }, `rapido-${dias}`),
  }, `Últimos ${dias} días`));
  const zonaRango = el('div', { class: 'selector-periodo-rango' },
    el('label', { class: 'selector-periodo-campo' }, el('span', {}, 'Desde'), campoDesde),
    el('span', { class: 'selector-periodo-guion', 'aria-hidden': 'true' }, '–'),
    el('label', { class: 'selector-periodo-campo' }, el('span', {}, 'Hasta'), campoHasta),
    botonesRapidos);

  const raiz = el('div', { class: 'selector-periodo' },
    grupoTipos,
    el('div', { class: 'selector-periodo-navegacion' }, anterior, zonaTexto, siguiente),
    botonHoy,
    zonaRango);

  /** Pone en pantalla el período `actual` (sin crear elementos nuevos: así el foco no se pierde). */
  function pintar() {
    const { tipo } = actual;
    const esRango = tipo === 'rango';
    const enCurso = contieneHoy(actual, hoy);
    raiz.dataset.tipo = tipo;

    for (const boton of botonesTipo) boton.setAttribute('aria-pressed', String(boton.dataset.control === `tipo-${tipo}`));

    const texto = periodoLegible(actual);
    etiqueta.textContent = texto;
    // En rango se agrega el largo; en el período en curso, "hoy", "esta semana"…
    const extra = esRango ? `${largoPeriodo(actual)} días${enCurso ? ', hasta hoy' : ''}` : (enCurso ? NOMBRE_ACTUAL[tipo] : '');
    etiquetaActual.textContent = extra;
    etiquetaActual.hidden = !extra;
    botonTexto.disabled = esRango; // en rango se eligen las fechas en los campos
    botonTexto.setAttribute('aria-label', esRango ? `${texto} (${extra})` : `${texto}${extra ? ` (${extra})` : ''}. Elegir otra fecha`);
    botonTexto.title = esRango ? '' : 'Elegir otra fecha';
    campoOculto.value = actual.desde;

    anterior.setAttribute('aria-label', `${NOMBRE_ANTERIOR[tipo]} (tecla ←)`);
    anterior.title = `${NOMBRE_ANTERIOR[tipo]} (←)`;
    const haySiguiente = siguienteHastaHoy(actual, hoy) !== null;
    siguiente.disabled = !haySiguiente;
    siguiente.setAttribute('aria-label', `${NOMBRE_SIGUIENTE[tipo]} (tecla →)`);
    siguiente.title = haySiguiente ? `${NOMBRE_SIGUIENTE[tipo]} (→)` : 'No hay datos del futuro';

    botonHoy.disabled = enCurso;
    botonHoy.title = enCurso ? `Ya estás en ${NOMBRE_ACTUAL[tipo]}` : (esRango ? 'El mismo largo, terminando hoy' : `Ir a ${NOMBRE_ACTUAL[tipo]}`);

    zonaRango.hidden = !esRango;
    campoDesde.value = actual.desde;
    campoHasta.value = actual.hasta;
    for (const boton of botonesRapidos) {
      const dias = Number(boton.dataset.dias);
      boton.setAttribute('aria-pressed', String(esRango && actual.hasta === hoy && largoPeriodo(actual) === dias));
    }
  }

  /** Cambia al período `nuevo` (si de verdad es otro) y avisa a la vista. `control`: qué lo pidió (para el foco). */
  function cambiar(nuevo, control) {
    const limitado = limitarAHoy(nuevo, hoy);
    if (periodosIguales(limitado, actual)) { pintar(); return; } // por ejemplo, un campo con una fecha futura
    actual = limitado;
    pintar();
    if (control && raiz.contains(document.activeElement)) focoPendiente = { control, hasta: performance.now() + 1500 };
    alCambiar?.(actual);
  }

  /** Abre el calendario del navegador. Si no se puede (navegador viejo), muestra el campo de fecha. */
  function abrirCalendario() {
    try {
      campoOculto.showPicker();
    } catch {
      raiz.dataset.campoVisible = '';
      campoOculto.tabIndex = 0;
      campoOculto.focus();
    }
  }

  // ── Atajos de teclado ← y → ──
  // Escuchan en todo el documento. Se quitan solos la primera vez que se pulsa una tecla después de que el
  // selector salió de la página (el router borra la vista al cambiar de vista): así no quedan "fantasmas".
  const control = new AbortController();
  let estuvoEnLaPagina = false;
  function alPulsar(e) {
    if (!raiz.isConnected) {
      if (estuvoEnLaPagina) control.abort(); // ya no está: se quita para siempre
      return; // (si todavía no se agregó a la página, se espera)
    }
    estuvoEnLaPagina = true;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return; // Alt+← es "atrás" del navegador
    if (e.target instanceof Element && e.target.closest(USAN_FLECHAS)) return;
    e.preventDefault(); // si hay dos selectores, solo responde el primero
    if (e.key === 'ArrowLeft') cambiar(periodoAnterior(actual), null);
    else {
      const s = siguienteHastaHoy(actual, hoy);
      if (s) cambiar(s, null);
    }
  }
  if (atajos) document.addEventListener('keydown', alPulsar, { signal: control.signal });
  raiz.limpiar = () => control.abort();

  pintar();
  devolverFoco(raiz);
  return raiz;
}

/** Si el selector anterior tenía el foco al cambiar, lo pone en el mismo botón de este (cuando ya esté en la página). */
function devolverFoco(raiz, intentos = 30) {
  if (!focoPendiente || performance.now() > focoPendiente.hasta) { focoPendiente = null; return; }
  if (!raiz.isConnected) {
    if (intentos > 0) requestAnimationFrame(() => devolverFoco(raiz, intentos - 1));
    return;
  }
  const destino = raiz.querySelector(`[data-control="${focoPendiente.control}"]`);
  focoPendiente = null;
  // Si el botón quedó desactivado (por ejemplo, › al llegar a hoy), el foco va al texto del período.
  (destino && !destino.disabled ? destino : raiz.querySelector('[data-control="texto"]:not(:disabled), [data-control="anterior"]'))
    ?.focus({ preventScroll: true });
}
