// Cliente de la API de ActivityWatch (arquitectura §14). Es el ÚNICO módulo que habla con AW.
//
// En el dashboard se usa `aw` (exportado al final): la página se sirve desde AW, así que basta
// la ruta relativa "/api/0" (mismo origen, sin CORS).
// En Node (pruebas, agente) se crea otro cliente con la dirección completa:
//   crearClienteAW({ base: 'http://localhost:5600/api/0' })

/** Error de AW. `tipo` = 'sin-conexion' (AW no responde) o 'http' (AW respondió con error). */
export class ErrorAW extends Error {
  constructor(mensaje, { tipo, estado = null, causa } = {}) {
    super(mensaje, { cause: causa });
    this.name = 'ErrorAW';
    this.tipo = tipo;
    this.estado = estado; // código HTTP, si lo hubo
  }
}

/**
 * Crea un cliente de AW.
 * @param {object} [opciones]
 * @param {string} [opciones.base='/api/0']  dirección base de la API.
 * @param {number} [opciones.tiempoLimiteMs=10000]  si AW tarda más, se cuenta como "sin conexión".
 */
export function crearClienteAW({ base = '/api/0', tiempoLimiteMs = 10000 } = {}) {
  /**
   * Hace una petición y devuelve el JSON de la respuesta (o null si no trae cuerpo).
   * Todas las funciones de abajo pasan por aquí, así los errores se tratan en un solo lugar.
   */
  async function pedir(metodo, ruta, { cuerpo, parametros } = {}) {
    let url = base + ruta;
    if (parametros) {
      // Quita los parámetros vacíos y arma "?start=...&end=...".
      const definidos = Object.entries(parametros).filter(([, v]) => v !== undefined && v !== null);
      if (definidos.length) url += '?' + new URLSearchParams(definidos.map(([k, v]) => [k, String(v)]));
    }

    let respuesta;
    try {
      respuesta = await fetch(url, {
        method: metodo,
        headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(tiempoLimiteMs), // corta la espera si AW no contesta
      });
    } catch (error) {
      throw new ErrorAW(`ActivityWatch no responde (${metodo} ${ruta})`, { tipo: 'sin-conexion', causa: error });
    }

    if (!respuesta.ok && respuesta.status !== 304) { // 304: "ya existía" al crear un bucket
      const detalle = await respuesta.text().catch(() => '');
      throw new ErrorAW(`AW respondió ${respuesta.status} a ${metodo} ${ruta}: ${detalle.slice(0, 200)}`,
        { tipo: 'http', estado: respuesta.status });
    }

    const texto = await respuesta.text();
    return texto ? JSON.parse(texto) : null;
  }

  const id = encodeURIComponent; // los ids de bucket pueden traer caracteres especiales

  return {
    /** Versión, hostname y más: { hostname, version, ... } */
    info: () => pedir('GET', '/info'),

    /** Todos los buckets: { "<id>": { id, type, client, hostname, ... }, ... } */
    buckets: () => pedir('GET', '/buckets/'),

    /**
     * Eventos de un bucket, del más nuevo al más viejo.
     * `inicio` y `fin` son Date o texto ISO 8601; `limite` es la cantidad máxima.
     */
    eventos: (bucketId, { inicio, fin, limite } = {}) =>
      pedir('GET', `/buckets/${id(bucketId)}/events`, {
        parametros: { start: aIso(inicio), end: aIso(fin), limit: limite },
      }),

    /**
     * Consulta en el lenguaje de AW.
     * @param {Array<[Date|string, Date|string]>} periodos  pares [inicio, fin].
     * @param {string[]} sentencias  líneas de la consulta, cada una terminada en ";".
     * @returns {Promise<any[]>} un resultado por periodo.
     */
    consulta: (periodos, sentencias) =>
      pedir('POST', '/query/', {
        cuerpo: {
          timeperiods: periodos.map(([inicio, fin]) => `${aIso(inicio)}/${aIso(fin)}`),
          query: sentencias,
        },
      }),

    /** Todos los ajustes de AW (incluye `classes`, `startOfDay` y los nuestros). */
    ajustes: () => pedir('GET', '/settings'),

    /** Un ajuste, por ejemplo 'classes' o 'rastreador-plan'. */
    ajuste: (clave) => pedir('GET', `/settings/${id(clave)}`),

    /** Guarda un ajuste (cualquier valor que se pueda pasar a JSON). */
    guardarAjuste: (clave, valor) => pedir('POST', `/settings/${id(clave)}`, { cuerpo: valor }),

    /**
     * Crea un bucket propio. Si ya existe, no pasa nada.
     * Por convención (§12) el id es "<nombre>_<hostname>" y el client es "rastreador".
     */
    crearBucket: (bucketId, { tipo, hostname, client = 'rastreador' }) =>
      pedir('POST', `/buckets/${id(bucketId)}`, { cuerpo: { client, type: tipo, hostname } }),

    /** Borra un bucket entero con sus eventos (se usa en las pruebas). */
    borrarBucket: (bucketId) => pedir('DELETE', `/buckets/${id(bucketId)}`, { parametros: { force: 1 } }),

    /** Inserta uno o varios eventos: { timestamp, duration (s), data }. */
    insertarEventos: (bucketId, eventos) =>
      pedir('POST', `/buckets/${id(bucketId)}/events`, {
        cuerpo: (Array.isArray(eventos) ? eventos : [eventos]).map(normalizarEvento),
      }),

    /**
     * Latido: si el último evento tiene los mismos `data` y llegó hace menos de `pulsetime`
     * segundos, AW lo alarga en vez de crear otro. `pulsetime` es obligatorio (§14).
     */
    latido: (bucketId, evento, pulsetime) => {
      if (!(pulsetime > 0)) throw new Error('latido(): pulsetime es obligatorio y debe ser > 0');
      return pedir('POST', `/buckets/${id(bucketId)}/heartbeat`, {
        parametros: { pulsetime },
        cuerpo: normalizarEvento(evento),
      });
    },

    /** Borra un evento por su id. */
    borrarEvento: (bucketId, eventoId) => pedir('DELETE', `/buckets/${id(bucketId)}/events/${eventoId}`),
  };
}

/** Date → texto ISO 8601; los textos pasan tal cual; undefined sigue siendo undefined. */
function aIso(fecha) {
  return fecha instanceof Date ? fecha.toISOString() : fecha;
}

function normalizarEvento({ timestamp, duration = 0, data = {} }) {
  return { timestamp: aIso(timestamp), duration, data };
}

/** Cliente listo para el dashboard (mismo origen que AW). */
export const aw = crearClienteAW();
