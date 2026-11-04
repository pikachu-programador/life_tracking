// Servidor HTTP del AW falso (H-01): imita a ActivityWatch v0.14 (servidor Python) con node:http, sin
// dependencias. Rutas de /api/0 (las que usa web/js/aw.js, §14) y web/ en /pages/rastreador/.
//
// Los errores se responden como JSON {message} con su código HTTP, igual que AW.

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { crearAlmacen, errorHttp } from './almacen.js';
import { ejecutarConsulta } from './consulta.js';
import { aEventoAW } from './transformaciones.js';
import { servirEstatico } from './estaticos.js';

const RAIZ = new URL('../../', import.meta.url);
const LIMITE_CUERPO = 20 * 1024 * 1024; // 20 MB: de sobra para el plan o un lote de eventos

/**
 * Crea y arranca el servidor.
 * @param {object} [opciones]
 * @param {number} [opciones.puerto=5600]  0 = un puerto libre cualquiera (para las pruebas)
 * @param {string} [opciones.host='127.0.0.1']
 * @param {string|URL} [opciones.carpetaDatos]  por defecto datos-ejemplo/
 * @param {string|URL} [opciones.carpetaWeb]    por defecto web/
 * @param {(linea: string) => void} [opciones.registro]  recibe una línea por pedido a la API (por defecto, nada)
 * @returns {Promise<{servidor: import('node:http').Server, almacen: object, puerto: number, host: string,
 *                    url: string, base: string, cerrar: () => Promise<void>}>}
 *          url = "http://<host>:<puerto>" y base = url + "/api/0"
 */
export async function crearServidor({
  puerto = 5600,
  host = '127.0.0.1',
  carpetaDatos = new URL('datos-ejemplo/', RAIZ),
  carpetaWeb = new URL('web/', RAIZ),
  registro = () => {},
} = {}) {
  const almacen = crearAlmacen({ carpetaDatos });
  const web = carpetaWeb instanceof URL ? fileURLToPath(carpetaWeb) : String(carpetaWeb);

  const servidor = createServer((pedido, respuesta) => {
    const t0 = performance.now();
    atender(pedido, respuesta, almacen, web).then((estado) => {
      if (pedido.url.startsWith('/api/')) {
        registro(`${pedido.method} ${pedido.url.slice(0, 120)} → ${estado} (${(performance.now() - t0).toFixed(0)} ms)`);
      }
    }).catch(() => respuesta.destroy()); // último recurso: atender() ya responde sus propios errores
  });

  await new Promise((listo, fallo) => {
    servidor.once('error', fallo);
    servidor.listen(puerto, host, () => { servidor.off('error', fallo); listo(); });
  });
  const real = servidor.address().port;
  const hostUrl = host.includes(':') ? `[${host}]` : host; // IPv6 va entre corchetes en una URL
  const url = `http://${hostUrl}:${real}`;
  return {
    servidor,
    almacen,
    puerto: real,
    host,
    url,
    base: `${url}/api/0`,
    cerrar: () => new Promise((listo) => {
      servidor.close(() => listo());
      servidor.closeAllConnections?.(); // corta las conexiones keep-alive que quedaron abiertas
    }),
  };
}

/** Atiende un pedido. Nunca lanza: los errores se responden como JSON. Devuelve el código HTTP. */
async function atender(pedido, respuesta, almacen, web) {
  try {
    const direccion = new URL(pedido.url, 'http://aw-falso');
    const ruta = direccion.pathname;

    if (ruta === '/api/0' || ruta.startsWith('/api/0/')) {
      return await api(pedido, respuesta, almacen, ruta.slice('/api/0'.length), direccion.searchParams);
    }
    if (ruta === '/' || ruta === '/pages/rastreador') {
      // Redirige conservando ?ahora=… (el reloj de prueba de H-02).
      return redirigir(respuesta, '/pages/rastreador/' + direccion.search);
    }
    if (ruta.startsWith('/pages/rastreador/')) {
      return await servirEstatico(pedido, respuesta, web, ruta.slice('/pages/rastreador/'.length));
    }
    return responderJSON(respuesta, 404, { message: `No existe la ruta ${ruta}` });
  } catch (error) {
    const estado = Number.isInteger(error.estado) ? error.estado : 500;
    if (respuesta.headersSent) { respuesta.destroy(); return estado; }
    return responderJSON(respuesta, estado, { message: error.message });
  }
}

// ── API ──

/**
 * Rutas de /api/0. `ruta` es lo que va después de /api/0 (por ejemplo "/buckets/abc/events").
 * AW acepta /buckets y /buckets/, /query y /query/, /settings y /settings/.
 */
async function api(pedido, respuesta, almacen, ruta, parametros) {
  const metodo = pedido.method;
  // Segmentos decodificados: "/buckets/aw-watcher-window_PC/events" → ['buckets', 'aw-watcher-window_PC', 'events']
  const partes = ruta.split('/').filter((p) => p !== '').map(decodificar);
  const [recurso, id, sub, subId] = partes;
  const solo = (...permitidos) => {
    if (!permitidos.includes(metodo)) throw errorHttp(405, `Método ${metodo} no permitido en ${ruta}`);
  };

  if (recurso === 'info' && partes.length === 1) {
    solo('GET');
    return responderJSON(respuesta, 200, almacen.info());
  }

  if (recurso === 'buckets') {
    if (partes.length === 1) {
      solo('GET');
      return responderJSON(respuesta, 200, almacen.listaBuckets());
    }
    if (partes.length === 2) {
      solo('GET', 'POST', 'DELETE');
      if (metodo === 'GET') return responderJSON(respuesta, 200, almacen.bucket(id));
      if (metodo === 'DELETE') {
        almacen.borrarBucket(id); // el AW falso corre en "testing": no exige ?force=1
        return responderJSON(respuesta, 200, {});
      }
      const cuerpo = await leerCuerpo(pedido);
      if (!cuerpo || typeof cuerpo !== 'object') throw errorHttp(400, 'Se esperaba {client, type, hostname}');
      const creado = almacen.crearBucket(id, cuerpo);
      return creado ? responderJSON(respuesta, 200, {}) : responderVacio(respuesta, 304);
    }
    if (sub === 'events' && partes.length === 3) {
      solo('GET', 'POST');
      if (metodo === 'GET') {
        const eventos = almacen.eventos(id, {
          inicio: instante(parametros.get('start'), 'start') ?? -Infinity,
          fin: instante(parametros.get('end'), 'end') ?? Infinity,
          limite: entero(parametros.get('limit'), 'limit'),
        });
        return responderJSON(respuesta, 200, eventos.map(aEventoAW));
      }
      const cuerpo = await leerCuerpo(pedido);
      const lista = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
      let insertados;
      try {
        insertados = almacen.insertar(id, lista);
      } catch (error) {
        if (error.estado) throw error;
        throw errorHttp(400, `Evento inválido: ${error.message}`);
      }
      // Como el servidor Python: devuelve el evento si se insertó uno solo, y null si fueron varios.
      return responderJSON(respuesta, 200, insertados.length === 1 ? aEventoAW(insertados[0]) : null);
    }
    if (sub === 'events' && partes.length === 4) {
      solo('GET', 'DELETE');
      const eventoId = Number(subId);
      if (metodo === 'GET') {
        const evento = Number.isInteger(eventoId) ? almacen.evento(id, eventoId) : null;
        if (!evento) throw errorHttp(404, `No existe el evento ${subId} en «${id}»`);
        return responderJSON(respuesta, 200, aEventoAW(evento));
      }
      const borrado = Number.isInteger(eventoId) && almacen.borrarEvento(id, eventoId);
      return responderJSON(respuesta, 200, { success: borrado });
    }
    if (sub === 'heartbeat' && partes.length === 3) {
      solo('POST');
      const pulsetime = Number(parametros.get('pulsetime'));
      if (!parametros.has('pulsetime') || !Number.isFinite(pulsetime)) {
        throw errorHttp(400, 'Falta el parámetro pulsetime (segundos), obligatorio en /heartbeat');
      }
      const cuerpo = await leerCuerpo(pedido);
      let evento;
      try {
        evento = almacen.latido(id, cuerpo, pulsetime);
      } catch (error) {
        if (error.estado) throw error;
        throw errorHttp(400, `Latido inválido: ${error.message}`);
      }
      return responderJSON(respuesta, 200, aEventoAW(evento));
    }
  }

  if (recurso === 'query' && partes.length === 1) {
    solo('POST');
    const cuerpo = await leerCuerpo(pedido);
    return responderJSON(respuesta, 200, ejecutarConsulta(cuerpo, almacen));
  }

  if (recurso === 'settings') {
    if (partes.length === 1) {
      solo('GET');
      return responderJSON(respuesta, 200, almacen.ajustes());
    }
    if (partes.length === 2) {
      // AW no permite borrar ajustes (responde 405).
      solo('GET', 'POST');
      if (metodo === 'GET') return responderJSON(respuesta, 200, almacen.ajuste(id));
      const valor = await leerCuerpo(pedido);
      return responderJSON(respuesta, 200, almacen.guardarAjuste(id, valor));
    }
  }

  throw errorHttp(404, `No existe la ruta /api/0${ruta}`);
}

// ── Ayudantes ──

function decodificar(segmento) {
  try {
    return decodeURIComponent(segmento);
  } catch {
    throw errorHttp(400, `Ruta mal codificada: ${segmento}`);
  }
}

/** Texto ISO 8601 → ms; null si no vino. */
function instante(texto, nombre) {
  if (texto === null || texto === '') return null;
  const ms = Date.parse(texto);
  if (!Number.isFinite(ms)) throw errorHttp(400, `El parámetro ${nombre} no es una fecha ISO 8601: ${texto}`);
  return ms;
}

/** Texto → entero; undefined si no vino. */
function entero(texto, nombre) {
  if (texto === null || texto === '') return undefined;
  const n = Number(texto);
  if (!Number.isInteger(n)) throw errorHttp(400, `El parámetro ${nombre} debe ser un número entero: ${texto}`);
  return n;
}

/** Lee el cuerpo del pedido como JSON (undefined si viene vacío). */
async function leerCuerpo(pedido) {
  const trozos = [];
  let tamano = 0;
  for await (const trozo of pedido) {
    tamano += trozo.length;
    if (tamano > LIMITE_CUERPO) throw errorHttp(413, 'El cuerpo es demasiado grande');
    trozos.push(trozo);
  }
  const texto = Buffer.concat(trozos).toString('utf8');
  if (texto.trim() === '') return undefined;
  try {
    return JSON.parse(texto);
  } catch {
    throw errorHttp(400, 'El cuerpo no es JSON válido');
  }
}

function responderJSON(respuesta, estado, valor) {
  const texto = JSON.stringify(valor === undefined ? null : valor);
  respuesta.writeHead(estado, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
    'Cache-Control': 'no-store',
  });
  respuesta.end(texto);
  return estado;
}

function responderVacio(respuesta, estado) {
  respuesta.writeHead(estado);
  respuesta.end();
  return estado;
}

function redirigir(respuesta, destino) {
  respuesta.writeHead(302, { Location: destino });
  respuesta.end();
  return 302;
}
