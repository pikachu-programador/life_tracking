// Cálculos de las vistas (funciones PURAS, con pruebas en pruebas/calculos-vistas.test.js).
// Aquí va lo que una vista calcula a partir de los resúmenes y segmentos del motor y que conviene probar sin navegador.

/** Estados de cumplimiento que entran al % (§9). */
export const MEDIDOS = ['cumplido', 'parcial', 'fallido'];

/**
 * Estado de un día para el calendario, según su % (§9): cumplido si llega al umbral de "día cumplido";
 * parcial si llega a la mitad de ese umbral; si no, fallido. Sin nada medible → null.
 */
export function estadoDelDia(porcentaje, umbralDia) {
  if (porcentaje === null || porcentaje === undefined) return null;
  if (porcentaje >= umbralDia) return 'cumplido';
  return porcentaje >= umbralDia / 2 ? 'parcial' : 'fallido';
}

/** Estado de un foco promedio con los umbrales del plan. */
export function estadoDeFoco(foco, umbrales) {
  if (foco >= umbrales.foco_cumplido) return 'cumplido';
  return foco >= umbrales.foco_parcial ? 'parcial' : 'fallido';
}

/**
 * Junta los bloques medidos del período por bloque del plan: cuántas veces ocurrió, cómo salió y su foco promedio.
 * @param {import('../../motor/tipos.js').ResumenDia[]} resumenes
 * @returns {Array<{bloqueId: string, curso: string, tipo: string, veces: number, cumplido: number, parcial: number,
 *                  fallido: number, foco: number|null, retrasoMin: number|null}>}  foco null en los de papel
 */
export function focoPorBloque(resumenes) {
  const grupos = new Map();
  for (const resumen of resumenes) {
    for (const b of resumen.bloques ?? []) {
      if (!MEDIDOS.includes(b.estado)) continue;
      if (!grupos.has(b.bloqueId)) {
        grupos.set(b.bloqueId, { bloqueId: b.bloqueId, curso: b.curso, tipo: b.tipo, veces: 0, cumplido: 0, parcial: 0, fallido: 0, focos: [], retrasos: [] });
      }
      const g = grupos.get(b.bloqueId);
      g.veces += 1;
      g[b.estado] += 1;
      if (typeof b.foco === 'number') g.focos.push(b.foco);
      if (typeof b.retrasoMin === 'number') g.retrasos.push(b.retrasoMin);
    }
  }
  const promedio = (lista) => (lista.length ? lista.reduce((a, x) => a + x, 0) / lista.length : null);
  return [...grupos.values()].map(({ focos, retrasos, ...g }) => ({ ...g, foco: promedio(focos), retrasoMin: promedio(retrasos) }));
}
