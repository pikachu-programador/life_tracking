// Clasificador (H-01; F6-02 lo reutiliza en el agente): aplica las reglas de categorías de AW (ajuste
// `classes`) a los datos de un evento, con el mismo criterio que AW (arquitectura §7):
//   - Solo cuentan las reglas de tipo 'regex' con una regex no vacía. Las de tipo 'none' (o null) son los
//     "padres" del árbol (por ejemplo, "Estudio" a secas) y nunca coinciden.
//   - Cada regex se BUSCA (no tiene que cubrir el texto entero) en todos los valores de texto de `data`
//     (app, title y, en eventos web, url…), o solo en las claves de `select_keys` si la regla las trae.
//   - Rango de una regla: su `priority` si es un número; si no, profundidad × 10 (["Estudio", "Inglés"] → 20).
//     Gana la de mayor rango y, en empate, la que va DESPUÉS en la lista.
//   - Si no coincide ninguna: ['Uncategorized'].
// Es lo que hacen aw-server-rust/aw-transform/src/classify.rs y aw-core/aw_transform/classify.py.
//
// Funciones puras: no modifican sus entradas ni usan DOM, red o reloj.

import { regexDeAW } from './regex.js';
import { CLASE_DE_AW } from './tipos.js';

/** Categoría que AW pone cuando ninguna regla coincide. */
const SIN_CATEGORIA = 'Uncategorized';

/**
 * Compila el ajuste `classes` de AW: traduce cada regex a JS UNA sola vez (compilar es lo caro;
 * después, probar 1500 eventos contra 30 reglas toma milisegundos).
 * Las reglas que no compilan van a `errores` (la vista Clasificación las muestra) y se saltan.
 * @param {import('./tipos.js').ReglaAW[]} classes  el ajuste `classes` tal como lo guarda AW
 * @returns {import('./tipos.js').ReglasCompiladas}
 */
export function compilarReglas(classes) {
  const reglas = [];
  const errores = [];
  if (!Array.isArray(classes)) return { reglas, errores };

  classes.forEach((clase, indice) => {
    const regla = clase?.rule;
    // Los padres ('none' o null) y las reglas sin regex no coinciden nunca: no son errores, se saltan.
    if (!regla || regla.type !== 'regex') return;
    if (typeof regla.regex !== 'string' || regla.regex.trim() === '') return;

    const nombre = clase.name;
    if (!Array.isArray(nombre) || nombre.length === 0 || !nombre.every((n) => typeof n === 'string')) {
      errores.push({ categoria: Array.isArray(nombre) ? [...nombre] : [], regex: regla.regex, mensaje: 'La regla no tiene un nombre válido (lista de textos)' });
      return;
    }

    let regex;
    try {
      regex = regexDeAW(regla.regex, { ignorarMayusculas: regla.ignore_case === true });
    } catch (error) {
      errores.push({ categoria: [...nombre], regex: regla.regex, mensaje: error.message });
      return;
    }

    reglas.push({
      categoria: [...nombre],
      regex,
      // select_keys vacío cuenta como "sin select_keys" (igual que en Python: una lista vacía es falsa).
      claves: Array.isArray(regla.select_keys) && regla.select_keys.length > 0 ? [...regla.select_keys] : null,
      rango: typeof regla.priority === 'number' && Number.isFinite(regla.priority) ? regla.priority : nombre.length * 10,
      indice,
    });
  });

  return { reglas, errores };
}

// Las reglas ordenadas de la que gana a la que pierde (mayor rango primero y, en empate, la posterior).
// Así basta con devolver la PRIMERA que coincide. Se calcula una vez por cada `compiladas`:
// un WeakMap guarda el orden "pegado" al objeto sin modificarlo, y se borra solo cuando el objeto se libera.
const ordenDe = new WeakMap();

function reglasEnOrden(compiladas) {
  let orden = ordenDe.get(compiladas);
  if (!orden) {
    orden = [...(compiladas?.reglas ?? [])].sort((a, b) => b.rango - a.rango || b.indice - a.indice);
    if (compiladas && typeof compiladas === 'object') ordenDe.set(compiladas, orden);
  }
  return orden;
}

/** ¿La regla encuentra su regex en alguno de los valores de texto de `data`? */
function coincide(regla, data) {
  const valores = regla.claves ? regla.claves.map((clave) => data[clave]) : Object.values(data);
  // Los valores que no son texto (números, booleanos, la lista $category…) se ignoran, como en AW.
  return valores.some((valor) => typeof valor === 'string' && regla.regex.test(valor));
}

/**
 * Categoría de AW para los datos de un evento (§7): cada regex se prueba contra todos los campos de texto
 * de `data` (o solo los de `select_keys`); gana el mayor rango (priority, o profundidad × 10) y, en empate,
 * la regla posterior.
 * @param {Object<string, *>} data  ventana: {app, title}; para el agente, también url
 * @param {import('./tipos.js').ReglasCompiladas} compiladas  lo que devuelve compilarReglas
 * @returns {string[]}  la ruta de la categoría (copia nueva); ['Uncategorized'] si ninguna coincide
 */
export function categorizar(data, compiladas) {
  if (data && typeof data === 'object') {
    for (const regla of reglasEnOrden(compiladas)) {
      if (coincide(regla, data)) return [...regla.categoria];
    }
  }
  return [SIN_CATEGORIA];
}

/**
 * Copia de los eventos con `data.$category` (los eventos originales no cambian).
 * Muchos eventos repiten la misma app y el mismo título: el resultado se recuerda por sus datos
 * para no probar las regex otra vez.
 * @param {import('./tipos.js').EventoAW[]} eventos
 * @param {import('./tipos.js').ReglasCompiladas} compiladas
 * @returns {import('./tipos.js').EventoAW[]}
 */
export function categorizarEventos(eventos, compiladas) {
  const vistos = new Map(); // clave de los datos → categoría
  return (eventos ?? []).map((evento) => {
    const data = evento?.data ?? {};
    const clave = claveDeDatos(data);
    let categoria = clave === null ? null : vistos.get(clave);
    if (!categoria) {
      categoria = categorizar(data, compiladas);
      if (clave !== null) vistos.set(clave, categoria);
    }
    return { ...evento, data: { ...data, $category: [...categoria] } };
  });
}

/** Texto que identifica los valores de texto de `data` (o null si no se puede armar). */
function claveDeDatos(data) {
  try {
    // Se ignora $category: no es texto, así que no cambia el resultado.
    const { $category, ...resto } = data;
    return JSON.stringify(resto);
  } catch {
    return null; // datos con ciclos u otros valores raros: se clasifica sin recordar
  }
}

/**
 * Clase de actividad de una categoría: ['Estudio', 'Inglés'] → 'estudio'.
 * Un primer nivel desconocido (o una categoría vacía) → 'sin-clasificar'.
 * @param {string[]} categoria  ruta de AW (también acepta el texto 'Estudio > Inglés')
 * @returns {import('./tipos.js').Estado}
 */
export function claseDeCategoria(categoria) {
  const primero = Array.isArray(categoria) ? categoria[0]
    : typeof categoria === 'string' ? categoria.split(' > ')[0]
      : undefined;
  // Object.hasOwn evita que un nombre como "constructor" encuentre algo heredado del objeto.
  return typeof primero === 'string' && Object.hasOwn(CLASE_DE_AW, primero) ? CLASE_DE_AW[primero] : 'sin-clasificar';
}
