// Archivos estáticos del AW falso (H-01): sirve web/ en /pages/rastreador/, como el `custom_static` de AW,
// así el dashboard y la API comparten origen (sin CORS).
//
// Seguridad: la ruta pedida se decodifica y se resuelve DENTRO de la carpeta web/. Si sale de ella
// (por ejemplo con "../" o "%2e%2e%2f"), se responde 404 sin leer nada.

import { readFile, stat, realpath } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

/** Tipo MIME por extensión. Los módulos ES exigen text/javascript (§14: el problema del servidor Python). */
export const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * Ruta absoluta del archivo pedido dentro de `carpeta`, o null si no es válida o sale de la carpeta.
 * @param {string} carpeta  carpeta raíz (absoluta)
 * @param {string} rutaPedida  lo que va después de /pages/rastreador/, todavía codificado (%20…)
 */
export function rutaSegura(carpeta, rutaPedida) {
  let ruta;
  try {
    ruta = decodeURIComponent(rutaPedida);
  } catch {
    return null; // "%E0%A4%A" y otras codificaciones rotas
  }
  if (ruta.includes('\0')) return null;
  const raiz = resolve(carpeta);
  // Las barras invertidas se tratan como separadores también en Linux, para que "..\" tampoco escape.
  const absoluta = resolve(join(raiz, ruta.replace(/\\/g, '/')));
  return absoluta === raiz || absoluta.startsWith(raiz + sep) ? absoluta : null;
}

/**
 * Responde un archivo de `carpeta`. Una carpeta sirve su index.html.
 * @param {import('node:http').IncomingMessage} pedido
 * @param {import('node:http').ServerResponse} respuesta
 * @param {string} carpeta  carpeta web/ (absoluta)
 * @param {string} rutaPedida  lo que va después de /pages/rastreador/
 * @returns {Promise<number>} el código HTTP respondido
 */
export async function servirEstatico(pedido, respuesta, carpeta, rutaPedida) {
  if (pedido.method !== 'GET' && pedido.method !== 'HEAD') {
    return responderTexto(respuesta, 405, 'Método no permitido', { Allow: 'GET, HEAD' });
  }
  let ruta = rutaSegura(carpeta, rutaPedida);
  if (!ruta) return responderTexto(respuesta, 404, 'No existe');

  try {
    let info = await stat(ruta);
    if (info.isDirectory()) {
      ruta = join(ruta, 'index.html');
      info = await stat(ruta);
    }
    if (!info.isFile()) return responderTexto(respuesta, 404, 'No existe');
    // Un enlace simbólico dentro de web/ podría apuntar afuera: se comprueba la ruta real.
    const real = await realpath(ruta);
    const raizReal = await realpath(carpeta);
    if (real !== raizReal && !real.startsWith(raizReal + sep)) return responderTexto(respuesta, 404, 'No existe');

    const contenido = await readFile(real);
    respuesta.writeHead(200, {
      'Content-Type': TIPOS_MIME[extname(real).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': contenido.length,
      'Cache-Control': 'no-cache', // en desarrollo, los cambios en web/ se ven al recargar
      'X-Content-Type-Options': 'nosniff',
    });
    respuesta.end(pedido.method === 'HEAD' ? undefined : contenido);
    return 200;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return responderTexto(respuesta, 404, 'No existe');
    throw error;
  }
}

function responderTexto(respuesta, estado, texto, cabeceras = {}) {
  respuesta.writeHead(estado, { 'Content-Type': 'text/plain; charset=utf-8', ...cabeceras });
  respuesta.end(texto);
  return estado;
}
