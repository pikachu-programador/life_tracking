// Formatos para mostrar datos (funciones puras).

/** Clases de primer nivel (arquitectura §7): nombre en AW → clave usada en CSS (data-clase) y nombre visible. */
const CLASES = {
  'Estudio': { clave: 'estudio', nombre: 'Estudio' },
  'Distracción': { clave: 'distraccion', nombre: 'Distracción' },
  'Neutral': { clave: 'neutral', nombre: 'Neutral' },
  'IA': { clave: 'ia', nombre: 'IA' },
  'Uncategorized': { clave: 'sin-clasificar', nombre: 'Sin clasificar' },
};

/**
 * Clase de una categoría de AW. ["Estudio", "Inglés"] → { clave: "estudio", nombre: "Estudio" }.
 * Una categoría desconocida (por ejemplo, si alguien crea otra clase en AW) cuenta como Sin clasificar.
 */
export function claseDe(categoria) {
  return CLASES[categoria?.[0]] ?? CLASES.Uncategorized;
}

/** Orden fijo de las clases al mostrarlas. */
export const ORDEN_CLASES = ['estudio', 'ia', 'neutral', 'distraccion', 'sin-clasificar'];

/** Segundos → "2 h 05 min", "45 min", "0 min". */
export function duracionLegible(segundos) {
  const minutos = Math.round(segundos / 60);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

/**
 * Suma la duración de los eventos por clase.
 * @returns {{ total: number, porClase: Object<string, number> }} en segundos; claves de ORDEN_CLASES.
 */
export function sumarPorClase(eventos) {
  const porClase = {};
  let total = 0;
  for (const e of eventos) {
    const { clave } = claseDe(e.data.$category);
    porClase[clave] = (porClase[clave] ?? 0) + e.duration;
    total += e.duration;
  }
  return { total, porClase };
}

// ── Formatos agregados en F1-09 (los usan todas las vistas) ──

/** 0.724 → "72 %"; null → "—". */
export function porcentajeLegible(proporcion, decimales = 0) {
  if (proporcion === null || proporcion === undefined || Number.isNaN(proporcion)) return '—';
  return `${(proporcion * 100).toFixed(decimales).replace('.', ',')} %`;
}

/** Segundos → "+2 h 10 min", "−15 min" o "±0 min" (para comparar con el período anterior). */
export function diferenciaLegible(segundos) {
  if (segundos === null || segundos === undefined) return '—';
  const minutos = Math.round(segundos / 60);
  if (minutos === 0) return '±0 min';
  return (minutos > 0 ? '+' : '−') + duracionLegible(Math.abs(minutos) * 60);
}

/** Segundos → "2:05 h" o "45 min" (etiquetas cortas de gráficos). */
export function duracionCompacta(segundos) {
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')} h`;
}

/** Segundos → horas con un decimal: 5400 → "1,5 h". */
export function horasLegibles(segundos, decimales = 1) {
  return `${(segundos / 3600).toFixed(decimales).replace('.', ',')} h`;
}

/** Número con decimales con coma y miles separados por un espacio fino: 12840 → "12 840", 2.5 → "2,5". */
export function numeroLegible(numero, decimales = 0) {
  const [entero, fraccion] = Math.abs(numero).toFixed(decimales).split('.');
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  return (numero < 0 ? '−' : '') + conMiles + (fraccion ? ',' + fraccion : '');
}
