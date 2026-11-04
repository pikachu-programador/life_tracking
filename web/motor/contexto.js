// Contexto de cada segmento (F4-01): ¿pasó dentro de un bloque de estudio, de una clase, de una rutina o en tiempo libre?
//
// La distracción solo es fallo DENTRO de un bloque (§9); en tiempo libre solo se mide. Para saberlo, cada
// segmento se marca con su lugar en el plan del día (ItemsDelDia, de horario.js).
//
// Reglas (arquitectura §6.7 y §7):
// - Intervalos [inicio, fin): un segmento que termina justo cuando empieza un bloque no es del bloque.
// - Un segmento que cruza un borde se parte en dos (o más) pedazos, cada uno con su contexto.
// - Si varios ítems se superponen, gana bloque > clase > rutina > libre.
// - Si se superponen dos ítems del mismo tipo (por ejemplo, dos bloques), gana el que empezó antes; en empate,
//   el que va primero en la lista. Cuando el ganador termina, el otro sigue dando contexto hasta su fin.
// - Solo dan contexto las rutinas con franja horaria (inicio y fin) que no son de día lógico: una rutina sin
//   franja cuenta en todo el día y "despertar"/"dormir" son horas sueltas, no tramos.
// - Un bloque terminado antes da contexto solo hasta su fin real (BloqueDia.fin ya es el real).
// - Solo se llena el id del ítem ganador (bloqueId, claseId o rutinaId); los otros quedan en null.
//   cursoId es el curso del bloque o de la clase (null en rutina y libre).
//
// La salida cubre exactamente lo mismo que la entrada: misma suma de duraciones, sin solapes y en el mismo
// orden (cada segmento se reemplaza por sus pedazos). No modifica las entradas.

/** Prioridad de cada tipo de ítem: menor número = gana. */
const PRIORIDAD = { bloque: 0, clase: 1, rutina: 2 };

/** Contexto de lo que no cae en ningún ítem. Se congela para que nadie lo modifique por accidente. */
const LIBRE = Object.freeze({ contexto: 'libre', bloqueId: null, cursoId: null, claseId: null, rutinaId: null });

/** ¿Es un intervalo válido (números finitos y fin > inicio)? */
function esIntervalo(inicio, fin) {
  return Number.isFinite(inicio) && Number.isFinite(fin) && fin > inicio;
}

/**
 * Ítems del día que pueden dar contexto, como candidatos {inicio, fin, prioridad, orden, datos}.
 * `datos` es lo que se copia en cada segmento (contexto y los cuatro ids).
 */
function candidatosDe(items) {
  const candidatos = [];
  const agregar = (inicio, fin, tipo, datos) => {
    if (esIntervalo(inicio, fin)) candidatos.push({ inicio, fin, prioridad: PRIORIDAD[tipo], orden: candidatos.length, datos });
  };
  for (const b of items?.bloques ?? []) {
    agregar(b.inicio, b.fin, 'bloque', { contexto: 'bloque', bloqueId: b.id, cursoId: b.curso ?? null, claseId: null, rutinaId: null });
  }
  for (const c of items?.clases ?? []) {
    agregar(c.inicio, c.fin, 'clase', { contexto: 'clase', bloqueId: null, cursoId: c.curso ?? null, claseId: c.id, rutinaId: null });
  }
  for (const r of items?.rutinas ?? []) {
    if (r.medicion === 'dia_logico' || r.inicio == null || r.fin == null) continue; // no dan contexto
    agregar(r.inicio, r.fin, 'rutina', { contexto: 'rutina', bloqueId: null, cursoId: null, claseId: null, rutinaId: r.id });
  }
  return candidatos;
}

/** ¿Gana `a` sobre `b`? Primero el tipo (bloque > clase > rutina); luego el que empezó antes; luego el primero de la lista. */
function gana(a, b) {
  if (a.prioridad !== b.prioridad) return a.prioridad < b.prioridad;
  if (a.inicio !== b.inicio) return a.inicio < b.inicio;
  return a.orden < b.orden;
}

/**
 * Parte la línea del tiempo en tramos con un solo ganador: [{inicio, fin, datos}], ordenados y sin solapes.
 * Los huecos entre tramos son tiempo libre.
 * Idea: entre dos bordes consecutivos (inicios o fines de ítems) el ganador no cambia, así que basta con
 * mirar cada uno de esos pedacitos. Hay pocos ítems por día (~10), así que esto es instantáneo.
 */
function tramosDeContexto(items) {
  const candidatos = candidatosDe(items);
  // Todos los bordes, sin repetir y ordenados de menor a mayor.
  const bordes = [...new Set(candidatos.flatMap((c) => [c.inicio, c.fin]))].sort((a, b) => a - b);
  const tramos = [];
  for (let i = 0; i + 1 < bordes.length; i++) {
    const desde = bordes[i];
    const hasta = bordes[i + 1];
    let mejor = null;
    for (const c of candidatos) {
      const cubre = c.inicio <= desde && c.fin >= hasta;
      if (cubre && (mejor === null || gana(c, mejor))) mejor = c;
    }
    if (mejor === null) continue; // pedacito libre
    const ultimo = tramos[tramos.length - 1];
    // Si el pedacito anterior tenía el mismo ganador y se tocan, se alarga en vez de crear otro tramo.
    if (ultimo && ultimo.candidato === mejor && ultimo.fin === desde) ultimo.fin = hasta;
    else tramos.push({ inicio: desde, fin: hasta, candidato: mejor, datos: mejor.datos });
  }
  return tramos;
}

/** Índice del primer tramo que termina después de `instante` (búsqueda binaria; tramos.length si no hay). */
function primerTramoDespuesDe(tramos, instante) {
  let bajo = 0;
  let alto = tramos.length;
  while (bajo < alto) {
    const medio = (bajo + alto) >> 1; // >> 1 divide entre 2 y descarta los decimales
    if (tramos[medio].fin > instante) alto = medio;
    else bajo = medio + 1;
  }
  return bajo;
}

/**
 * Marca cada segmento con su contexto en el plan del día y lo parte en los bordes de bloques, clases y rutinas.
 * @param {import('./tipos.js').Segmento[]} segmentos  ordenados y sin solapes (los de segmentar)
 * @param {import('./tipos.js').ItemsDelDia} items     lo planificado para el día (expandirDia)
 * @returns {import('./tipos.js').SegmentoConContexto[]}  copias nuevas; cubren exactamente lo mismo que la entrada
 */
export function asignarContexto(segmentos, items) {
  const tramos = tramosDeContexto(items);
  const salida = [];
  // Copia de un segmento recortada a [inicio, fin), con el contexto `datos`.
  const pedazo = (seg, inicio, fin, datos) => salida.push({ ...seg, inicio, fin, ...datos });

  for (const seg of segmentos ?? []) {
    let t = primerTramoDespuesDe(tramos, seg.inicio);
    if (!(seg.fin > seg.inicio)) {
      // Segmento vacío o inválido (no debería llegar): se copia tal cual, con el contexto de su instante.
      const tramo = tramos[t];
      pedazo(seg, seg.inicio, seg.fin, tramo && tramo.inicio <= seg.inicio ? tramo.datos : LIBRE);
      continue;
    }
    let cursor = seg.inicio; // hasta dónde ya se repartió el segmento
    while (cursor < seg.fin) {
      const tramo = tramos[t];
      if (!tramo || tramo.inicio >= seg.fin) { // no hay más tramos dentro del segmento: el resto es libre
        pedazo(seg, cursor, seg.fin, LIBRE);
        break;
      }
      if (tramo.inicio > cursor) { // tiempo libre antes del tramo
        pedazo(seg, cursor, tramo.inicio, LIBRE);
        cursor = tramo.inicio;
      }
      const fin = Math.min(seg.fin, tramo.fin);
      pedazo(seg, cursor, fin, tramo.datos);
      cursor = fin;
      if (fin === tramo.fin) t++; // ese tramo se acabó; el siguiente pedazo mira el próximo
    }
  }
  return salida;
}
