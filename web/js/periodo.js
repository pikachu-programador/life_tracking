// Período compartido entre vistas (V-04): Día · Semana (lunes a domingo) · Mes · Rango.
//
// El período elegido vive en dos lugares:
// - En la dirección: "#/resumen?periodo=semana&fecha=2026-10-05". Así se mantiene al recargar.
// - En localStorage ('rastreador-periodo'). Así se mantiene al pasar a otra vista desde el menú
//   (los enlaces del menú no llevan parámetros: "#/resumen").
//
// Orden al leer: 1) la dirección; 2) lo último guardado; 3) el tipo por defecto de la vista, con hoy.
//
// El archivo tiene dos partes:
// - Funciones PURAS (no tocan el DOM, la dirección ni localStorage): se prueban en Node (pruebas/periodo.test.js).
// - Funciones que usan localStorage o la dirección: leerPeriodo, guardarPeriodo e irAPeriodo.
//
// Uso típico en una vista:
//   const hoy = ...;  // fecha del día lógico actual
//   const periodo = leerPeriodo(parametros, { hoy, tipoPorDefecto: 'semana' });
//   cabecera.append(crearSelectorPeriodo({ periodo, hoy, alCambiar: (p) => irAPeriodo(p, { hoy, parametros }) }));

import { TIPOS_PERIODO, periodoDe, esFechaValida, largoPeriodo, periodoSiguiente, sumarDias } from './fechas.js';
import { irAParametros } from './router.js';

/** Clave de localStorage donde se guarda el último período elegido. */
export const CLAVE_PERIODO = 'rastreador-periodo';

/** Parámetros de la dirección que pertenecen al período (los demás son de cada vista). */
export const CLAVES_PERIODO = ['periodo', 'fecha', 'desde', 'hasta'];

/** Nombre visible de cada tipo de período. */
export const NOMBRE_TIPO_PERIODO = { dia: 'Día', semana: 'Semana', mes: 'Mes', rango: 'Rango' };

/** Largo (en días) de un rango cuando no se sabe otro. */
const LARGO_RANGO_POR_DEFECTO = 7;

// ─────────────────────────────────────────────────────────────────────────────
// Parte pura
// ─────────────────────────────────────────────────────────────────────────────

/** Lee un parámetro de URLSearchParams o de un objeto común ({ fecha: '…' }). Vacío → null. */
function obtener(parametros, clave) {
  if (!parametros) return null;
  const valor = typeof parametros.get === 'function' ? parametros.get(clave) : parametros[clave];
  return valor === undefined || valor === '' ? null : valor;
}

/** Tipos que acepta la vista, en su orden; si la lista no sirve, todos. */
function tiposPermitidos(tipos) {
  const validos = (tipos ?? []).filter((t) => TIPOS_PERIODO.includes(t));
  return validos.length ? validos : [...TIPOS_PERIODO];
}

/** El tipo por defecto, si la vista lo acepta; si no, el primero que acepta. */
function tipoInicial(tipoPorDefecto, permitidos) {
  return permitidos.includes(tipoPorDefecto) ? tipoPorDefecto : permitidos[0];
}

/** Rango de `dias` días que termina en `hoy` (incluido). */
function rangoHastaHoy(dias, hoy) {
  return { tipo: 'rango', desde: sumarDias(hoy, -(dias - 1)), hasta: hoy };
}

/**
 * ¿El período incluye la fecha `hoy`?
 * @param {import('../motor/fechas.js').Periodo} periodo
 * @param {string} hoy  'AAAA-MM-DD'
 */
export function contieneHoy(periodo, hoy) {
  return periodo.desde <= hoy && hoy <= periodo.hasta;
}

/** ¿Dos períodos son el mismo (tipo y fechas)? */
export function periodosIguales(a, b) {
  return Boolean(a && b) && a.tipo === b.tipo && a.desde === b.desde && a.hasta === b.hasta;
}

/**
 * Corrige un período para que nunca empiece después de hoy.
 * - Día, semana o mes que empieza después de hoy → el de ese tipo que contiene hoy.
 * - Semana o mes en curso (terminan después de hoy) → se dejan así: las vistas saben que los días futuros no tienen datos.
 * - Rango: el fin no pasa de hoy; si empezaba después de hoy, se mueve para terminar hoy con el mismo largo.
 * @returns {import('../motor/fechas.js').Periodo}  un objeto nuevo (no cambia el que recibe)
 */
export function limitarAHoy(periodo, hoy) {
  if (periodo.tipo === 'rango') {
    if (periodo.desde > hoy) return rangoHastaHoy(largoPeriodo(periodo), hoy);
    if (periodo.hasta > hoy) return { tipo: 'rango', desde: periodo.desde, hasta: hoy };
    return { ...periodo };
  }
  if (periodo.desde > hoy) return periodoDe(periodo.tipo, hoy);
  return { ...periodo };
}

/**
 * El período del mismo tipo que contiene hoy (botón "Hoy"). En rango: el mismo largo, terminando hoy.
 * @returns {import('../motor/fechas.js').Periodo}
 */
export function periodoConHoy(periodo, hoy) {
  if (periodo.tipo === 'rango') return rangoHastaHoy(largoPeriodo(periodo), hoy);
  return periodoDe(periodo.tipo, hoy);
}

/**
 * Período siguiente (flecha ›), o null si empezaría después de hoy (entonces la flecha se desactiva).
 * En rango, si el siguiente terminaría después de hoy, se usa el del mismo largo que termina hoy.
 * @returns {import('../motor/fechas.js').Periodo|null}
 */
export function siguienteHastaHoy(periodo, hoy) {
  if (periodo.tipo === 'rango') {
    if (periodo.hasta >= hoy) return null;
    const siguiente = periodoSiguiente(periodo);
    return siguiente.hasta > hoy ? rangoHastaHoy(largoPeriodo(periodo), hoy) : siguiente;
  }
  const siguiente = periodoSiguiente(periodo);
  return siguiente.desde > hoy ? null : siguiente;
}

/**
 * Cambia el tipo de período sin perder de vista la fecha (control segmentado).
 * La fecha de referencia es hoy si el período lo incluye; si no, su primer día.
 * Ejemplos: "esta semana" → Mes → "este mes"; "5–11 oct" → Día → "5 oct"; cualquier cosa → Rango → las mismas fechas.
 * @param {('dia'|'semana'|'mes'|'rango')} tipo
 * @returns {import('../motor/fechas.js').Periodo}
 */
export function cambiarTipo(periodo, tipo, hoy) {
  if (tipo === periodo.tipo) return { ...periodo };
  if (tipo === 'rango') return limitarAHoy({ tipo: 'rango', desde: periodo.desde, hasta: periodo.hasta }, hoy);
  const ancla = contieneHoy(periodo, hoy) ? hoy : periodo.desde;
  return limitarAHoy(periodoDe(tipo, ancla), hoy);
}

/**
 * Período pedido en la dirección, o null si la dirección no trae ninguno válido.
 * - "periodo=dia|semana|mes" + "fecha" (cualquier día dentro del período). Sin fecha: el que contiene hoy.
 * - "periodo=rango" + "desde" y "hasta". Sin "periodo" pero con "desde" y "hasta": también es un rango (F2-08).
 * - Sin "periodo" pero con "fecha": el tipo por defecto de la vista que contiene esa fecha.
 * - Si la vista no acepta el tipo pedido, se usa su tipo por defecto con la misma fecha.
 * @param {URLSearchParams|Object<string, string>|null} parametros
 * @param {{hoy: string, tipoPorDefecto?: string, tipos?: string[]}} opciones
 * @returns {import('../motor/fechas.js').Periodo|null}
 */
export function periodoDeParametros(parametros, { hoy, tipoPorDefecto = 'semana', tipos = TIPOS_PERIODO }) {
  const pedido = obtener(parametros, 'periodo');
  const fecha = obtener(parametros, 'fecha');
  const desde = obtener(parametros, 'desde');
  const hasta = obtener(parametros, 'hasta');
  const hayRango = esFechaValida(desde) && esFechaValida(hasta);
  // Si nada de lo que trae la dirección sirve, es como si no trajera nada.
  if (!TIPOS_PERIODO.includes(pedido) && !esFechaValida(fecha) && !hayRango) return null;

  const permitidos = tiposPermitidos(tipos);
  let tipo = permitidos.includes(pedido) ? pedido : null;
  if (!tipo && !pedido && hayRango && permitidos.includes('rango')) tipo = 'rango';
  tipo ??= tipoInicial(tipoPorDefecto, permitidos);

  // Fecha de referencia: la pedida; si no hay, el inicio del rango; si no, hoy.
  const ancla = esFechaValida(fecha) ? fecha : (esFechaValida(desde) ? desde : hoy);
  const periodo = tipo === 'rango'
    ? (hayRango ? periodoDe('rango', desde, hasta) : periodoDe('rango', sumarDias(ancla, -(LARGO_RANGO_POR_DEFECTO - 1)), ancla))
    : periodoDe(tipo, ancla);
  return limitarAHoy(periodo, hoy);
}

/**
 * Parámetros de la dirección para un período (para irAParametros).
 * - Día, semana o mes: { periodo, fecha } (fecha = primer día).
 * - Rango: { periodo: 'rango', desde, hasta }.
 * Si se pasa `hoy` y el período lo incluye (día, semana o mes en curso), va sin fecha: { periodo: 'semana' }.
 * Así la dirección significa "la semana actual" y, al recargar otro día, sigue mostrando la actual.
 * @param {import('../motor/fechas.js').Periodo} periodo
 * @param {{hoy?: string}} [opciones]
 * @returns {Object<string, string>}
 */
export function aParametros(periodo, { hoy } = {}) {
  if (periodo.tipo === 'rango') return { periodo: 'rango', desde: periodo.desde, hasta: periodo.hasta };
  if (hoy && contieneHoy(periodo, hoy)) return { periodo: periodo.tipo };
  return { periodo: periodo.tipo, fecha: periodo.desde };
}

/**
 * Texto que se guarda en localStorage.
 * Si el período incluye hoy se guarda como "el actual" ({tipo, actual: true}, y en rango también su largo):
 * así, al volver otro día, "esta semana" sigue siendo esta semana y no la de cuando se eligió.
 * @param {import('../motor/fechas.js').Periodo} periodo
 * @param {string} [hoy]
 * @returns {string} JSON
 */
export function textoGuardado(periodo, hoy) {
  if (hoy && contieneHoy(periodo, hoy)) {
    return JSON.stringify(periodo.tipo === 'rango'
      ? { tipo: 'rango', actual: true, dias: largoPeriodo(periodo) }
      : { tipo: periodo.tipo, actual: true });
  }
  return JSON.stringify({ tipo: periodo.tipo, desde: periodo.desde, hasta: periodo.hasta });
}

/**
 * Período a partir del texto guardado, o null si no hay, está dañado o la vista no acepta ese tipo.
 * @param {string|null} texto  lo que devolvió localStorage.getItem
 * @param {{hoy: string, tipos?: string[]}} opciones
 * @returns {import('../motor/fechas.js').Periodo|null}
 */
export function periodoGuardado(texto, { hoy, tipos = TIPOS_PERIODO }) {
  let guardado;
  try {
    guardado = JSON.parse(texto ?? 'null');
  } catch {
    return null; // texto dañado (por ejemplo, editado a mano)
  }
  if (!guardado || typeof guardado !== 'object') return null;
  const { tipo } = guardado;
  if (!TIPOS_PERIODO.includes(tipo) || !tiposPermitidos(tipos).includes(tipo)) return null;

  if (guardado.actual) {
    if (tipo !== 'rango') return periodoDe(tipo, hoy);
    const dias = Number.isInteger(guardado.dias) && guardado.dias > 0 ? guardado.dias : LARGO_RANGO_POR_DEFECTO;
    return rangoHastaHoy(dias, hoy);
  }
  if (!esFechaValida(guardado.desde)) return null;
  if (tipo === 'rango') {
    if (!esFechaValida(guardado.hasta)) return null;
    return limitarAHoy(periodoDe('rango', guardado.desde, guardado.hasta), hoy);
  }
  return limitarAHoy(periodoDe(tipo, guardado.desde), hoy);
}

/**
 * Período de la vista (función pura): la dirección; si no trae, lo guardado; si no, el tipo por defecto con hoy.
 * @param {URLSearchParams|Object<string, string>|null} parametros
 * @param {{hoy: string, tipoPorDefecto?: string, tipos?: string[], guardado?: string|null}} opciones
 *   guardado: el texto de localStorage (leerPeriodo lo pasa solo)
 * @returns {import('../motor/fechas.js').Periodo}
 */
export function resolverPeriodo(parametros, { hoy, tipoPorDefecto = 'semana', tipos = TIPOS_PERIODO, guardado = null }) {
  const permitidos = tiposPermitidos(tipos);
  const tipo = tipoInicial(tipoPorDefecto, permitidos);
  return periodoDeParametros(parametros, { hoy, tipoPorDefecto: tipo, tipos: permitidos })
    ?? periodoGuardado(guardado, { hoy, tipos: permitidos })
    ?? (tipo === 'rango' ? rangoHastaHoy(LARGO_RANGO_POR_DEFECTO, hoy) : periodoDe(tipo, hoy));
}

// ─────────────────────────────────────────────────────────────────────────────
// Con localStorage y la dirección (solo en el navegador)
// ─────────────────────────────────────────────────────────────────────────────

/** Lo guardado en localStorage, o null. localStorage puede fallar (modo privado, Node): por eso el try/catch. */
function leerTextoGuardado() {
  try {
    return localStorage.getItem(CLAVE_PERIODO);
  } catch {
    return null;
  }
}

/**
 * Guarda el período elegido para las demás vistas (y para la próxima vez que se abra el dashboard).
 * Si localStorage no está disponible, no hace nada.
 * @param {import('../motor/fechas.js').Periodo} periodo
 * @param {{hoy?: string}} [opciones]  con hoy, el período en curso se guarda como "el actual" (ver textoGuardado)
 */
export function guardarPeriodo(periodo, { hoy } = {}) {
  try {
    localStorage.setItem(CLAVE_PERIODO, textoGuardado(periodo, hoy));
  } catch {
    // Sin localStorage el período solo vive en la dirección; no es un error.
  }
}

/**
 * Período de la vista: el de la dirección; si no hay, el último guardado; si no, el tipo por defecto con hoy.
 * Si la dirección trae un período, también se guarda (así un enlace a "#/hoy?fecha=…" se recuerda en las demás vistas).
 * Si la vista no acepta el tipo guardado (por ejemplo, Hoy solo acepta días), usa su tipo por defecto con hoy.
 * @param {URLSearchParams|Object<string, string>|null} parametros  los que el router le pasa a la vista
 * @param {{hoy: string, tipoPorDefecto?: string, tipos?: string[]}} opciones
 * @returns {import('../motor/fechas.js').Periodo}
 */
export function leerPeriodo(parametros, opciones) {
  const deLaDireccion = periodoDeParametros(parametros, {
    ...opciones,
    tipoPorDefecto: tipoInicial(opciones.tipoPorDefecto ?? 'semana', tiposPermitidos(opciones.tipos)),
  });
  if (deLaDireccion) {
    guardarPeriodo(deLaDireccion, opciones);
    return deLaDireccion;
  }
  return resolverPeriodo(null, { ...opciones, guardado: leerTextoGuardado() });
}

/**
 * Guarda el período y lo pone en la dirección (el router vuelve a dibujar la vista).
 * Los demás parámetros de la vista (por ejemplo "nivel" en el Simulador) se conservan si se pasan en `parametros`.
 * @param {import('../motor/fechas.js').Periodo} periodo
 * @param {{hoy?: string, parametros?: URLSearchParams}} [opciones]
 */
export function irAPeriodo(periodo, { hoy, parametros } = {}) {
  guardarPeriodo(periodo, { hoy });
  const otros = parametros
    ? Object.fromEntries([...parametros].filter(([clave]) => !CLAVES_PERIODO.includes(clave)))
    : {};
  irAParametros({ ...otros, ...aParametros(periodo, { hoy }) });
}
