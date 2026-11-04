// Gráficos con ECharts (archivo local en web/lib/), con un tema que sale de css/tokens.css.
// Así los gráficos usan los mismos colores que el resto del dashboard y cambian con el modo oscuro.
//
// Uso:
//   import { crearGrafico, colorDeClase } from '../graficos.js';
//   const g = crearGrafico(elemento, (c) => ({ ...opciones de ECharts... }));
// La función recibe `c` (los colores ya resueltos) y devuelve las opciones. Se vuelve a llamar
// cada vez que cambia el tema, para redibujar con los colores nuevos.
//
// Estados del contenedor (visualizaciones §5: todo gráfico tiene estado vacío, de carga y detalle al pasar el mouse):
//   const g = crearGrafico(elemento, armar, { vacio: () => datos.length === 0 });   // "Sin datos en este período"
//   g.cargando(true);  …  g.actualizar();  g.cargando(false);
// Los estilos de esos estados y de los detalles están en css/linea-tiempo.css (sección "Gráficos").

import * as echarts from '../lib/echarts.esm.min.js';
import { duracionLegible } from './formato.js';

/** ECharts, por si un componente necesita algo más (por ejemplo, echarts.graphic). */
export { echarts };

// Variables de tokens.css que se traducen a colores para ECharts.
const TOKENS_DE_COLOR = {
  estudio: '--color-estudio',
  distraccion: '--color-distraccion',
  neutral: '--color-neutral',
  sinClasificar: '--color-sin-clasificar',
  ia: '--color-ia',
  afk: '--color-afk',
  sinPc: '--color-sin-pc',
  acento: '--color-acento',
  acentoTexto: '--color-acento-texto',
  acentoSuave: '--color-acento-suave',
  fondo: '--color-fondo',
  superficie: '--color-superficie',
  superficie2: '--color-superficie-2',
  borde: '--color-borde',
  bordeFuerte: '--color-borde-fuerte',
  texto: '--color-texto',
  textoSuave: '--color-texto-suave',
  aviso: '--color-aviso',
  // Estados de cumplimiento (§9)
  cumplido: '--color-cumplido',
  parcial: '--color-parcial',
  fallido: '--color-fallido',
  pendiente: '--color-pendiente',
  // Niveles de bloqueo (§11)
  nivelAviso: '--color-nivel-aviso',
  nivelFriccion: '--color-nivel-friccion',
  nivelTotal: '--color-nivel-total',
  // Plan (§8)
  planBloque: '--color-plan-bloque',
  planClase: '--color-plan-clase',
  planRutina: '--color-plan-rutina',
};
// Cursos: curso1 … curso8 (--color-curso-1 … --color-curso-8).
for (let n = 1; n <= 8; n++) TOKENS_DE_COLOR[`curso${n}`] = `--color-curso-${n}`;

// Un lienzo de 1×1 px para convertir cualquier color de CSS a rgb()/rgba() (se crea una sola vez).
let lienzoColor = null;

/**
 * Convierte un color de CSS a "rgb(r, g, b)" o "rgba(r, g, b, a)", que ECharts sí entiende.
 * getComputedStyle puede devolver "color(srgb 0.3 0.4 0.8 / 0.14)" para los tokens hechos con color-mix();
 * se pinta un píxel con ese color y se leen sus valores.
 */
function aRgb(color) {
  if (/^rgba?\(/.test(color)) return color; // lo más común: ya viene en rgb()
  lienzoColor ??= document.createElement('canvas');
  lienzoColor.width = lienzoColor.height = 1;
  const ctx = lienzoColor.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000';
  ctx.fillStyle = color; // si el navegador no lo entiende, queda el negro de la línea anterior
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Number((a / 255).toFixed(3))})`;
}

/**
 * Lee los colores de tokens.css ya resueltos (por ejemplo "rgb(47, 158, 107)").
 * Truco: getPropertyValue('--color-estudio') devolvería el texto "light-dark(...)", que ECharts
 * no entiende. Por eso se pinta un elemento invisible con ese color y se lee su color final.
 * @returns {Object<string, string>} nombre (estudio, sinPc, curso3, nivelAviso…) → color; además fuente y fuenteNumeros
 */
export function leerColores() {
  const sonda = document.createElement('span');
  sonda.style.display = 'none';
  document.body.append(sonda);
  const colores = {};
  for (const [nombre, variable] of Object.entries(TOKENS_DE_COLOR)) {
    sonda.style.color = `var(${variable})`;
    colores[nombre] = aRgb(getComputedStyle(sonda).color);
  }
  sonda.remove();
  const raiz = getComputedStyle(document.documentElement);
  colores.fuente = raiz.getPropertyValue('--fuente-texto').trim();
  colores.fuenteNumeros = raiz.getPropertyValue('--fuente-numeros').trim() || colores.fuente;
  return colores;
}

/** 'sin-pc' → 'sinPc', 'nivel-aviso' → 'nivelAviso', 'curso-3' → 'curso3'. */
function claveDeColor(nombre) {
  return String(nombre).replace(/-(\w)/g, (_, letra) => letra.toUpperCase());
}

/** Color de una clase o estado: 'estudio', 'distraccion', 'neutral', 'sin-clasificar', 'ia', 'afk', 'sin-pc'.
 *  Algo desconocido se pinta como Sin clasificar. */
export function colorDeClase(clase, colores = leerColores()) {
  return colores[claveDeColor(clase)] ?? colores.sinClasificar;
}

/**
 * Color de un curso del plan: 'curso-3' → el valor de --color-curso-3.
 * Si el curso no tiene color válido, se usa el de los bloques del plan.
 * @param {string} color  uno de COLORES_CURSO (web/motor/tipos.js)
 */
export function colorDeCurso(color, colores = leerColores()) {
  return (/^curso-[1-8]$/.test(color ?? '') && colores[claveDeColor(color)]) || colores.planBloque;
}

/** Color de un nivel de bloqueo: 'aviso', 'friccion', 'total' ('ninguno' u otro → neutral). */
export function colorDeNivel(nivel, colores = leerColores()) {
  return { aviso: colores.nivelAviso, friccion: colores.nivelFriccion, total: colores.nivelTotal }[nivel] ?? colores.neutral;
}

/**
 * El mismo color con otra opacidad: conAlfa('rgb(47, 158, 107)', 0.2) → 'rgba(47, 158, 107, 0.2)'.
 * Sirve para rellenos suaves (sin inventar colores nuevos).
 */
export function conAlfa(color, alfa) {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(color ?? '');
  if (!m) return color;
  const base = m[4] === undefined ? 1 : Number(m[4]);
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${Number((base * alfa).toFixed(3))})`;
}

// ── Detalle al pasar el mouse (tooltip) ──

/** Escapa un texto para meterlo en HTML (los títulos de ventana pueden traer "<" o "&"). */
export function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * Estilo común del detalle de ECharts (tooltip): superficie, borde, radio y sombra de tokens.css.
 * Ya viene en el tema de crearGrafico; se exporta para quien arme un tooltip a mano.
 */
export function estiloTooltip(c) {
  return {
    backgroundColor: c.superficie,
    borderColor: c.borde,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: c.texto, fontFamily: c.fuente, fontSize: 12 },
    // Las variables de CSS funcionan aquí porque ECharts pone esto como estilo del <div> del detalle.
    extraCssText: 'border-radius: var(--radio-m); box-shadow: var(--sombra-emergente); max-width: 360px; white-space: normal;',
    className: 'grafico-tooltip',
    transitionDuration: 0, // el detalle sigue al mouse sin retraso
    confine: true,         // nunca se sale del gráfico
  };
}

/**
 * HTML de un detalle con título y filas "■ nombre ……… valor".
 * @param {{titulo?: string, filas: Array<{color?: string, nombre: string, valor?: string, fuerte?: boolean}>, pie?: string}} contenido
 *   textos sin escapar (esta función los escapa)
 * @returns {string}
 */
export function tooltipHtml({ titulo, filas = [], pie }) {
  const partes = [];
  if (titulo) partes.push(`<div class="grafico-tooltip-titulo">${escaparHtml(titulo)}</div>`);
  for (const fila of filas) {
    const marca = fila.color ? `<span class="grafico-tooltip-marca" style="background:${escaparHtml(fila.color)}"></span>` : '';
    partes.push(`<div class="grafico-tooltip-fila${fila.fuerte ? ' grafico-tooltip-fila-fuerte' : ''}">${marca}`
      + `<span class="grafico-tooltip-nombre">${escaparHtml(fila.nombre)}</span>`
      + `<span class="grafico-tooltip-valor">${escaparHtml(fila.valor ?? '')}</span></div>`);
  }
  if (pie) partes.push(`<div class="grafico-tooltip-pie">${escaparHtml(pie)}</div>`);
  return partes.join('');
}

/**
 * Formateador para `tooltip: { trigger: 'axis' }` (barras apiladas por hora o por día):
 * una fila por serie con valor > 0, de mayor a menor, y el total al final.
 * @param {{titulo?: (valorDelEje: string) => string, valor?: (v: number) => string, total?: boolean}} [opciones]
 *   valor: cómo se escribe cada número (por defecto, segundos → "2 h 05 min")
 * @returns {(params: object[]) => string}
 */
export function formatoTooltipEje({ titulo = (v) => v, valor = duracionLegible, total = true } = {}) {
  return (params) => {
    const lista = Array.isArray(params) ? params : [params];
    const numero = (p) => (Array.isArray(p.value) ? p.value[p.encode?.y?.[0] ?? 1] : p.value);
    const conValor = lista.filter((p) => Number(numero(p)) > 0).sort((a, b) => numero(b) - numero(a));
    const filas = conValor.map((p) => ({ color: p.color, nombre: p.seriesName, valor: valor(Number(numero(p))) }));
    if (total && conValor.length > 1) {
      filas.push({ nombre: 'Total', valor: valor(conValor.reduce((s, p) => s + Number(numero(p)), 0)), fuerte: true });
    }
    if (!filas.length) filas.push({ nombre: 'Sin datos', valor: '' });
    return tooltipHtml({ titulo: titulo(lista[0]?.axisValueLabel ?? lista[0]?.name ?? ''), filas });
  };
}

/**
 * Formateador para `tooltip: { trigger: 'item' }` (tortas, mapas de calor, puntos): nombre y valor.
 * @param {{valor?: (v: number, p: object) => string, titulo?: (p: object) => string}} [opciones]
 * @returns {(p: object) => string}
 */
export function formatoTooltipItem({ valor = duracionLegible, titulo = (p) => p.seriesName } = {}) {
  return (p) => {
    const v = Array.isArray(p.value) ? p.value[p.value.length - 1] : p.value;
    return tooltipHtml({ titulo: titulo(p), filas: [{ color: p.color, nombre: p.name, valor: valor(Number(v), p) }] });
  };
}

// ── Tema y gráfico ──

/** Tema de ECharts armado con los tokens (ejes, textos, leyenda, tooltip, zoom). */
function temaDesdeTokens(c) {
  const eje = {
    axisLine: { show: true, lineStyle: { color: c.borde } },
    axisTick: { show: false },
    axisLabel: { color: c.textoSuave, fontFamily: c.fuenteNumeros, fontSize: 11 },
    splitLine: { lineStyle: { color: c.borde } },
    splitArea: { show: false },
    nameTextStyle: { color: c.textoSuave, fontSize: 11 },
  };
  return {
    color: [c.estudio, c.distraccion, c.neutral, c.sinClasificar, c.afk, c.acento,
      c.curso1, c.curso2, c.curso3, c.curso4, c.curso5, c.curso6, c.curso7, c.curso8],
    backgroundColor: 'transparent', // se ve el fondo de la tarjeta
    textStyle: { color: c.texto, fontFamily: c.fuente },
    title: { textStyle: { color: c.texto }, subtextStyle: { color: c.textoSuave } },
    legend: {
      icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 16,
      textStyle: { color: c.textoSuave, fontSize: 12 }, inactiveColor: c.borde,
    },
    tooltip: estiloTooltip(c),
    // Los valores solo con líneas de división suaves (sin línea de eje); categorías y tiempo con línea de eje.
    categoryAxis: { ...eje, splitLine: { show: false } },
    valueAxis: { ...eje, axisLine: { show: false }, splitLine: { show: true, lineStyle: { color: c.borde } } },
    timeAxis: { ...eje, splitLine: { show: false } },
    logAxis: { ...eje, axisLine: { show: false } },
    dataZoom: {
      borderColor: c.borde,
      fillerColor: c.acentoSuave,
      textStyle: { color: c.textoSuave, fontSize: 11 },
      handleStyle: { color: c.superficie, borderColor: c.bordeFuerte },
      moveHandleStyle: { color: c.borde },
      dataBackground: { lineStyle: { color: c.borde }, areaStyle: { color: c.superficie2 } },
      selectedDataBackground: { lineStyle: { color: c.acento }, areaStyle: { color: c.acentoSuave } },
      emphasis: { handleStyle: { borderColor: c.acento }, moveHandleStyle: { color: c.acento } },
    },
    markLine: { label: { color: c.textoSuave } },
  };
}

/** ¿La persona pidió "reducir movimiento" en Windows? Entonces los gráficos no se animan. */
function reducirMovimiento() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animación corta al aparecer y ninguna al actualizar (un gráfico que se refresca cada minuto no debe "bailar").
 * Las opciones de la vista pueden cambiarla (van después).
 */
function opcionesDeAnimacion() {
  if (reducirMovimiento()) return { animation: false };
  return { animationDuration: 200, animationEasing: 'cubicOut', animationDurationUpdate: 0 };
}

/**
 * Crea un gráfico que se redibuja solo al cambiar el tema o el tamaño.
 * @param {HTMLElement} elemento  contenedor (necesita alto, por ejemplo con la clase .grafico de componentes.css).
 * @param {(colores: object) => object} armarOpciones  devuelve las opciones de ECharts.
 * @param {Object} [extra]
 * @param {() => boolean} [extra.vacio]  si devuelve true, se muestra `textoVacio` centrado (y el gráfico, vacío, detrás)
 * @param {string} [extra.textoVacio="Sin datos en este período"]
 * @param {boolean} [extra.cargando=false]  empieza mostrando "Cargando…"
 * @param {(instancia: object) => void} [extra.alIniciar]  se llama tras crear la instancia de ECharts
 *   (también al cambiar el tema, que la crea de nuevo): sirve para escuchar sus eventos.
 * @returns {{ actualizar: (armarOpciones?: Function, extra?: {vacio?: Function, textoVacio?: string}) => void,
 *             cargando: (si: boolean) => void, destruir: () => void, instancia: () => object }}
 */
export function crearGrafico(elemento, armarOpciones, extra = {}) {
  let { vacio = null, textoVacio = 'Sin datos en este período', alIniciar = null } = extra;
  let instancia = null;

  // ECharts dibuja en un <div> propio; al lado va la capa de los estados (vacío y cargando).
  if (getComputedStyle(elemento).position === 'static') elemento.style.position = 'relative';
  const lienzo = document.createElement('div');
  lienzo.className = 'grafico-lienzo';
  lienzo.style.cssText = 'position: absolute; inset: 0;';
  const capa = document.createElement('div');
  capa.className = 'grafico-estado';
  capa.setAttribute('aria-live', 'polite');
  elemento.append(lienzo, capa);

  function opciones(colores) {
    return { ...opcionesDeAnimacion(), ...armarOpciones(colores) };
  }

  // Capa de estado: cargando manda sobre vacío.
  let estaCargando = false;
  let temporizadorCarga = null;
  function pintarEstado() {
    if (estaCargando) {
      capa.dataset.estado = 'cargando';
      capa.replaceChildren(Object.assign(document.createElement('span'), { className: 'grafico-estado-giro' }),
        Object.assign(document.createElement('span'), { textContent: 'Cargando…' }));
    } else if (vacio && vacio()) {
      capa.dataset.estado = 'vacio';
      capa.replaceChildren(Object.assign(document.createElement('span'), { textContent: textoVacio }));
    } else {
      delete capa.dataset.estado;
      capa.replaceChildren();
    }
  }

  function dibujar() {
    const colores = leerColores();
    if (instancia) instancia.dispose(); // ECharts fija el tema al crear: hay que crear de nuevo
    instancia = echarts.init(lienzo, temaDesdeTokens(colores));
    instancia.setOption(opciones(colores));
    if (alIniciar) alIniciar(instancia);
    pintarEstado();
  }

  dibujar();
  const alCambiarTema = () => dibujar();
  document.addEventListener('tema-cambiado', alCambiarTema);
  const observador = new ResizeObserver(() => instancia.resize());
  observador.observe(elemento);

  const grafico = {
    /** Redibuja (con nuevas opciones, si se pasan). `extra` puede cambiar `vacio` y `textoVacio`. */
    actualizar(nuevasOpciones, nuevoExtra = {}) {
      if (nuevasOpciones) armarOpciones = nuevasOpciones;
      if ('vacio' in nuevoExtra) vacio = nuevoExtra.vacio;
      if ('textoVacio' in nuevoExtra) textoVacio = nuevoExtra.textoVacio;
      instancia.setOption(opciones(leerColores()), { notMerge: true });
      pintarEstado();
    },
    /**
     * Muestra u oculta "Cargando…". Para que una carga rápida no parpadee, aparece recién a los 150 ms.
     * @param {boolean} si
     */
    cargando(si) {
      clearTimeout(temporizadorCarga);
      if (si) {
        temporizadorCarga = setTimeout(() => { estaCargando = true; pintarEstado(); }, 150);
      } else {
        estaCargando = false;
        pintarEstado();
      }
    },
    /** Libera el gráfico (llamar al salir de la vista). */
    destruir() {
      clearTimeout(temporizadorCarga);
      document.removeEventListener('tema-cambiado', alCambiarTema);
      observador.disconnect();
      instancia.dispose();
      lienzo.remove();
      capa.remove();
    },
    instancia: () => instancia,
  };
  if (extra.cargando) {
    estaCargando = true; // al crear se muestra enseguida: todavía no hay nada que ver
    pintarEstado();
  }
  return grafico;
}
