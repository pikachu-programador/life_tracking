// Regex de AW → RegExp de JavaScript (F1-09).
//
// Las reglas de categorías de AW se escriben para Python (aw-core) o Rust (aw-server-rust). La sintaxis
// es casi la misma que la de JS, pero hay diferencias que harían que una regla "funcione" en AW y no aquí:
//   - (?i) al inicio: en JS no existe; se convierte en la bandera i.
//   - (?P<nombre>…) y (?P=nombre): en JS son (?<nombre>…) y \k<nombre>.
//   - \A y \Z (inicio y fin del texto): en JS son ^ y $.
//   - En Python y Rust, \w, \d y \b entienden letras con tilde (Unicode); en JS, \w y \b solo ven a-z.
//     Ejemplo: en JS, \bmás\b no coincide con "más" porque "á" no cuenta como letra. Aquí se traducen a
//     clases Unicode (\p{L}, \p{N}…) con la bandera u.
//   - Python acepta escapes como \- o \: fuera de corchetes, y llaves sueltas como literales; con la
//     bandera u, JS los rechaza. Aquí se convierten en el carácter literal.
// Lo que no se puede traducir lanza un error con el mensaje en español (la vista Clasificación lo muestra).

/** Lo que en Python y Rust cuenta como "carácter de palabra" (letras, marcas, números y "_"). */
const PALABRA = '\\p{L}\\p{M}\\p{N}_';
const LIMITE = `(?:(?<=[${PALABRA}])(?![${PALABRA}])|(?<![${PALABRA}])(?=[${PALABRA}]))`;
const NO_LIMITE = `(?:(?<=[${PALABRA}])(?=[${PALABRA}])|(?<![${PALABRA}])(?![${PALABRA}]))`;
/** Caracteres que en JS (bandera u) se pueden escapar con "\" fuera de corchetes. */
const SINTAXIS = new Set('^$\\.*+?()[]{}|/');

/**
 * Traduce una regex de AW a una RegExp de JS.
 * @param {string} texto  la regex tal como está en AW
 * @param {{ignorarMayusculas?: boolean}} [opciones]  ignore_case de la regla
 * @returns {RegExp}  sin las banderas g ni y (test() no guarda estado entre llamadas)
 * @throws {Error} si la regex está vacía o no se puede traducir
 */
export function regexDeAW(texto, { ignorarMayusculas = false } = {}) {
  if (typeof texto !== 'string' || texto.trim() === '') throw new Error('La regex está vacía');
  const banderas = new Set(['u']);
  if (ignorarMayusculas) banderas.add('i');

  let salida = '';
  let enClase = false;     // dentro de [...]
  let i = 0;
  const n = texto.length;

  while (i < n) {
    const c = texto[i];

    if (c === '\\') {
      const s = texto[i + 1];
      if (s === undefined) throw new Error('La regex termina en una barra invertida');
      if ((s === 'p' || s === 'P') && /[A-Za-z]/.test(texto[i + 2] ?? '') ) {
        salida += `\\${s}{${texto[i + 2]}}`; // \pL (una letra, sin llaves) → \p{L}
        i += 3;
        continue;
      }
      if ('pPux'.includes(s) && texto[i + 2] === '{') {
        // \p{L}, \u{1F600} y \x{1F600} (Rust) se copian enteros, con sus llaves.
        const cierre = texto.indexOf('}', i + 3);
        if (cierre === -1) throw new Error(`Falta cerrar la llave de \\${s}{…}`);
        salida += (s === 'x' ? '\\u' : '\\' + s) + texto.slice(i + 2, cierre + 1);
        i = cierre + 1;
        continue;
      }
      salida += traducirEscape(s, enClase, texto, i);
      i += s === 'U' ? 10 : 2;
      continue;
    }

    if (enClase) {
      if (c === ']') enClase = false;
      salida += c;
      i++;
      continue;
    }

    if (c === '[') {
      enClase = true;
      salida += '[';
      i++;
      if (texto[i] === '^') { salida += '^'; i++; }
      if (texto[i] === ']') { salida += '\\]'; i++; } // en Python, "]" justo al abrir es literal
      continue;
    }

    if (c === '(' && texto[i + 1] === '?') {
      const resto = texto.slice(i);
      let m;
      if ((m = /^\(\?P<([A-Za-z_]\w*)>/.exec(resto))) { salida += `(?<${m[1]}>`; i += m[0].length; continue; }
      if ((m = /^\(\?P=([A-Za-z_]\w*)\)/.exec(resto))) { salida += `\\k<${m[1]}>`; i += m[0].length; continue; }
      if ((m = /^\(\?#[^)]*\)/.exec(resto))) { i += m[0].length; continue; } // comentario
      if ((m = /^\(\?([aiLmsux]+)\)/.exec(resto))) {
        // Banderas en línea, por ejemplo (?i). En Rust pueden ir en medio; aquí se aplican a toda la regex.
        for (const b of m[1]) {
          if (b === 'x') throw new Error('El modo verboso (?x) no está soportado');
          if ('ims'.includes(b)) banderas.add(b);
        }
        i += m[0].length;
        continue;
      }
      if ((m = /^\(\?([ims]+):/.exec(resto))) {
        // Grupo con banderas, por ejemplo (?i:…). Aproximación: la bandera vale para toda la regex.
        for (const b of m[1]) banderas.add(b);
        salida += '(?:';
        i += m[0].length;
        continue;
      }
    }

    if (c === '{') {
      const m = /^\{(\d*)(,?)(\d*)\}/.exec(texto.slice(i));
      if (m && (m[1] !== '' || (m[2] === ',' && m[3] !== ''))) {
        // Cuantificador válido. Python acepta {,n} (= {0,n}); JS no.
        salida += m[1] === '' ? `{0,${m[3]}}` : m[0];
        i += m[0].length;
      } else {
        salida += '\\{'; // llave suelta: literal
        i++;
      }
      continue;
    }

    if (c === '}') { salida += '\\}'; i++; continue; }
    if (c === ']') { salida += '\\]'; i++; continue; } // "]" suelto: literal en Python, error en JS con la bandera u

    salida += c;
    i++;
  }

  if (enClase) throw new Error('Falta cerrar un corchete "]"');

  try {
    return new RegExp(salida, [...banderas].join(''));
  } catch (error) {
    throw new Error(`La regex no compila en JS: ${error.message}`);
  }
}

/** Traduce "\" + s (s = carácter que sigue a la barra). */
function traducirEscape(s, enClase, texto, i) {
  switch (s) {
    case 'A': if (!enClase) return '(?<![\\s\\S])'; break; // inicio del texto, aunque haya (?m)
    case 'Z': case 'z': if (!enClase) return '(?![\\s\\S])'; break; // fin del texto
    case 'w': return enClase ? PALABRA : `[${PALABRA}]`;
    case 'W':
      if (enClase) throw new Error('\\W dentro de corchetes no está soportado (en JS no entiende tildes); usa [^…] con letras');
      return `[^${PALABRA}]`;
    case 'd': return '\\p{Nd}';
    case 'D': return '\\P{Nd}';
    case 'b': return enClase ? '\\b' : LIMITE; // dentro de corchetes, \b es "retroceso" en los dos lenguajes
    case 'B': if (!enClase) return NO_LIMITE; break;
    case 'U': {
      // Python: \UXXXXXXXX (8 cifras hexadecimales) → \u{XXXXXXXX}
      const hex = texto.slice(i + 2, i + 10);
      if (!/^[0-9a-fA-F]{8}$/.test(hex)) throw new Error('Escape \\U incompleto');
      return `\\u{${hex}}`;
    }
    case 'N': throw new Error('El escape \\N{…} no está soportado');
    default: break;
  }
  if (/[A-Za-z0-9]/.test(s)) return '\\' + s; // \s, \n, \t, \x41, á, \1, \p{L}…: iguales en JS
  if (SINTAXIS.has(s) || (enClase && s === '-')) return '\\' + s;
  return s; // \- \: \' \# … fuera de corchetes: el carácter literal
}
