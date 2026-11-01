// Gráficos con ECharts (archivo local en web/lib/), con un tema que sale de css/tokens.css.
// Así los gráficos usan los mismos colores que el resto del dashboard y cambian con el modo oscuro.
//
// Uso:
//   import { crearGrafico, colorDeClase } from '../graficos.js';
//   const g = crearGrafico(elemento, (c) => ({ ...opciones de ECharts... }));
// La función recibe `c` (los colores ya resueltos) y devuelve las opciones. Se vuelve a llamar
// cada vez que cambia el tema, para redibujar con los colores nuevos.

import * as echarts from '../lib/echarts.esm.min.js';

// Variables de tokens.css que se traducen a colores para ECharts.
const TOKENS_DE_COLOR = {
  estudio: '--color-estudio',
  distraccion: '--color-distraccion',
  neutral: '--color-neutral',
  sinClasificar: '--color-sin-clasificar',
  afk: '--color-afk',
  sinPc: '--color-sin-pc',
  acento: '--color-acento',
  fondo: '--color-fondo',
  superficie: '--color-superficie',
  borde: '--color-borde',
  texto: '--color-texto',
  textoSuave: '--color-texto-suave',
};

/**
 * Lee los colores de tokens.css ya resueltos (por ejemplo "rgb(47, 158, 107)").
 * Truco: getPropertyValue('--color-estudio') devolvería el texto "light-dark(...)", que ECharts
 * no entiende. Por eso se pinta un elemento invisible con ese color y se lee su color final.
 */
export function leerColores() {
  const sonda = document.createElement('span');
  sonda.style.display = 'none';
  document.body.append(sonda);
  const colores = {};
  for (const [nombre, variable] of Object.entries(TOKENS_DE_COLOR)) {
    sonda.style.color = `var(${variable})`;
    colores[nombre] = getComputedStyle(sonda).color;
  }
  sonda.remove();
  colores.fuente = getComputedStyle(document.documentElement).getPropertyValue('--fuente-texto').trim();
  return colores;
}

/** Color de una clase o estado: 'estudio', 'distraccion', 'neutral', 'sin-clasificar', 'afk', 'sin-pc'. */
export function colorDeClase(clase, colores = leerColores()) {
  const nombre = clase.replace(/-(\w)/g, (_, letra) => letra.toUpperCase()); // 'sin-pc' → 'sinPc'
  return colores[nombre];
}

/** Tema de ECharts armado con los tokens (ejes, textos, leyenda, tooltip). */
function temaDesdeTokens(c) {
  const eje = {
    axisLine: { lineStyle: { color: c.borde } },
    axisTick: { lineStyle: { color: c.borde } },
    axisLabel: { color: c.textoSuave },
    splitLine: { lineStyle: { color: c.borde } },
    nameTextStyle: { color: c.textoSuave },
  };
  return {
    color: [c.estudio, c.distraccion, c.neutral, c.sinClasificar, c.afk, c.acento],
    backgroundColor: 'transparent', // se ve el fondo de la tarjeta
    textStyle: { color: c.texto, fontFamily: c.fuente },
    title: { textStyle: { color: c.texto }, subtextStyle: { color: c.textoSuave } },
    legend: { textStyle: { color: c.textoSuave } },
    tooltip: {
      backgroundColor: c.superficie,
      borderColor: c.borde,
      textStyle: { color: c.texto },
    },
    categoryAxis: eje,
    valueAxis: eje,
    timeAxis: eje,
  };
}

/**
 * Crea un gráfico que se redibuja solo al cambiar el tema o el tamaño.
 * @param {HTMLElement} elemento  contenedor (necesita alto, por ejemplo con CSS).
 * @param {(colores: object) => object} armarOpciones  devuelve las opciones de ECharts.
 * @returns {{ actualizar: (armarOpciones?: Function) => void, destruir: () => void, instancia: () => object }}
 */
export function crearGrafico(elemento, armarOpciones) {
  let instancia = null;

  function dibujar() {
    const colores = leerColores();
    if (instancia) instancia.dispose(); // ECharts fija el tema al crear: hay que crear de nuevo
    instancia = echarts.init(elemento, temaDesdeTokens(colores));
    instancia.setOption(armarOpciones(colores));
  }

  dibujar();
  const alCambiarTema = () => dibujar();
  document.addEventListener('tema-cambiado', alCambiarTema);
  const observador = new ResizeObserver(() => instancia.resize());
  observador.observe(elemento);

  return {
    /** Redibuja (con nuevas opciones, si se pasan). */
    actualizar(nuevasOpciones) {
      if (nuevasOpciones) armarOpciones = nuevasOpciones;
      instancia.setOption(armarOpciones(leerColores()), { notMerge: true });
    },
    /** Libera el gráfico (llamar al salir de la vista). */
    destruir() {
      document.removeEventListener('tema-cambiado', alCambiarTema);
      observador.disconnect();
      instancia.dispose();
    },
    instancia: () => instancia,
  };
}
