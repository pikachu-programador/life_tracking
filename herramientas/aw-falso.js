#!/usr/bin/env node
// AW falso (H-01): un ActivityWatch de mentira para probar el dashboard sin AW, con los datos de datos-ejemplo/.
//
// Uso:
//   node herramientas/aw-falso.js [--puerto 5600] [--host 127.0.0.1] [--datos carpeta]
// Después abre, por ejemplo:
//   http://localhost:5600/pages/rastreador/?ahora=2026-10-14T16:20#/hoy
// (?ahora= es el reloj de prueba de H-02: los datos de ejemplo son del 5 al 18 de octubre de 2026.)
//
// Lo que se guarda (ajustes, check-ins, latidos) vive solo en la memoria: al apagarlo (Ctrl+C) se pierde.
// El código está en herramientas/aw-falso/ (almacen, transformaciones, consulta, literales, estaticos, servidor).

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { crearServidor } from './aw-falso/servidor.js';

export { crearServidor };

/** Lee --puerto, --host y --datos de los argumentos. */
export function leerArgumentos(argumentos) {
  const opciones = { puerto: 5600, host: '127.0.0.1' };
  for (let i = 0; i < argumentos.length; i++) {
    const arg = argumentos[i];
    const valor = argumentos[i + 1];
    if (arg === '--puerto' || arg === '-p') {
      const n = Number(valor);
      if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`Puerto inválido: ${valor}`);
      opciones.puerto = n;
      i++;
    } else if (arg === '--host') {
      if (!valor) throw new Error('Falta el valor de --host');
      opciones.host = valor;
      i++;
    } else if (arg === '--datos') {
      if (!valor) throw new Error('Falta la carpeta de --datos');
      opciones.carpetaDatos = resolve(valor);
      i++;
    } else if (arg === '--ayuda' || arg === '-h' || arg === '--help') {
      opciones.ayuda = true;
    } else {
      throw new Error(`Argumento desconocido: ${arg}`);
    }
  }
  return opciones;
}

async function principal() {
  let opciones;
  try {
    opciones = leerArgumentos(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error('Uso: node herramientas/aw-falso.js [--puerto 5600] [--host 127.0.0.1] [--datos carpeta]');
    process.exit(2);
  }
  if (opciones.ayuda) {
    console.log('Uso: node herramientas/aw-falso.js [--puerto 5600] [--host 127.0.0.1] [--datos carpeta]');
    return;
  }

  let aw;
  try {
    aw = await crearServidor({ ...opciones, registro: (linea) => console.log(linea) });
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      console.error(`El puerto ${opciones.puerto} está ocupado (¿está abierto el AW real?). Prueba con --puerto 5655.`);
    } else {
      console.error(`No se pudo arrancar el AW falso: ${error.message}`);
    }
    process.exit(1);
  }

  const local = `http://localhost:${aw.puerto}`;
  console.log(`AW falso escuchando en ${aw.base} (host "${aw.almacen.hostname}", datos de ejemplo)`);
  console.log(`Dashboard: ${local}/pages/rastreador/`);
  console.log(`Ejemplo con reloj de prueba: ${local}/pages/rastreador/?ahora=2026-10-14T16:20#/hoy`);
  console.log('Lo que se guarde vive solo en la memoria. Ctrl+C para apagarlo.');

  const apagar = () => {
    console.log('\nApagando el AW falso…');
    aw.cerrar().then(() => process.exit(0));
  };
  process.on('SIGINT', apagar);
  process.on('SIGTERM', apagar);
}

// Solo arranca si se ejecuta directamente (node herramientas/aw-falso.js), no al importarlo desde una prueba.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  principal();
}
