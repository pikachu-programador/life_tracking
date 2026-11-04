// Lector de literales del lenguaje de consultas de AW (H-01): listas, objetos, textos, números,
// true, false y null. Lo usa consulta.js para leer las reglas de `categorize(events, [...])`.
//
// ¿Por qué no JSON.parse? Porque la consulta la arma aTextoDeConsulta() de web/js/consultas.js, que deja
// UNA barra invertida en las regex (igual que aw-webui): la regla `warp\.exe$` viaja como "warp\.exe$".
// En JSON, "\." es un escape inválido y JSON.parse falla. El lenguaje de AW lee los textos a su manera:
//   - un texto empieza con " o ' y termina en la primera comilla igual que NO tenga una barra justo antes;
//   - lo único que se des-escapa es \" (o \' en textos con comilla simple); las demás barras quedan tal cual.
// Así, "warp\.exe$" se lee como warp\.exe$ (con su barra), que es lo que la regex necesita.
// (Es lo que hace QString en aw-core/aw_query/query2.py.)

/** Error de lectura, con la posición donde falló. */
export class ErrorLiteral extends Error {
  constructor(mensaje, posicion) {
    super(`${mensaje} (posición ${posicion})`);
    this.name = 'ErrorLiteral';
    this.posicion = posicion;
  }
}

const ESPACIO = /\s/;
const NUMERO = /-?\d+(\.\d+)?([eE][+-]?\d+)?/y; // "y" = pegajosa: solo busca justo en lastIndex
const PALABRAS = { true: true, false: false, null: null };

/** Posición del primer carácter que no es espacio a partir de `i`. */
export function saltarEspacios(texto, i) {
  while (i < texto.length && ESPACIO.test(texto[i])) i++;
  return i;
}

/**
 * Lee un texto entre comillas que empieza en `desde`, con las reglas de AW (ver arriba).
 * @param {string} texto
 * @param {number} desde  posición de la comilla que abre
 * @returns {{valor: string, fin: number}}  fin = posición justo después de la comilla que cierra
 */
export function leerTexto(texto, desde) {
  const comilla = texto[desde];
  if (comilla !== '"' && comilla !== "'") throw new ErrorLiteral('Se esperaba una comilla', desde);
  let i = desde + 1;
  while (i < texto.length) {
    if (texto[i] === comilla && texto[i - 1] !== '\\') {
      const crudo = texto.slice(desde + 1, i);
      return { valor: crudo.split('\\' + comilla).join(comilla), fin: i + 1 };
    }
    i++;
  }
  throw new ErrorLiteral('Falta cerrar un texto', desde);
}

/**
 * Lee un literal (lista, objeto, texto, número, true, false o null) que empieza en `desde`
 * (se saltan los espacios del principio).
 * @param {string} texto
 * @param {number} [desde=0]
 * @returns {{valor: *, fin: number}}  fin = posición justo después del literal
 * @throws {ErrorLiteral} si lo que hay no es un literal (por ejemplo, el nombre de una variable)
 */
export function leerLiteral(texto, desde = 0) {
  const i = saltarEspacios(texto, desde);
  const c = texto[i];
  if (c === undefined) throw new ErrorLiteral('Se esperaba un valor y el texto terminó', i);

  if (c === '"' || c === "'") return leerTexto(texto, i);
  if (c === '[') return leerLista(texto, i);
  if (c === '{') return leerObjeto(texto, i);

  NUMERO.lastIndex = i;
  const numero = NUMERO.exec(texto);
  if (numero) return { valor: Number(numero[0]), fin: i + numero[0].length };

  for (const [palabra, valor] of Object.entries(PALABRAS)) {
    // La palabra no puede seguir con letras: "trueno" no es true.
    if (texto.startsWith(palabra, i) && !/[\w$]/.test(texto[i + palabra.length] ?? '')) {
      return { valor, fin: i + palabra.length };
    }
  }
  throw new ErrorLiteral(`Valor no reconocido: «${texto.slice(i, i + 20)}»`, i);
}

/** [valor, valor, ...] */
function leerLista(texto, desde) {
  const lista = [];
  let i = saltarEspacios(texto, desde + 1);
  if (texto[i] === ']') return { valor: lista, fin: i + 1 };
  while (true) {
    const { valor, fin } = leerLiteral(texto, i);
    lista.push(valor);
    i = saltarEspacios(texto, fin);
    if (texto[i] === ',') { i++; continue; }
    if (texto[i] === ']') return { valor: lista, fin: i + 1 };
    throw new ErrorLiteral('Se esperaba "," o "]" en una lista', i);
  }
}

/** {"clave": valor, ...} (las claves son textos) */
function leerObjeto(texto, desde) {
  const objeto = {};
  let i = saltarEspacios(texto, desde + 1);
  if (texto[i] === '}') return { valor: objeto, fin: i + 1 };
  while (true) {
    if (texto[i] !== '"' && texto[i] !== "'") throw new ErrorLiteral('Se esperaba una clave entre comillas', i);
    const clave = leerTexto(texto, i);
    i = saltarEspacios(texto, clave.fin);
    if (texto[i] !== ':') throw new ErrorLiteral('Se esperaba ":" después de la clave', i);
    const { valor, fin } = leerLiteral(texto, i + 1);
    // defineProperty: una clave "__proto__" se guarda como dato y no cambia el prototipo del objeto.
    Object.defineProperty(objeto, clave.valor, { value: valor, enumerable: true, writable: true, configurable: true });
    i = saltarEspacios(texto, fin);
    if (texto[i] === ',') { i = saltarEspacios(texto, i + 1); continue; }
    if (texto[i] === '}') return { valor: objeto, fin: i + 1 };
    throw new ErrorLiteral('Se esperaba "," o "}" en un objeto', i);
  }
}

/**
 * Lee un texto que debe ser UN literal completo (solo se permiten espacios después).
 * @param {string} texto
 * @returns {*}
 */
export function leerLiteralCompleto(texto) {
  const { valor, fin } = leerLiteral(texto, 0);
  const resto = saltarEspacios(texto, fin);
  if (resto < texto.length) throw new ErrorLiteral(`Sobra texto después del valor: «${texto.slice(resto, resto + 20)}»`, resto);
  return valor;
}
