// Simulador (F4-06): ¿qué habría pasado este día con este nivel?
//
// Recorre los segmentos de un día con la MISMA máquina de estados que usará el agente
// (decidir → registrarDecision → concederPase), como si una persona simulada reaccionara a cada aviso o
// fricción según una política. Devuelve las intervenciones simuladas y el tiempo que se habría cortado.
//
// El agente decide al empezar cada actividad y, si se queda mucho rato en lo mismo, otra vez cuando vence
// un permiso o un pase. Aquí se imita eso: cada segmento se decide al empezar y, si es largo, se parte en
// el instante en que vence su permiso o pase y se decide de nuevo.
//
// Determinista: no usa el reloj ni números al azar. El mismo día con el mismo nivel da siempre lo mismo.

import { NIVELES } from './tipos.js';
import { NIVELES_INICIALES } from './niveles.js';
import { decidir, crearEstadoIntervencion, registrarDecision, concederPase, paseVigente } from './decisor.js';

const MS_MIN = 60 * 1000;

/** Estados sin actividad: no hay nada que decidir (la PC está sin uso o apagada). */
const SIN_ACTIVIDAD = new Set(['afk', 'sin-pc']);

/** Motivo que se anota en los pases que usa la persona simulada. */
const MOTIVO_SIMULADO = 'Pase simulado';

/** Contadores vacíos de un bloque o una clase. */
function contadoresVacios() {
  return { avisos: 0, fricciones: 0, bloqueos: 0, pases: 0, escalo: false, cortadoSeg: 0 };
}

/** Qué contador sube cada acción de una intervención. */
const CONTADOR = { aviso: 'avisos', friccion: 'fricciones', bloqueo: 'bloqueos', pase: 'pases' };

/**
 * Corre el Decisor sobre los segmentos de un día (§11).
 * - nivel 'plan' usa el nivel de cada bloque (con la configuración y las excepciones); otro valor de NIVELES
 *   fuerza ese nivel en todos los bloques. Las clases con usaPc siguen en aviso.
 * - El bloque o la clase de cada segmento sale de su bloqueId o claseId, buscado en `items`.
 * - Los segmentos AFK y Sin PC no se deciden (no hay actividad).
 * - Política: con continuarAviso, tras un aviso se usa el permiso de aviso.permiso_min; con usarPases, en
 *   fricción se usa un pase de friccion.pase_min mientras queden comodines.
 * - Cortes (tiempo que se habría impedido), mientras siga en ese mismo objetivo: en 'bloqueo', siempre; en
 *   'friccion', si no hubo pase (sin comodines o usarPases = false); en 'aviso', solo si continuarAviso = false.
 * @param {{segmentos: import('./tipos.js').SegmentoConContexto[], items: import('./tipos.js').ItemsDelDia,
 *          config: import('./tipos.js').ConfigNiveles, nivel?: ('plan'|'ninguno'|'aviso'|'friccion'|'total'),
 *          comodines?: number, politica?: Partial<import('./tipos.js').PoliticaSimulada>}} entrada
 *        comodines: los que quedan al empezar (por defecto, config.friccion.comodines_semana)
 * @returns {import('./tipos.js').ResultadoSimulacion}
 * @throws {Error} si `nivel` no es 'plan' ni un nivel conocido
 */
export function simular({ segmentos = [], items = null, config = null, nivel = 'plan', comodines, politica } = {}) {
  if (nivel !== 'plan' && !NIVELES.includes(nivel)) {
    throw new Error(`Nivel de simulación desconocido: ${nivel} (se espera 'plan' o ${NIVELES.join(', ')})`);
  }
  const base = config ?? NIVELES_INICIALES.base;
  const reaccion = { continuarAviso: true, usarPases: true, ...politica };
  const forzado = nivel !== 'plan';

  // Con un nivel forzado, cada bloque se copia con ese nivel y la configuración pierde los niveles elegidos
  // por bloque: así nivelDeBloque devuelve el nivel forzado. Las copias no tocan los datos de entrada.
  const cfg = forzado ? { ...base, bloques: {} } : base;
  const bloques = new Map();
  for (const bloque of items?.bloques ?? []) {
    bloques.set(bloque.id, forzado ? { ...bloque, nivel, subidoPorExcepcion: false } : bloque);
  }
  const clases = new Map((items?.clases ?? []).map((clase) => [clase.id, clase]));

  // Contadores por bloque y por clase con PC (todos, aunque queden en 0, para que la vista los muestre).
  const porItem = {};
  const cortadoMs = {}; // se suma en ms y se pasa a segundos al final (evita errores de redondeo)
  for (const id of bloques.keys()) porItem[id] = contadoresVacios();
  for (const clase of clases.values()) if (clase.usaPc) porItem[clase.id] = contadoresVacios();

  const comodinesIniciales = comodines ?? base.friccion?.comodines_semana ?? NIVELES_INICIALES.base.friccion.comodines_semana;
  let estado = crearEstadoIntervencion({ comodines: comodinesIniciales });
  const intervenciones = [];
  const cortes = [];

  /** Guarda intervenciones y suma sus contadores. */
  function anotar(lista) {
    for (const intervencion of lista) {
      intervenciones.push(intervencion);
      const id = intervencion.bloqueId ?? intervencion.claseId;
      if (id === null) continue;
      porItem[id] ??= contadoresVacios();
      if (intervencion.accion === 'escalamiento') porItem[id].escalo = true;
      else if (CONTADOR[intervencion.accion]) porItem[id][CONTADOR[intervencion.accion]] += 1;
    }
  }

  /** Anota un corte; si sigue justo al anterior con el mismo ítem y objetivo, lo alarga. */
  function cortar(inicio, fin, itemId, objetivo) {
    const anterior = cortes.at(-1);
    if (anterior && anterior.fin === inicio && anterior.itemId === itemId && anterior.objetivo === objetivo) anterior.fin = fin;
    else cortes.push({ inicio, fin, itemId, objetivo });
    if (itemId !== null) cortadoMs[itemId] = (cortadoMs[itemId] ?? 0) + (fin - inicio);
  }

  /** Intenta un permiso o un pase; devuelve hasta cuándo vale, o null si no se concedió. */
  function pedir(tipo, minutos, objetivo, ahora, bloque, clase, actividad) {
    const r = concederPase(estado, {
      objetivo, tipo, minutos, ahora, bloque, clase, actividad, motivo: tipo === 'pase' ? MOTIVO_SIMULADO : '',
    });
    if (!r.concedido) return null;
    estado = r.estado;
    anotar(r.intervenciones);
    return ahora + minutos * MS_MIN;
  }

  const ordenados = [...segmentos].sort((a, b) => a.inicio - b.inicio);
  for (const segmento of ordenados) {
    if (SIN_ACTIVIDAD.has(segmento.clase) || !(segmento.fin > segmento.inicio)) continue;
    const bloque = segmento.bloqueId ? bloques.get(segmento.bloqueId) ?? null : null;
    const clase = segmento.claseId ? clases.get(segmento.claseId) ?? null : null;
    const itemId = bloque?.id ?? (clase?.usaPc ? clase.id : null);
    // Lo mismo que el agente le pasará al Decisor. esNavegador y conExtension no vienen en los segmentos:
    // el Decisor los deduce (un navegador sin URL cuenta como sin la extensión).
    const actividad = {
      app: segmento.app ?? null, titulo: segmento.titulo ?? null, url: segmento.url ?? null, categoria: segmento.categoria ?? null,
    };

    let ahora = segmento.inicio;
    while (ahora < segmento.fin) {
      const decision = decidir({ actividad, bloque, clase, config: cfg, estado, ahora });
      const registro = registrarDecision(estado, decision, { bloque, clase, actividad, ahora, config: cfg });
      estado = registro.estado;
      anotar(registro.intervenciones);

      let siguiente = segmento.fin; // por defecto, lo decidido vale hasta el fin del segmento
      let hasta = null;
      switch (decision.accion) {
        case 'permitir': {
          // Con un pase o permiso, se vuelve a decidir cuando vence.
          const pase = decision.motivo === 'pase_vigente' ? paseVigente(estado, decision.objetivo, ahora) : null;
          if (pase) siguiente = Math.min(segmento.fin, pase.hasta);
          break;
        }
        case 'aviso':
          if (reaccion.continuarAviso) hasta = pedir('permiso', cfg.aviso?.permiso_min, decision.objetivo, ahora, bloque, clase, actividad);
          if (hasta === null) cortar(ahora, segmento.fin, itemId, decision.objetivo);
          else siguiente = Math.min(segmento.fin, hasta);
          break;
        case 'friccion':
          if (reaccion.usarPases) hasta = pedir('pase', cfg.friccion?.pase_min, decision.objetivo, ahora, bloque, clase, actividad);
          if (hasta === null) cortar(ahora, segmento.fin, itemId, decision.objetivo);
          else siguiente = Math.min(segmento.fin, hasta);
          break;
        case 'bloqueo':
          cortar(ahora, segmento.fin, itemId, decision.objetivo);
          break;
        default:
          break;
      }
      // Seguridad: el tiempo siempre avanza (un pase siempre vence después de `ahora`).
      ahora = siguiente > ahora ? siguiente : segmento.fin;
    }
  }

  let cortadoTotalMs = 0;
  for (const [id, valor] of Object.entries(cortadoMs)) {
    porItem[id] ??= contadoresVacios();
    porItem[id].cortadoSeg = valor / 1000;
    cortadoTotalMs += valor;
  }

  const contar = (accion) => intervenciones.filter((i) => i.accion === accion).length;
  const cortadoSeg = cortadoTotalMs / 1000;
  return {
    nivel,
    intervenciones,
    cortes,
    cortadoSeg,
    porItem,
    totales: {
      avisos: contar('aviso'),
      fricciones: contar('friccion'),
      bloqueos: contar('bloqueo'),
      pases: contar('pase'),
      comodinesUsados: comodinesIniciales - estado.comodines,
      cortadoSeg,
    },
  };
}

/**
 * El mismo día simulado con los tres niveles forzados, para compararlos.
 * @param {Parameters<typeof simular>[0]} entrada  lo mismo que simular (su `nivel` se ignora)
 * @returns {{aviso: import('./tipos.js').ResultadoSimulacion, friccion: import('./tipos.js').ResultadoSimulacion,
 *            total: import('./tipos.js').ResultadoSimulacion}}
 */
export function compararNiveles(entrada) {
  return {
    aviso: simular({ ...entrada, nivel: 'aviso' }),
    friccion: simular({ ...entrada, nivel: 'friccion' }),
    total: simular({ ...entrada, nivel: 'total' }),
  };
}
