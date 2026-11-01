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
