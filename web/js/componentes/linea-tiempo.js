// Línea de tiempo con carriles (F2-03, F3-06, F4-07). La usan Hoy, el Simulador y el Diario.
//
//   Plan            [▌Programación II ]  [Clase · BD ]      [▌Cálculo I ]
//                        ▬ rutina                                 •
//   Real            ████▓▓██░░░░░░█████████▓▓▓▓█████████
//   Intervenciones        ●  ●  ▲ ◆          ■
//   Cortes                ╱╱╱      ╱╱╱╱
//                  08:00      10:00      12:00      14:00 …
//                  [================ zoom ================]
//
// - Eje de tiempo en hora de Lima. El navegador puede estar en otra zona: las horas se escriben con
//   horaLocal() de fechas.js, nunca con la zona del sistema.
// - Zoom con la rueda del mouse, arrastrar para moverse, barra deslizable abajo; doble clic: vuelve a todo el rango.
// - Detalle al pasar el mouse (siempre dice la clase en texto, no solo con el color). Clic → alElegir(item).
// - Cada carril es una "rejilla" (grid) de ECharts con su propio alto; todas comparten el zoom.
//
// Uso:
//   const linea = crearLineaTiempo(contenedor, {
//     inicio: dia.inicio, fin: dia.fin, ahora: reloj.ahora(),          // instantes en ms
//     carriles: [
//       { tipo: 'plan', datos: items, cursos: plan.cursos },           // ItemsDelDia (+ cursos para los nombres)
//       { tipo: 'real', datos: segmentos },                             // Segmento[] o SegmentoConContexto[]
//       { tipo: 'intervenciones', datos: simulacion.intervenciones },   // Intervencion[]
//       { tipo: 'cortes', datos: simulacion.cortes, nivel: 'friccion' },// ResultadoSimulacion.cortes
//     ],
//     alElegir: (item, { carril }) => console.log(carril, item),
//   });
//   linea.actualizar({ ahora, carriles });   // conserva el zoom si inicio y fin no cambian
//   linea.destruir();                        // al salir de la vista

import { el, reemplazar } from '../dom.js';
import { crearGrafico, colorDeClase, colorDeCurso, colorDeNivel, conAlfa } from '../graficos.js';
import { horaLocal, DESFASE_LIMA_MIN } from '../fechas.js';
import { duracionLegible } from '../formato.js';
import { ESTADOS, NOMBRE_ESTADO, NOMBRE_NIVEL, NOMBRE_TIPO_BLOQUE } from '../../motor/tipos.js';

// ── Medidas (en píxeles) ──
const ALTO_CARRIL = { plan: 40, real: 30, intervenciones: 24, cortes: 18 };
const NOMBRE_CARRIL = { plan: 'Plan', real: 'Real', intervenciones: 'Intervenciones', cortes: 'Cortes' };
const MARGEN = { arriba: 22, izquierda: 112, derecha: 16, separacion: 8, eje: 24, zoom: 16, abajo: 6 };
const FILA_RUTINAS = 8;                 // alto de la fila de rutinas, abajo del carril Plan
const ZOOM_MINIMO_MS = 2 * 60 * 1000;   // no se puede acercar a menos de 2 minutos
const TOLERANCIA_MARCA_PX = 6;          // distancia del mouse a una intervención para mostrar su detalle

// ── Hora de Lima en el eje ──
// ECharts elige las marcas del eje (08:00, 10:00…) según la zona del navegador o UTC (`useUTC`).
// Para que caigan en horas redondas de LIMA, el eje usa la "hora de pared" de Lima: el instante corrido
// −5 h y tratado como UTC. aEje() y deEje() pasan de un instante real al eje y de vuelta.
const MS_DESFASE = DESFASE_LIMA_MIN * 60 * 1000;
const aEje = (instante) => instante + MS_DESFASE;
const deEje = (valor) => valor - MS_DESFASE;

// ── Textos ──
const NOMBRE_ACCION = {
  aviso: 'Aviso', friccion: 'Fricción', bloqueo: 'Bloqueo', pase: 'Pase',
  escalamiento: 'Escalamiento a fricción', salida_emergencia: 'Salida de emergencia',
};
// Forma de cada acción (además del color del nivel: el color nunca va solo).
const FORMA_ACCION = {
  aviso: 'circulo', friccion: 'rombo', bloqueo: 'cuadro', pase: 'anillo', escalamiento: 'triangulo', salida_emergencia: 'cruz',
};
// Nivel con el que se muestra cada acción en la leyenda (en el gráfico manda el nivel de la intervención).
const NIVEL_DE_ACCION = { aviso: 'aviso', friccion: 'friccion', bloqueo: 'total', pase: 'friccion', escalamiento: 'friccion', salida_emergencia: 'total' };
const NOMBRE_MOTIVO = {
  fuera_de_bloque: 'Fuera de un bloque', nivel_ninguno: 'El bloque no tiene nivel', protegido: 'Protegido (dashboard, AW o el sistema)',
  ia: 'IA: no se bloquea', nunca_bloquear: 'Está en "nunca bloquear"', pase_vigente: 'Tenía un pase vigente',
  no_bloqueable: 'No se puede bloquear', distraccion: 'Distracción dentro de un bloque', patron_url: 'Coincide con un patrón de URL extra',
  sin_clasificar: 'Sin clasificar (nivel total)',
};
const NOMBRE_CONTEXTO = { bloque: 'Bloque', clase: 'Clase', rutina: 'Rutina', libre: 'Tiempo libre' };
const NOMBRE_TIPO_CLASE = { teoria: 'Teoría', laboratorio: 'Laboratorio' };
const NOMBRE_MEDICION = { pc: 'medida en la PC', checkin: 'con check-in', dia_logico: 'hora del día lógico' };
const EXPLICACION_ESTADO = { afk: 'PC encendida sin uso', 'sin-pc': 'Sin datos: PC apagada o suspendida' };

// ── Formatos del detalle ──

/** "HH:MM:SS" en Lima (los segmentos duran segundos; AW también muestra los segundos). */
function horaConSegundos(instante) {
  const s = Math.floor(instante / 1000) % 60;
  return `${horaLocal(instante)}:${String(s).padStart(2, '0')}`;
}

/** Duración con segundos cuando es corta: "45 s", "2 min 28 s"; si no, "1 h 05 min". */
function duracionDetalle(segundos) {
  const s = Math.round(segundos);
  if (s < 60) return `${s} s`;
  if (s < 600 && s % 60) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  return duracionLegible(s);
}

function rangoDeHoras(inicio, fin, conSegundos) {
  const hora = conSegundos ? horaConSegundos : horaLocal;
  return `${hora(inicio)} – ${hora(fin)} · ${duracionDetalle((fin - inicio) / 1000)}`;
}

/** Variable de tokens.css de un estado: 'sin-pc' → 'var(--color-sin-pc)'. */
const varDeEstado = (estado) => `var(--color-${ESTADOS.includes(estado) ? estado : 'sin-clasificar'})`;
/** ¿Se ve en oscuro? (data-tema de js/tema.js manda; si no hay, el sistema). Solo cambia la opacidad de los rellenos. */
function modoOscuro() {
  const tema = document.documentElement.dataset.tema;
  if (tema) return tema === 'oscuro';
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

const varDeNivel = (nivel) => (['aviso', 'friccion', 'total'].includes(nivel) ? `var(--color-nivel-${nivel})` : 'var(--color-neutral)');

// ─────────────────────────────────────────────────────────────────────────────
// Preparar los datos de cada carril (una vez por actualización, no en cada cuadro)
// ─────────────────────────────────────────────────────────────────────────────

/** Copia ordenada por inicio (sin cambiar la lista original). */
function ordenados(lista, clave = 'inicio') {
  return [...(lista ?? [])].sort((a, b) => a[clave] - b[clave]);
}

/**
 * Real: los segmentos para el detalle, y "grupos" para dibujar: segmentos seguidos con el mismo estado se dibujan
 * como un solo rectángulo (se ven igual y son muchos menos; con 3000 segmentos de pocos segundos, el zoom sigue fluido).
 */
function prepararReal(carril) {
  const items = ordenados(carril.datos).filter((s) => s && s.fin > s.inicio);
  const grupos = [];
  for (const s of items) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.clase === s.clase && s.inicio - ultimo.fin <= 1000) ultimo.fin = Math.max(ultimo.fin, s.fin);
    else grupos.push({ inicio: s.inicio, fin: s.fin, clase: s.clase });
  }
  const conActividad = items.some((s) => s.clase !== 'sin-pc');
  return { items, dibujo: grupos, vacio: !conActividad, textoVacio: 'Sin actividad registrada' };
}

/** Plan: bloques, clases y rutinas con franja (las rutinas van en una fila fina abajo del carril). */
function prepararPlan(carril) {
  const datos = carril.datos ?? {};
  const cursos = new Map((carril.cursos ?? []).map((c) => [c.id, c]));
  // Color por curso si se pasa el mapa `colores` (o colorPor: 'curso'); si no, por tipo.
  const porCurso = carril.colorPor ? carril.colorPor === 'curso' : Boolean(carril.colores);
  const colorDelCurso = (id) => carril.colores?.[id] ?? cursos.get(id)?.color ?? null;
  const nombreCurso = (id) => cursos.get(id)?.nombre ?? id ?? '';
  const color = (tipo, curso) => (porCurso && tipo !== 'rutina'
    ? { token: colorDelCurso(curso), variable: /^curso-[1-8]$/.test(colorDelCurso(curso) ?? '') ? `var(--color-${colorDelCurso(curso)})` : 'var(--color-plan-bloque)' }
    : { token: null, variable: `var(--color-plan-${tipo})` });

  const bloques = (datos.bloques ?? []).filter((b) => b.fin > b.inicio).map((b) => ({
    tipo: 'bloque', item: b, inicio: b.inicio, fin: b.fin, ...color('bloque', b.curso),
    etiqueta: nombreCurso(b.curso) + (b.tipo === 'examen' ? ' · examen' : b.tipo === 'estudio_papel' ? ' · papel' : ''),
  }));
  const clases = (datos.clases ?? []).filter((c) => c.fin > c.inicio).map((c) => ({
    tipo: 'clase', item: c, inicio: c.inicio, fin: c.fin, ...color('clase', c.curso),
    etiqueta: `Clase · ${nombreCurso(c.curso)}`,
  }));
  const rutinas = (datos.rutinas ?? []).filter((r) => r.inicio !== null && r.inicio !== undefined).map((r) => {
    const conFranja = r.fin !== null && r.fin !== undefined && r.fin > r.inicio;
    return { tipo: 'rutina', item: r, inicio: r.inicio, fin: conFranja ? r.fin : r.inicio, marca: !conFranja, ...color('rutina'), etiqueta: r.nombre };
  });
  // Orden de dibujo: clases, encima bloques (bloque > clase, como en asignarContexto), y las rutinas en su fila.
  const dibujo = [...ordenados(clases), ...ordenados(bloques), ...ordenados(rutinas)];
  return { items: dibujo, dibujo, porCurso, nombreCurso, vacio: dibujo.length === 0, textoVacio: 'Nada planificado' };
}

function prepararIntervenciones(carril) {
  const items = ordenados(carril.datos, 'instante').map((i) => ({ item: i, inicio: i.instante, fin: i.instante }));
  return { items, dibujo: items, vacio: items.length === 0, textoVacio: 'Sin intervenciones' };
}

function prepararCortes(carril) {
  const items = ordenados(carril.datos).filter((c) => c.fin > c.inicio).map((c) => ({ item: c, inicio: c.inicio, fin: c.fin }));
  return { items, dibujo: items, vacio: items.length === 0, textoVacio: 'Nada cortado' };
}

const PREPARAR = { plan: prepararPlan, real: prepararReal, intervenciones: prepararIntervenciones, cortes: prepararCortes };

// ─────────────────────────────────────────────────────────────────────────────
// Dibujo (renderItem de las series "custom" de ECharts: se llama por cada elemento visible)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rectángulo de un tramo en píxeles, recortado al carril (con zoom, un tramo puede salirse por los lados).
 * null si queda fuera de la vista.
 */
function franja(api, cs, arriba, alto, minimo = 1) {
  let x0 = api.coord([api.value(0), 0])[0];
  let x1 = api.coord([api.value(1), 0])[0];
  if (x1 < cs.x || x0 > cs.x + cs.width) return null;
  x0 = Math.max(x0, cs.x);
  x1 = Math.min(x1, cs.x + cs.width);
  return { x: x0, y: cs.y + arriba, width: Math.max(x1 - x0, minimo), height: alto };
}

function dibujarReal(carril, c) {
  const color = Object.fromEntries(ESTADOS.map((e) => [e, colorDeClase(e, c)]));
  return (params, api) => {
    const grupo = carril.dibujo[params.dataIndex];
    const forma = franja(api, params.coordSys, 3, params.coordSys.height - 6);
    if (!forma) return null;
    return { type: 'rect', shape: forma, style: { fill: color[grupo.clase] ?? color['sin-clasificar'] } };
  };
}

function dibujarPlan(carril, c) {
  const relleno = c.esOscuro ? 0.2 : 0.12; // muy suave
  const colorDe = (d) => (carril.porCurso && d.tipo !== 'rutina' ? colorDeCurso(d.token, c) : c[{ bloque: 'planBloque', clase: 'planClase', rutina: 'planRutina' }[d.tipo]]);
  return (params, api) => {
    const d = carril.dibujo[params.dataIndex];
    const cs = params.coordSys;
    const color = colorDe(d);
    if (d.tipo === 'rutina') {
      const arriba = cs.height - FILA_RUTINAS - 2;
      if (d.marca) { // rutina de una sola hora (despertar, dormir): un punto
        const x = api.coord([api.value(0), 0])[0];
        if (x < cs.x || x > cs.x + cs.width) return null;
        return { type: 'circle', shape: { cx: x, cy: cs.y + arriba + FILA_RUTINAS / 2, r: 3.5 }, style: { fill: c.superficie, stroke: color, lineWidth: 1.5 } };
      }
      // Solo contorno y relleno muy suave: así no se confunde con un segmento de IA del carril Real.
      const forma = franja(api, cs, arriba, FILA_RUTINAS, 2);
      return forma && { type: 'rect', shape: { ...forma, r: 2 }, style: { fill: conAlfa(color, relleno * 0.7), stroke: color, lineWidth: 1 } };
    }
    const forma = franja(api, cs, 3, cs.height - FILA_RUTINAS - 8, 2);
    if (!forma) return null;
    const esBloque = d.tipo === 'bloque';
    const hijos = [{
      type: 'rect', shape: { ...forma, r: 3 },
      // El plan nunca va con relleno sólido (sus colores se repiten en el carril Real): relleno muy suave + contorno
      // + etiqueta de texto. Bloque: contorno continuo y una barra a la izquierda. Clase: contorno punteado.
      style: esBloque
        ? { fill: conAlfa(color, relleno), stroke: conAlfa(color, 0.85), lineWidth: 1 }
        : { fill: conAlfa(color, relleno * 0.5), stroke: conAlfa(color, 0.85), lineWidth: 1, lineDash: [4, 3] },
    }];
    if (esBloque) hijos.push({ type: 'rect', shape: { x: forma.x, y: forma.y, width: Math.min(3, forma.width), height: forma.height, r: [3, 0, 0, 3] }, style: { fill: color } });
    if (forma.width > 34) {
      hijos.push({
        type: 'text', x: forma.x + (esBloque ? 9 : 7), y: forma.y + forma.height / 2,
        style: {
          text: d.etiqueta, fill: c.texto, font: `600 11px ${c.fuente}`, textVerticalAlign: 'middle',
          width: forma.width - (esBloque ? 14 : 12), overflow: 'truncate', ellipsis: '…',
        },
      });
    }
    return { type: 'group', children: hijos };
  };
}

/** Símbolo de una intervención (forma según la acción, color según el nivel). */
function simbolo(accion, x, y, color, c) {
  const borde = { stroke: c.superficie, lineWidth: 1 };
  switch (FORMA_ACCION[accion]) {
    case 'rombo': return { type: 'polygon', shape: { points: [[x, y - 5.5], [x + 5.5, y], [x, y + 5.5], [x - 5.5, y]] }, style: { fill: color, ...borde } };
    case 'cuadro': return { type: 'rect', shape: { x: x - 4.5, y: y - 4.5, width: 9, height: 9, r: 1 }, style: { fill: color, ...borde } };
    case 'anillo': return { type: 'circle', shape: { cx: x, cy: y, r: 4 }, style: { fill: c.superficie, stroke: color, lineWidth: 2 } };
    case 'triangulo': return { type: 'polygon', shape: { points: [[x, y - 5.5], [x + 5.5, y + 4.5], [x - 5.5, y + 4.5]] }, style: { fill: color, ...borde } };
    case 'cruz': return {
      type: 'group', children: [
        { type: 'line', shape: { x1: x - 4, y1: y - 4, x2: x + 4, y2: y + 4 }, style: { stroke: color, lineWidth: 2.5, lineCap: 'round' } },
        { type: 'line', shape: { x1: x - 4, y1: y + 4, x2: x + 4, y2: y - 4 }, style: { stroke: color, lineWidth: 2.5, lineCap: 'round' } },
      ],
    };
    default: return { type: 'circle', shape: { cx: x, cy: y, r: 4.5 }, style: { fill: color, ...borde } };
  }
}

function dibujarIntervenciones(carril, c) {
  return (params, api) => {
    const { item } = carril.dibujo[params.dataIndex];
    const cs = params.coordSys;
    const x = api.coord([api.value(0), 0])[0];
    if (x < cs.x - 6 || x > cs.x + cs.width + 6) return null;
    const color = colorDeNivel(item.nivel, c);
    return {
      type: 'group', children: [
        { type: 'line', shape: { x1: x, y1: cs.y + 2, x2: x, y2: cs.y + cs.height - 2 }, style: { stroke: conAlfa(color, 0.5), lineWidth: 1 } },
        simbolo(item.accion, x, cs.y + cs.height / 2, color, c),
      ],
    };
  };
}

/** Patrón rayado (diagonales) para los cortes, hecho en un lienzo chico que ECharts repite. */
function patronRayado(color) {
  const lado = 6;
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = lado;
  const ctx = lienzo.getContext('2d');
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const desplazamiento of [-lado, 0, lado]) { // tres diagonales para que el patrón empalme sin cortes
    ctx.moveTo(desplazamiento, lado);
    ctx.lineTo(desplazamiento + lado, 0);
  }
  ctx.stroke();
  return { image: lienzo, repeat: 'repeat' };
}

function dibujarCortes(carril, c) {
  const color = colorDeNivel(carril.nivel ?? 'total', c);
  const rayado = patronRayado(conAlfa(color, 0.75));
  return (params, api) => {
    const forma = franja(api, params.coordSys, 2, params.coordSys.height - 4, 2);
    if (!forma) return null;
    return {
      type: 'group', children: [
        { type: 'rect', shape: forma, style: { fill: conAlfa(color, 0.12), stroke: conAlfa(color, 0.6), lineWidth: 1 } },
        { type: 'rect', shape: forma, style: { fill: rayado } },
      ],
    };
  };
}

const DIBUJAR = { plan: dibujarPlan, real: dibujarReal, intervenciones: dibujarIntervenciones, cortes: dibujarCortes };

// ─────────────────────────────────────────────────────────────────────────────
// Buscar el elemento bajo el mouse
// ─────────────────────────────────────────────────────────────────────────────

/** Índice del último elemento con inicio ≤ t (búsqueda binaria; la lista está ordenada por inicio). */
function ultimoQueEmpiezaAntes(lista, t) {
  let bajo = 0;
  let alto = lista.length - 1;
  let encontrado = -1;
  while (bajo <= alto) {
    const medio = (bajo + alto) >> 1;
    if (lista[medio].inicio <= t) { encontrado = medio; bajo = medio + 1; } else alto = medio - 1;
  }
  return encontrado;
}

const BUSCAR = {
  // El segmento REAL bajo el mouse (no el grupo dibujado).
  real(carril, t) {
    const i = ultimoQueEmpiezaAntes(carril.items, t);
    return i >= 0 && t < carril.items[i].fin ? carril.items[i] : null;
  },
  plan(carril, t, msPorPx, y) {
    const enFilaRutinas = y >= carril.alto - FILA_RUTINAS - 4;
    const cubre = (d) => (d.marca ? Math.abs(d.inicio - t) <= TOLERANCIA_MARCA_PX * msPorPx : d.inicio <= t && t < d.fin);
    const rutina = carril.items.find((d) => d.tipo === 'rutina' && cubre(d));
    const bloque = carril.items.find((d) => d.tipo === 'bloque' && cubre(d));
    const clase = carril.items.find((d) => d.tipo === 'clase' && cubre(d));
    return (enFilaRutinas ? (rutina ?? bloque ?? clase) : (bloque ?? clase ?? rutina)) ?? null;
  },
  intervenciones(carril, t, msPorPx) {
    const limite = TOLERANCIA_MARCA_PX * msPorPx;
    const i = ultimoQueEmpiezaAntes(carril.items, t);
    let mejor = null;
    for (const j of [i, i + 1]) {
      const d = carril.items[j];
      if (d && Math.abs(d.inicio - t) <= limite && (!mejor || Math.abs(d.inicio - t) < Math.abs(mejor.inicio - t))) mejor = d;
    }
    return mejor;
  },
  cortes(carril, t) {
    return carril.items.find((d) => d.inicio <= t && t < d.fin) ?? null;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea la línea de tiempo dentro de `contenedor`.
 * @param {HTMLElement} contenedor
 * @param {Object} opciones
 * @param {number} opciones.inicio  instante (ms) del borde izquierdo (por ejemplo, el inicio del día lógico)
 * @param {number} opciones.fin     instante (ms) del borde derecho; si no es mayor que inicio, se muestran 24 h
 * @param {Array<{tipo: ('plan'|'real'|'intervenciones'|'cortes'), datos: *, nombre?: string, alto?: number,
 *   cursos?: Array<{id: string, nombre: string, color: string}>, colores?: Object<string, string>,
 *   colorPor?: ('tipo'|'curso'), nivel?: string}>} opciones.carriles
 *   - plan: datos = ItemsDelDia; `cursos` (plan.cursos) para los nombres; `colores` (cursoId → 'curso-N') o
 *     colorPor: 'curso' para colorear por curso (si no, por tipo: bloque, clase, rutina).
 *   - real: datos = Segmento[] (o SegmentoConContexto[]).
 *   - intervenciones: datos = Intervencion[].
 *   - cortes: datos = [{inicio, fin, objetivo, itemId}] (ResultadoSimulacion.cortes); `nivel` elige el color.
 * @param {number} [opciones.ahora]  instante actual: si cae dentro del rango, se marca con una línea
 * @param {(item: object, info: {carril: string, nombre: string}) => void} [opciones.alElegir]  clic en un elemento:
 *   recibe el objeto original (Segmento, BloqueDia, ClaseDia, RutinaDia, Intervencion o corte)
 * @param {string} [opciones.textoVacio]  si ningún carril tiene datos (por defecto "Sin datos en este período")
 * @returns {{actualizar: (opciones: object) => void, cargando: (si: boolean) => void, destruir: () => void, instancia: () => object}}
 */
export function crearLineaTiempo(contenedor, opciones) {
  let config = { ...opciones };
  let carriles = [];
  let rango = { inicio: 0, fin: 0 };
  let ventana = null;        // tramo visible con el zoom (ms reales)
  let ultimoMouse = null;    // {x, y} dentro del gráfico, o null si el mouse está fuera
  let presionado = null;     // {x, y} donde se apretó el botón (para no tomar un arrastre como clic)
  let actualBajoMouse = null;

  // Estructura: marco (el gráfico) + resalte (borde del elemento bajo el mouse) + detalle + leyenda.
  const marco = el('div', { class: 'linea-tiempo-grafico' });
  const resalte = el('div', { class: 'linea-tiempo-resalte', hidden: true, 'aria-hidden': 'true' });
  const detalle = el('div', { class: 'linea-tiempo-detalle', hidden: true, role: 'tooltip' });
  const leyenda = el('div', { class: 'linea-tiempo-leyenda' });
  const raiz = el('div', { class: 'linea-tiempo' }, marco, resalte, detalle, leyenda);
  contenedor.append(raiz);

  function preparar() {
    rango = { inicio: config.inicio, fin: config.fin > config.inicio ? config.fin : config.inicio + 24 * 3600 * 1000 };
    carriles = (config.carriles ?? []).filter((carril) => PREPARAR[carril.tipo]).map((carril, indice) => ({
      ...carril,
      ...PREPARAR[carril.tipo](carril),
      indice,
      nombre: carril.nombre ?? NOMBRE_CARRIL[carril.tipo],
      alto: carril.alto ?? ALTO_CARRIL[carril.tipo],
    }));
    // Posición vertical de cada carril (la usan el dibujo y la búsqueda bajo el mouse).
    let y = MARGEN.arriba;
    for (const carril of carriles) {
      carril.y = y;
      y += carril.alto + MARGEN.separacion;
    }
    const finCarriles = y - MARGEN.separacion;
    const altoTotal = carriles.length ? finCarriles + MARGEN.eje + MARGEN.zoom + MARGEN.abajo : 120;
    marco.style.height = `${altoTotal}px`;
    marco.dataset.zoomArriba = String(finCarriles + MARGEN.eje);
    // La ventana del zoom se conserva si sigue dentro del rango.
    if (!ventana || ventana.fin <= rango.inicio || ventana.inicio >= rango.fin) ventana = { ...rango };
    ventana = { inicio: Math.max(ventana.inicio, rango.inicio), fin: Math.min(ventana.fin, rango.fin) };
    pintarLeyenda();
  }

  const estaVacio = () => carriles.length === 0 || carriles.every((carril) => carril.vacio);

  /** Opciones de ECharts (se vuelven a armar al cambiar el tema o los datos). */
  function armar(c) {
    if (!carriles.length) return {};
    c = { ...c, esOscuro: modoOscuro() };
    const indices = carriles.map((carril) => carril.indice);
    const ultimo = carriles.length - 1;
    const hora = (valor) => horaLocal(deEje(valor));
    const ahoraDentro = Number.isFinite(config.ahora) && config.ahora >= rango.inicio && config.ahora <= rango.fin;
    const zoomArriba = Number(marco.dataset.zoomArriba);
    const vacios = estaVacio();

    return {
      animation: false, // con miles de rectángulos y actualizaciones cada minuto, mejor sin animación
      useUTC: true,     // ver aEje(): el eje está en "hora de pared" de Lima
      grid: carriles.map((carril) => ({
        left: MARGEN.izquierda, right: MARGEN.derecha, top: carril.y, height: carril.alto,
        show: true, backgroundColor: c.superficie2, borderWidth: 0,
      })),
      xAxis: carriles.map((carril, i) => ({
        type: 'time', gridIndex: i, min: aEje(rango.inicio), max: aEje(rango.fin),
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { show: i === ultimo, formatter: hora, color: c.textoSuave, fontSize: 11, hideOverlap: true, margin: 8 },
        splitLine: { show: true, lineStyle: { color: c.borde, width: 1 } },
        // Línea vertical que sigue al mouse en todos los carriles, con la hora abajo.
        axisPointer: {
          show: true, type: 'line', snap: false, triggerTooltip: false, z: 0,
          lineStyle: { color: c.bordeFuerte, width: 1 },
          label: {
            show: i === ultimo, formatter: ({ value }) => hora(value), backgroundColor: c.texto, color: c.superficie,
            padding: [3, 6], borderRadius: 4, fontSize: 11, fontFamily: c.fuenteNumeros,
          },
        },
      })),
      yAxis: carriles.map((carril, i) => ({
        type: 'category', gridIndex: i, data: [carril.nombre],
        axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { color: c.textoSuave, fontSize: 12, margin: 12, width: MARGEN.izquierda - 24, overflow: 'truncate' },
      })),
      axisPointer: { link: [{ xAxisIndex: 'all' }], triggerOn: 'mousemove' },
      tooltip: { show: false }, // el detalle es propio (ver mostrarDetalle)
      dataZoom: [
        {
          type: 'inside', xAxisIndex: indices, filterMode: 'weakFilter', minValueSpan: ZOOM_MINIMO_MS,
          startValue: aEje(ventana.inicio), endValue: aEje(ventana.fin),
          zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false,
        },
        {
          type: 'slider', xAxisIndex: indices, filterMode: 'weakFilter', minValueSpan: ZOOM_MINIMO_MS,
          startValue: aEje(ventana.inicio), endValue: aEje(ventana.fin),
          left: MARGEN.izquierda, right: MARGEN.derecha, top: zoomArriba, height: MARGEN.zoom,
          showDataShadow: false, brushSelect: false, labelFormatter: hora,
          borderColor: c.borde, backgroundColor: 'transparent', fillerColor: conAlfa(c.acento, 0.12),
          handleStyle: { color: c.superficie, borderColor: c.bordeFuerte }, moveHandleSize: 0,
          textStyle: { color: c.textoSuave, fontSize: 11 },
          emphasis: { handleStyle: { borderColor: c.acento } },
        },
      ],
      series: carriles.map((carril, i) => ({
        type: 'custom', name: carril.nombre, xAxisIndex: i, yAxisIndex: i,
        silent: true, // el detalle y el clic los maneja este componente (ver alIniciar)
        data: carril.dibujo.map((d) => [aEje(d.inicio), aEje(d.fin)]),
        encode: { x: [0, 1] },
        renderItem: DIBUJAR[carril.tipo](carril, c),
        markLine: ahoraDentro ? {
          silent: true, symbol: ['none', 'none'], animation: false,
          lineStyle: { color: c.texto, width: 1.5, type: 'solid', opacity: 0.9 },
          label: { show: i === 0, position: 'end', formatter: `ahora · ${horaLocal(config.ahora)}`, color: c.texto, fontSize: 11, fontWeight: 600, distance: 4 },
          data: [{ xAxis: aEje(config.ahora) }],
        } : undefined,
      })),
      // Carril sin datos: un texto discreto dentro del carril (si todo está vacío, lo dice el estado vacío).
      graphic: vacios ? [] : carriles.filter((carril) => carril.vacio).map((carril) => ({
        type: 'text', left: MARGEN.izquierda + 10, top: carril.y + carril.alto / 2 - 7, silent: true,
        style: { text: carril.textoVacio, fill: c.textoSuave, font: `11px ${c.fuente}` },
      })),
    };
  }

  // ── Detalle al pasar el mouse ──

  /** Elemento bajo el punto (x, y) del gráfico: {carril, d} o null. */
  function buscarEn(x, y) {
    const instancia = grafico.instancia();
    const ancho = marco.clientWidth;
    if (x < MARGEN.izquierda || x > ancho - MARGEN.derecha) return null;
    const media = MARGEN.separacion / 2;
    const carril = carriles.find((k) => y >= k.y - media && y <= k.y + k.alto + media);
    if (!carril || carril.vacio) return null;
    const t = deEje(instancia.convertFromPixel({ xAxisIndex: carril.indice }, x));
    const msPorPx = deEje(instancia.convertFromPixel({ xAxisIndex: carril.indice }, x + 1)) - t;
    if (!Number.isFinite(t)) return null;
    const d = BUSCAR[carril.tipo](carril, t, msPorPx, y - carril.y);
    return d ? { carril, d } : null;
  }

  function mover(x, y) {
    ultimoMouse = { x, y };
    if (presionado) return; // arrastrando: el detalle se esconde mientras tanto
    const encontrado = buscarEn(x, y);
    const zr = grafico.instancia().getZr();
    zr.setCursorStyle(encontrado && config.alElegir ? 'pointer' : 'default');
    if (!encontrado) { esconderDetalle(); return; }
    const elementoOriginal = encontrado.d.item ?? encontrado.d;
    if (actualBajoMouse !== elementoOriginal) {
      actualBajoMouse = elementoOriginal;
      reemplazar(detalle, contenidoDetalle(encontrado.carril, encontrado.d)); // reemplazar() salta los null
    }
    detalle.hidden = false;
    ubicarResalte(encontrado.carril, encontrado.d);
    ubicarDetalle(x, y);
  }

  function esconderDetalle() {
    actualBajoMouse = null;
    detalle.hidden = true;
    resalte.hidden = true;
  }

  /** Borde alrededor del elemento bajo el mouse (el detalle muestra el segmento real, aunque se dibuje agrupado). */
  function ubicarResalte(carril, d) {
    const instancia = grafico.instancia();
    const px = (t) => instancia.convertToPixel({ xAxisIndex: carril.indice }, aEje(t));
    const izquierda = MARGEN.izquierda;
    const derecha = marco.clientWidth - MARGEN.derecha;
    let x0 = px(d.inicio);
    let x1 = px(d.fin);
    let y0 = carril.y;
    let alto = carril.alto;
    if (carril.tipo === 'plan') {
      if (d.tipo === 'rutina') { y0 = carril.y + carril.alto - FILA_RUTINAS - 2; alto = FILA_RUTINAS; } else { y0 = carril.y + 3; alto = carril.alto - FILA_RUTINAS - 8; }
    }
    if (x1 - x0 < 8) { const medio = (x0 + x1) / 2; x0 = medio - 5; x1 = medio + 5; } // marcas y tramos muy cortos
    x0 = Math.max(x0, izquierda - 1);
    x1 = Math.min(x1, derecha + 1);
    Object.assign(resalte.style, { left: `${x0 - 1}px`, top: `${y0 - 1}px`, width: `${Math.max(x1 - x0, 2) + 2}px`, height: `${alto + 2}px` });
    resalte.hidden = false;
  }

  /** Pone el detalle junto al mouse, sin salirse por la derecha ni por abajo de la ventana. */
  function ubicarDetalle(x, y) {
    const separacion = 14;
    const anchoRaiz = raiz.clientWidth;
    const { offsetWidth: ancho, offsetHeight: alto } = detalle;
    let izquierda = x + separacion;
    if (izquierda + ancho > anchoRaiz) izquierda = Math.max(0, x - separacion - ancho);
    let arriba = y + separacion;
    const caja = raiz.getBoundingClientRect();
    if (caja.top + arriba + alto > window.innerHeight - 8) arriba = Math.max(-caja.top + 8, y - separacion - alto);
    detalle.style.transform = `translate(${Math.round(izquierda)}px, ${Math.round(arriba)}px)`;
  }

  // ── Contenido del detalle ──

  /** Busca un bloque o clase del plan por id (para nombrar el curso en intervenciones y cortes). */
  function itemDelPlan(id) {
    if (!id) return null;
    for (const carril of carriles) {
      if (carril.tipo !== 'plan') continue;
      const d = carril.items.find((x) => x.item.id === id);
      if (d) return { d, carril };
    }
    return null;
  }

  function nombreDeItemPlan(id) {
    const encontrado = itemDelPlan(id);
    if (!encontrado) return id;
    const { d } = encontrado;
    return `${{ bloque: 'Bloque', clase: 'Clase', rutina: 'Rutina' }[d.tipo]} ${d.tipo === 'rutina' ? d.item.nombre : encontrado.carril.nombreCurso(d.item.curso)} (${horaLocal(d.inicio)}–${horaLocal(d.fin)})`;
  }

  function contenidoDetalle(carril, d) {
    if (carril.tipo === 'real') return detalleReal(d);
    if (carril.tipo === 'plan') return detallePlan(carril, d);
    if (carril.tipo === 'intervenciones') return detalleIntervencion(d.item);
    return detalleCorte(carril, d.item);
  }

  function detalleReal(s) {
    const filas = [
      ['App', s.app],
      ['Título', s.titulo],
      ['Categoría', s.categoria?.length ? s.categoria.join(' › ') : null],
      ['Dominio', s.dominio],
      ['URL', s.url, 'url'],
    ];
    if (s.contexto) {
      const item = s.bloqueId ?? s.claseId ?? s.rutinaId;
      filas.push(['En', s.contexto === 'libre' ? NOMBRE_CONTEXTO.libre : (item ? nombreDeItemPlan(item) : NOMBRE_CONTEXTO[s.contexto])]);
    }
    const etiquetas = [s.audible && 'con audio', s.incognito && 'incógnito'].filter(Boolean);
    return armarDetalle({
      color: varDeEstado(s.clase), titulo: NOMBRE_ESTADO[s.clase] ?? s.clase, subtitulo: s.area ?? EXPLICACION_ESTADO[s.clase],
      hora: rangoDeHoras(s.inicio, s.fin, true), filas, etiquetas,
    });
  }

  function detallePlan(carril, d) {
    const x = d.item;
    if (d.tipo === 'bloque') {
      const nivel = (NOMBRE_NIVEL[x.nivel] ?? x.nivel) + (x.subidoPorExcepcion ? ' (subido por una excepción)' : '');
      const filas = [['Objetivo', x.objetivo], ['Nivel', nivel], ['Por qué', x.porQue]];
      if (x.terminadoAntes) filas.push(['Terminó antes', `a las ${horaLocal(x.terminadoAntes.fin)}${x.terminadoAntes.motivo ? ': ' + x.terminadoAntes.motivo : ''}`]);
      return armarDetalle({
        color: d.variable, forma: 'contorno', titulo: `Bloque · ${NOMBRE_TIPO_BLOQUE[x.tipo] ?? x.tipo}`, subtitulo: carril.nombreCurso(x.curso),
        hora: rangoDeHoras(x.inicio, x.finPlan ?? x.fin) + (x.terminadoAntes ? ' (planificado)' : ''), filas,
      });
    }
    if (d.tipo === 'clase') {
      return armarDetalle({
        color: d.variable, forma: 'punteado', titulo: `Clase · ${NOMBRE_TIPO_CLASE[x.tipo] ?? x.tipo ?? ''}`, subtitulo: carril.nombreCurso(x.curso),
        hora: rangoDeHoras(x.inicio, x.fin), filas: [['Lugar', x.lugar], ['Usa la PC', x.usaPc ? 'Sí (los avisos aplican)' : 'No']],
      });
    }
    const filas = [
      ['Meta', x.minutosMeta ? `${x.minutosMeta} min` : null],
      ['Categoría', x.categoria?.length ? x.categoria.join(' › ') : null],
      ['Tolerancia', Number.isFinite(x.toleranciaMin) ? `${x.toleranciaMin} min` : null],
    ];
    return armarDetalle({
      color: d.variable, forma: d.marca ? 'anillo' : 'linea', titulo: `Rutina · ${NOMBRE_MEDICION[x.medicion] ?? x.medicion}`, subtitulo: x.nombre,
      hora: d.marca ? `Objetivo: ${horaLocal(x.inicio)}` : rangoDeHoras(x.inicio, x.fin), filas,
    });
  }

  function detalleIntervencion(x) {
    return armarDetalle({
      color: varDeNivel(x.nivel), forma: FORMA_ACCION[x.accion], titulo: NOMBRE_ACCION[x.accion] ?? x.accion,
      subtitulo: `Nivel ${(NOMBRE_NIVEL[x.nivel] ?? x.nivel ?? '').toLowerCase()}`, hora: horaConSegundos(x.instante),
      filas: [
        ['Objetivo', x.objetivo],
        ['Motivo', NOMBRE_MOTIVO[x.motivo] ?? x.motivo],
        ['En', x.bloqueId || x.claseId ? nombreDeItemPlan(x.bloqueId ?? x.claseId) : null],
        ['App', x.app], ['Título', x.titulo], ['URL', x.url, 'url'],
      ],
    });
  }

  function detalleCorte(carril, x) {
    return armarDetalle({
      color: varDeNivel(carril.nivel ?? 'total'), forma: 'rayado', titulo: 'Se habría cortado', subtitulo: 'simulación',
      hora: rangoDeHoras(x.inicio, x.fin, true),
      filas: [['Objetivo', x.objetivo], ['En', x.itemId ? nombreDeItemPlan(x.itemId) : null]],
    });
  }

  /** Arma el detalle: marca de color (con forma) + título en texto + hora + filas "clave: valor". */
  function armarDetalle({ color, forma = 'cuadro', titulo, subtitulo, hora, filas = [], etiquetas = [] }) {
    const lista = filas.filter(([, valor]) => valor !== null && valor !== undefined && valor !== '');
    return [
      el('div', { class: 'linea-tiempo-detalle-cabecera' },
        el('span', { class: 'linea-tiempo-clave-marca', 'data-forma': forma, style: { '--color-clave': color }, 'aria-hidden': 'true' }),
        el('span', { class: 'linea-tiempo-detalle-titulo' }, titulo),
        subtitulo ? el('span', { class: 'linea-tiempo-detalle-subtitulo' }, subtitulo) : null),
      hora ? el('div', { class: 'linea-tiempo-detalle-hora' }, hora) : null,
      lista.length ? el('dl', { class: 'linea-tiempo-detalle-filas' },
        lista.map(([clave, valor, tipo]) => [el('dt', {}, clave), el('dd', { class: tipo === 'url' ? 'linea-tiempo-detalle-url' : null }, String(valor))])) : null,
      etiquetas.length ? el('div', { class: 'linea-tiempo-detalle-etiquetas' }, etiquetas.map((e) => el('span', {}, e))) : null,
    ];
  }

  // ── Leyenda (debajo del gráfico) ──

  function pintarLeyenda() {
    const claves = [];
    const clave = (texto, color, forma = 'cuadro') => el('span', { class: 'linea-tiempo-clave' },
      el('span', { class: 'linea-tiempo-clave-marca', 'data-forma': forma, style: { '--color-clave': color }, 'aria-hidden': 'true' }), texto);
    for (const carril of carriles) {
      if (carril.vacio) continue;
      if (carril.tipo === 'real') {
        const presentes = new Set(carril.items.map((s) => s.clase));
        for (const estado of ESTADOS) if (presentes.has(estado)) claves.push(clave(NOMBRE_ESTADO[estado], varDeEstado(estado)));
      } else if (carril.tipo === 'plan') {
        if (carril.porCurso) {
          const vistos = new Map();
          for (const d of carril.items) if (d.tipo !== 'rutina' && !vistos.has(d.item.curso)) vistos.set(d.item.curso, d.variable);
          for (const [curso, variable] of vistos) claves.push(clave(carril.nombreCurso(curso), variable, 'contorno'));
        } else {
          const tipos = new Set(carril.items.map((d) => d.tipo));
          if (tipos.has('bloque')) claves.push(clave('Bloque', 'var(--color-plan-bloque)', 'contorno'));
          if (tipos.has('clase')) claves.push(clave('Clase', 'var(--color-plan-clase)', 'punteado'));
        }
        if (carril.items.some((d) => d.tipo === 'rutina')) claves.push(clave('Rutina', 'var(--color-plan-rutina)', 'linea'));
      } else if (carril.tipo === 'intervenciones') {
        const acciones = new Set(carril.items.map((d) => d.item.accion));
        for (const accion of Object.keys(NOMBRE_ACCION)) {
          if (acciones.has(accion)) claves.push(clave(NOMBRE_ACCION[accion], varDeNivel(NIVEL_DE_ACCION[accion]), FORMA_ACCION[accion]));
        }
      } else if (carril.tipo === 'cortes') {
        claves.push(clave('Se habría cortado', varDeNivel(carril.nivel ?? 'total'), 'rayado'));
      }
    }
    reemplazar(leyenda, claves);
    leyenda.hidden = claves.length === 0;
  }

  // ── Gráfico ──

  preparar();
  const grafico = crearGrafico(marco, armar, {
    vacio: estaVacio,
    textoVacio: config.textoVacio ?? 'Sin datos en este período',
    // Se llama cada vez que ECharts crea la instancia (también al cambiar el tema).
    alIniciar(instancia) {
      const zr = instancia.getZr();
      zr.on('mousemove', (e) => mover(e.offsetX, e.offsetY));
      zr.on('globalout', () => { ultimoMouse = null; esconderDetalle(); });
      zr.on('mousedown', (e) => { presionado = { x: e.offsetX, y: e.offsetY }; esconderDetalle(); });
      zr.on('mouseup', () => { setTimeout(() => { presionado = null; }, 0); }); // después del "click"
      zr.on('click', (e) => {
        const fueArrastre = presionado && Math.hypot(e.offsetX - presionado.x, e.offsetY - presionado.y) > 4;
        if (fueArrastre || !config.alElegir) return;
        const encontrado = buscarEn(e.offsetX, e.offsetY);
        if (encontrado) config.alElegir(encontrado.d.item ?? encontrado.d, { carril: encontrado.carril.tipo, nombre: encontrado.carril.nombre });
      });
      zr.on('dblclick', () => instancia.dispatchAction({ type: 'dataZoom', start: 0, end: 100 }));
      instancia.on('datazoom', (evento) => {
        // El evento trae el zoom en % del rango (rueda, arrastre, barra) o en valores (si se pidió así).
        const z = evento.batch?.[0] ?? evento;
        const largo = rango.fin - rango.inicio;
        const inicio = z.startValue !== undefined ? deEje(z.startValue) : rango.inicio + (largo * (z.start ?? 0)) / 100;
        const fin = z.endValue !== undefined ? deEje(z.endValue) : rango.inicio + (largo * (z.end ?? 100)) / 100;
        ventana = { inicio, fin };
        // El detalle sigue al elemento que quedó bajo el mouse (tras dibujar el zoom).
        actualBajoMouse = null;
        if (ultimoMouse && !presionado) requestAnimationFrame(() => ultimoMouse && mover(ultimoMouse.x, ultimoMouse.y));
        else esconderDetalle();
      });
    },
  });

  return {
    /**
     * Cambia datos u opciones (las que no se pasan quedan igual). Si inicio y fin no cambian, se conserva el zoom.
     * @param {Partial<typeof opciones>} nuevas
     */
    actualizar(nuevas = {}) {
      const cambiaRango = ('inicio' in nuevas && nuevas.inicio !== config.inicio) || ('fin' in nuevas && nuevas.fin !== config.fin);
      config = { ...config, ...nuevas };
      if (cambiaRango) ventana = null;
      preparar();
      esconderDetalle();
      grafico.instancia().resize(); // por si cambió el alto (otra cantidad de carriles)
      grafico.actualizar(armar, { vacio: estaVacio, textoVacio: config.textoVacio ?? 'Sin datos en este período' });
    },
    /** Muestra u oculta "Cargando…" sobre el gráfico (aparece a los 150 ms, para no parpadear). */
    cargando: (si) => grafico.cargando(si),
    /** Libera el gráfico y quita el componente de la página (llamar al salir de la vista). */
    destruir() {
      grafico.destruir();
      raiz.remove();
    },
    /** La instancia de ECharts (para casos especiales; normalmente no hace falta). */
    instancia: () => grafico.instancia(),
  };
}
