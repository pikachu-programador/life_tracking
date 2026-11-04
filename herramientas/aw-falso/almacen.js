// Almacén en memoria del AW falso (H-01): buckets, eventos y ajustes.
//
// Arranca con los datos de una carpeta (por defecto datos-ejemplo/):
//   - buckets: los archivos "aw-bucket-export-*.json" y "rastreador-*.json" (formato "Export bucket" de AW:
//     { buckets: { "<id>": { id, created, type, client, hostname, events } } });
//   - ajustes: classes = clases-ejemplo.json, startOfDay = "04:00", rastreador-plan = plan-ejemplo.json (sin "nota").
// Lo que se escribe (eventos nuevos, latidos, ajustes) vive solo en la memoria del proceso: al apagar el
// servidor se pierde, y los archivos de la carpeta nunca cambian.
//
// Cada bucket guarda sus eventos ordenados por inicio (ms), así un día se busca con búsqueda binaria.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aInterno, igualesJSON, isoDeAW, recortarAlPeriodo } from './transformaciones.js';

/** Ajustes que AW trae por defecto (los que lee el dashboard). */
const AJUSTES_BASE = { startOfDay: '04:00', startOfWeek: 'Monday', always_active_pattern: '' };

/** Archivos de la carpeta de datos que traen buckets. */
const ARCHIVO_BUCKETS = /^(aw-bucket-export-.+|rastreador-.+)\.json$/;

/** Orden de los eventos de un bucket: por inicio y, en empate, el más corto primero (ver porInicio en transformaciones.js). */
function comparar(a, b) {
  return a.inicio - b.inicio || (a.fin - a.inicio) - (b.fin - b.inicio);
}

/**
 * Crea el almacén.
 * @param {object} [opciones]
 * @param {string|URL} [opciones.carpetaDatos]  carpeta con los JSON (por defecto datos-ejemplo/)
 * @param {string} [opciones.hostname]          el de /info; por defecto, el de los buckets de ventana ("ejemplo")
 */
export function crearAlmacen({ carpetaDatos = new URL('../../datos-ejemplo/', import.meta.url), hostname } = {}) {
  // Como URL que termina en "/", para que new URL(nombre, carpeta) apunte DENTRO de la carpeta.
  const carpeta = carpetaDatos instanceof URL
    ? new URL(carpetaDatos.href.endsWith('/') ? carpetaDatos.href : carpetaDatos.href + '/')
    : pathToFileURL(resolve(carpetaDatos) + sep);
  let host = hostname ?? null; // si no se da, se toma de los buckets al cargarlos
  const buckets = new Map(); // id → { meta, eventos, duracionMaxima }
  const ajustes = new Map(Object.entries(structuredClone(AJUSTES_BASE)));
  let siguienteId = 1; // ids de evento: únicos en todo el almacén, como en la base de datos de AW

  const leerJSON = (nombre) => JSON.parse(readFileSync(new URL(nombre, carpeta), 'utf8'));
  const existe = (nombre) => existsSync(new URL(nombre, carpeta));

  // ── Carga inicial ──
  for (const archivo of readdirSync(carpeta).sort()) {
    if (!ARCHIVO_BUCKETS.test(archivo)) continue;
    const contenido = leerJSON(archivo);
    if (!contenido || typeof contenido.buckets !== 'object') continue;
    for (const [id, b] of Object.entries(contenido.buckets)) {
      const bucket = nuevoBucket(id, b);
      // Los ids se dan en orden de tiempo (las exportaciones vienen del más nuevo al más viejo).
      const eventos = (b.events ?? []).map(aInterno).sort(comparar);
      for (const e of eventos) e.id = siguienteId++;
      bucket.eventos = eventos;
      bucket.duracionMaxima = eventos.reduce((max, e) => Math.max(max, e.fin - e.inicio), 0);
      buckets.set(id, bucket);
    }
  }
  if (existe('clases-ejemplo.json')) ajustes.set('classes', leerJSON('clases-ejemplo.json'));
  if (existe('plan-ejemplo.json')) {
    const { nota, ...plan } = leerJSON('plan-ejemplo.json');
    ajustes.set('rastreador-plan', plan);
  }

  host ??= [...buckets.values()].find((b) => b.meta.type === 'currentwindow')?.meta.hostname ?? 'ejemplo';

  function nuevoBucket(id, { created, name = null, type = '', client = '', hostname: h = host ?? 'unknown', data = {} } = {}) {
    return {
      meta: { id, created: created ?? isoDeAW(Date.now()), name, type, client, hostname: h, data },
      eventos: [],
      duracionMaxima: 0,
    };
  }

  /** El bucket o un error 404 con el mensaje de AW. */
  function bucketOError(id) {
    const b = buckets.get(id);
    if (!b) throw errorHttp(404, `No existe el bucket «${id}»`);
    return b;
  }

  /** Mete un evento en su lugar (búsqueda binaria) para mantener el orden. */
  function insertarOrdenado(bucket, evento) {
    let bajo = 0;
    let alto = bucket.eventos.length;
    while (bajo < alto) {
      const medio = (bajo + alto) >> 1;
      if (comparar(bucket.eventos[medio], evento) <= 0) bajo = medio + 1;
      else alto = medio;
    }
    bucket.eventos.splice(bajo, 0, evento);
    bucket.duracionMaxima = Math.max(bucket.duracionMaxima, evento.fin - evento.inicio);
  }

  function metaConFecha(bucket) {
    const fin = bucket.eventos.reduce((max, e) => Math.max(max, e.fin), -Infinity);
    return { ...bucket.meta, last_updated: Number.isFinite(fin) ? isoDeAW(fin) : bucket.meta.created };
  }

  return {
    hostname: host,

    /** GET /info */
    info: () => ({ hostname: host, version: 'v0.14.1 (aw-falso)', testing: true, device_id: `aw-falso-${host}` }),

    /** GET /buckets/ → { id: {id, created, name, type, client, hostname, data, last_updated} } */
    listaBuckets: () => Object.fromEntries([...buckets.values()].map((b) => [b.meta.id, metaConFecha(b)])),

    /** GET /buckets/<id> (404 si no existe) */
    bucket: (id) => metaConFecha(bucketOError(id)),

    /** ¿Existe el bucket? */
    existeBucket: (id) => buckets.has(id),

    /** POST /buckets/<id>: crea el bucket; devuelve false si ya existía (AW responde 304). */
    crearBucket(id, { client, type, hostname: h, name, data } = {}) {
      if (buckets.has(id)) return false;
      buckets.set(id, nuevoBucket(id, { client, type, hostname: h, name, data }));
      return true;
    },

    /** DELETE /buckets/<id> (404 si no existe) */
    borrarBucket(id) {
      bucketOError(id);
      buckets.delete(id);
    },

    /**
     * Eventos que se solapan con [inicio, fin], recortados al periodo, del más nuevo al más viejo (como AW).
     * @param {string} id
     * @param {{inicio?: number, fin?: number, limite?: number}} [rango]  ms; sin límite si falta o es negativo
     * @returns {Array<{id: number, inicio: number, fin: number, data: object}>}
     */
    eventos(id, { inicio = -Infinity, fin = Infinity, limite } = {}) {
      const b = bucketOError(id);
      const lista = recortarAlPeriodo(b.eventos, inicio, fin, b.duracionMaxima);
      return limite >= 0 ? lista.slice(0, limite) : lista;
    },

    /** Un evento por su id (o null). */
    evento(id, eventoId) {
      return bucketOError(id).eventos.find((e) => e.id === eventoId) ?? null;
    },

    /**
     * POST /buckets/<id>/events: inserta uno o varios eventos de AW.
     * @returns los eventos insertados, con su id
     */
    insertar(id, eventosAW) {
      const b = bucketOError(id);
      const internos = eventosAW.map(aInterno); // valida todos antes de insertar alguno
      for (const e of internos) {
        e.id = siguienteId++;
        insertarOrdenado(b, e);
      }
      return internos;
    },

    /**
     * POST /buckets/<id>/heartbeat (aw-core: Datastore.heartbeat y heartbeat_merge).
     * Si el último evento tiene los mismos datos y el latido empieza entre su inicio y su fin + pulsetime,
     * se alarga (nunca se acorta); si no, el latido se guarda como un evento nuevo.
     * @param {number} pulsetime  segundos
     * @returns el evento alargado o el nuevo
     */
    latido(id, eventoAW, pulsetime) {
      const b = bucketOError(id);
      const latido = aInterno(eventoAW);
      const ultimo = b.eventos.at(-1);
      if (ultimo && igualesJSON(ultimo.data, latido.data)
        && ultimo.inicio <= latido.inicio && latido.inicio <= ultimo.fin + pulsetime * 1000) {
        ultimo.fin = Math.max(ultimo.fin, latido.fin);
        b.duracionMaxima = Math.max(b.duracionMaxima, ultimo.fin - ultimo.inicio);
        return ultimo;
      }
      latido.id = siguienteId++;
      insertarOrdenado(b, latido);
      return latido;
    },

    /** DELETE /buckets/<id>/events/<eid>: true si lo borró. */
    borrarEvento(id, eventoId) {
      const b = bucketOError(id);
      const i = b.eventos.findIndex((e) => e.id === eventoId);
      if (i === -1) return false;
      b.eventos.splice(i, 1);
      return true;
    },

    /** GET /settings → todos los ajustes (copia). */
    ajustes: () => structuredClone(Object.fromEntries(ajustes)),

    /** GET /settings/<clave> → el valor (copia) o null. */
    ajuste: (clave) => (ajustes.has(clave) ? structuredClone(ajustes.get(clave)) : null),

    /** POST /settings/<clave> → guarda una copia del valor y la devuelve. */
    guardarAjuste(clave, valor) {
      ajustes.set(clave, structuredClone(valor));
      return structuredClone(valor);
    },
  };
}

/** Error con código HTTP (el servidor lo responde como JSON {message}). */
export function errorHttp(estado, mensaje) {
  const error = new Error(mensaje);
  error.estado = estado;
  return error;
}
