// Respaldo del plan (F3-02): exportar e importar en JSON (arquitectura §8).
//
// El plan vive en el ajuste `rastreador-plan` de AW (lo leen y guardan datos.plan() y datos.guardarPlan()).
// Como los ajustes están dentro de la base de datos de AW, el respaldo es un archivo JSON aparte.
//
// Dos partes:
// - Funciones PURAS (se prueban en Node, pruebas/respaldo.test.js): crearRespaldo, textoDeRespaldo,
//   leerRespaldo y nombreDeRespaldo.
// - Funciones del navegador: descargarTexto (guarda un archivo) y elegirArchivo (abre el selector de archivos).

import { normalizarPlan, validarPlan } from '../motor/plan.js';
import { fechaLocal } from '../motor/fechas.js';

/** Marca del archivo: así se reconoce un respaldo de este dashboard. */
export const FORMATO_RESPALDO = 'rastreador-respaldo';
export const VERSION_RESPALDO = 1;

/**
 * Objeto del respaldo: el plan (normalizado) y, si se pasan, los niveles.
 * @param {{plan: object, niveles?: object|null, ahora: number}} entrada  ahora en ms (sale del reloj, no de new Date())
 * @returns {{formato: string, version: number, exportado: string, plan: object, niveles?: object}}
 */
export function crearRespaldo({ plan, niveles = null, ahora }) {
  const respaldo = {
    formato: FORMATO_RESPALDO,
    version: VERSION_RESPALDO,
    exportado: new Date(ahora).toISOString(),
    plan: normalizarPlan(plan),
  };
  if (niveles) respaldo.niveles = structuredClone(niveles);
  return respaldo;
}

/** El respaldo como texto JSON con sangría (se puede leer y comparar con git diff). */
export function textoDeRespaldo(entrada) {
  return JSON.stringify(crearRespaldo(entrada), null, 2) + '\n';
}

/** "rastreador-plan-2026-10-14.json" (la fecha de Lima del instante). */
export function nombreDeRespaldo(ahora) {
  return `rastreador-plan-${fechaLocal(ahora)}.json`;
}

/**
 * Lee el texto de un archivo de respaldo. Acepta:
 * - un respaldo de este dashboard ({formato: 'rastreador-respaldo', plan, niveles?});
 * - un plan suelto (el JSON de `rastreador-plan`, como datos-ejemplo/plan-ejemplo.json).
 * No guarda nada: devuelve el plan normalizado y el resultado de validarPlan, para que la vista decida.
 * @param {string} texto
 * @param {{inicioDia?: string}} [opciones]
 * @returns {{plan: object, niveles: object|null, exportado: string|null, valido: boolean,
 *            errores: Array<{ruta: string, mensaje: string}>, avisos: Array<{ruta: string, mensaje: string}>}}
 * @throws {Error} si el texto no es JSON o no parece un plan
 */
export function leerRespaldo(texto, opciones = {}) {
  let crudo;
  try {
    crudo = JSON.parse(texto);
  } catch (error) {
    throw new Error('El archivo no es un JSON válido: ' + error.message);
  }
  const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!esObjeto(crudo)) throw new Error('El archivo no tiene un plan: se esperaba un objeto JSON (entre llaves { }).');

  let plan;
  let niveles = null;
  let exportado = null;
  if (crudo.formato === FORMATO_RESPALDO) {
    if (!esObjeto(crudo.plan)) throw new Error('El respaldo no trae el plan (falta "plan").');
    plan = crudo.plan;
    niveles = esObjeto(crudo.niveles) ? crudo.niveles : null;
    exportado = typeof crudo.exportado === 'string' ? crudo.exportado : null;
  } else if (['ciclo', 'cursos', 'clases', 'rutinas', 'bloques'].some((clave) => clave in crudo)) {
    plan = crudo; // un plan suelto
  } else {
    throw new Error('El archivo no parece un plan: no tiene ciclo, cursos, clases, rutinas ni bloques.');
  }

  const { valido, errores, avisos } = validarPlan(plan, opciones);
  return { plan: normalizarPlan(plan), niveles, exportado, valido, errores, avisos };
}

// ── Navegador ──

/** Guarda un texto como archivo (el navegador lo deja en Descargas). */
export function descargarTexto(nombre, texto, tipo = 'application/json') {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Abre el selector de archivos y devuelve el texto del archivo elegido (o null si se cancela).
 * @param {string} [acepta]  extensiones o tipos (".json")
 * @returns {Promise<{nombre: string, texto: string}|null>}
 */
export function elegirArchivo(acepta = '.json,application/json') {
  return new Promise((resolver, rechazar) => {
    const campo = document.createElement('input');
    campo.type = 'file';
    campo.accept = acepta;
    campo.addEventListener('change', async () => {
      const archivo = campo.files?.[0];
      if (!archivo) return resolver(null);
      try {
        resolver({ nombre: archivo.name, texto: await archivo.text() });
      } catch (error) {
        rechazar(error);
      }
    });
    campo.addEventListener('cancel', () => resolver(null));
    campo.click();
  });
}
