// Pruebas de los temas de estilo (V-10): la lista TEMAS de web/js/temas.js y los archivos css/temas/*.css.
// Los archivos CSS se leen como texto: se revisa que solo redefinan variables de tokens.css, que traigan
// modo claro y oscuro, que el texto pase el contraste AA y que los colores de clase y de curso se distingan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { TEMAS, TEMA_POR_DEFECTO, esTemaValido, normalizarTema, archivoDeTema } from '../web/js/temas.js';

const WEB = new URL('../web/', import.meta.url);
const leer = (ruta) => readFileSync(new URL(ruta, WEB), 'utf8');
const sinComentarios = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Variables definidas en un CSS: { nombre: valor } (sin el "--"). */
function variables(css) {
  const v = {};
  for (const m of sinComentarios(css).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) v[m[1]] = m[2].trim();
  return v;
}
/** light-dark(#claro, #oscuro) → { claro, oscuro }, o null si no tiene esa forma. */
function modos(valor) {
  const m = /^light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)$/i.exec(valor);
  return m ? { claro: m[1].toLowerCase(), oscuro: m[2].toLowerCase() } : null;
}

// ── Color: contraste WCAG y distancia en OKLab (×100; ~2 apenas se nota, 15 se distingue bien) ──
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lineal = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminancia = (h) => { const [r, g, b] = rgb(h).map(lineal); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a, b) => { const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function oklab(h) {
  const [r, g, b] = rgb(h).map(lineal);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const distancia = (a, b) => { const A = oklab(a), B = oklab(b); return 100 * Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
function peorPareja(colores) {
  let peor = { d: Infinity };
  for (let i = 0; i < colores.length; i++) for (let j = i + 1; j < colores.length; j++) {
    const d = distancia(colores[i][1], colores[j][1]);
    if (d < peor.d) peor = { d, a: colores[i][0], b: colores[j][0] };
  }
  return peor;
}

const TOKENS = variables(leer('css/tokens.css'));
const CON_ARCHIVO = TEMAS.filter((t) => t.archivo);
const CLASES = ['estudio', 'ia', 'neutral', 'distraccion', 'sin-clasificar'];
const CURSOS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `curso-${n}`);

// ── La lista TEMAS ──

test('TEMAS: provisional primero (sin archivo) y tres temas con archivo', () => {
  assert.equal(TEMAS[0].id, 'provisional');
  assert.equal(TEMAS[0].archivo, null);
  assert.equal(TEMA_POR_DEFECTO, 'provisional');
  assert.equal(CON_ARCHIVO.length, 3);
  assert.equal(new Set(TEMAS.map((t) => t.id)).size, TEMAS.length, 'ids repetidos');
  for (const t of TEMAS) {
    assert.match(t.id, /^[a-z]+$/);
    assert.ok(t.nombre.length > 0 && t.descripcion.length > 0, `${t.id}: falta nombre o descripción`);
    if (t.archivo) assert.equal(t.archivo, `css/temas/${t.id}.css`);
  }
});

test('TEMAS no se puede modificar por accidente', () => {
  assert.ok(Object.isFrozen(TEMAS));
  assert.ok(TEMAS.every((t) => Object.isFrozen(t)));
});

test('esTemaValido, normalizarTema y archivoDeTema', () => {
  assert.equal(esTemaValido('cuaderno'), true);
  assert.equal(esTemaValido('nocturno'), false);
  assert.equal(normalizarTema('tablero'), 'tablero');
  for (const raro of [null, undefined, '', 'Sereno', 'no-existe', 42]) assert.equal(normalizarTema(raro), 'provisional');
  assert.equal(archivoDeTema('sereno'), 'css/temas/sereno.css');
  assert.equal(archivoDeTema('provisional'), null);
  assert.equal(archivoDeTema('no-existe'), null);
});

test('cada archivo de css/temas/ está en TEMAS (y al revés)', () => {
  const archivos = readdirSync(new URL('css/temas/', WEB)).filter((f) => f.endsWith('.css')).sort();
  assert.deepEqual(archivos, CON_ARCHIVO.map((t) => `${t.id}.css`).sort());
});

// ── Los archivos de tema ──

for (const tema of CON_ARCHIVO) {
  const css = leer(tema.archivo);
  const propias = variables(css);

  test(`${tema.id}: solo :root y solo variables que existen en tokens.css`, () => {
    const selectores = [...sinComentarios(css).matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
    assert.deepEqual([...new Set(selectores)], [':root']);
    assert.ok(!css.includes('!important'));
    // Fuera de las variables no hay declaraciones (por ejemplo, "color: red" suelto).
    const cuerpo = sinComentarios(css).replace(/:root\s*\{/, '').replace(/\}\s*$/, '');
    for (const decl of cuerpo.split(';').map((d) => d.trim()).filter(Boolean)) assert.match(decl, /^--[\w-]+\s*:/, decl);
    for (const nombre of Object.keys(propias)) assert.ok(nombre in TOKENS, `--${nombre} no existe en tokens.css`);
  });

  test(`${tema.id}: cada color trae modo claro y oscuro (light-dark con dos hex)`, () => {
    for (const [nombre, valor] of Object.entries(propias)) {
      if (nombre.startsWith('color-')) assert.ok(modos(valor), `--${nombre}: ${valor}`);
    }
    // Redefine al menos los colores base de clases, interfaz y cursos.
    for (const n of [...CLASES, 'afk', 'sin-pc', 'acento', 'acento-texto', 'fondo', 'superficie', 'borde', 'texto', 'texto-suave', 'aviso', 'aviso-fondo', ...CURSOS]) {
      assert.ok(`color-${n}` in propias, `falta --color-${n}`);
    }
  });

  for (const modo of ['claro', 'oscuro']) {
    const c = (n) => modos(propias[`color-${n}`])[modo];

    test(`${tema.id} (${modo}): el texto pasa el contraste AA`, () => {
      const pares = [
        ['texto', 'fondo', 7], ['texto', 'superficie', 7],
        ['texto-suave', 'fondo', 4.5], ['texto-suave', 'superficie', 4.5],
        ['acento', 'superficie', 4.5], ['acento', 'fondo', 4.5],           // enlaces
        ['acento-texto', 'acento', 4.5],                                   // botón primario
        ['aviso', 'aviso-fondo', 4.5], ['texto', 'aviso-fondo', 7],
      ];
      for (const [a, b, minimo] of pares) {
        const r = contraste(c(a), c(b));
        assert.ok(r >= minimo, `${a} sobre ${b}: ${r.toFixed(2)} < ${minimo}`);
      }
    });

    test(`${tema.id} (${modo}): los colores de clase y de curso se distinguen`, () => {
      const clases = peorPareja(CLASES.map((n) => [n, c(n)]));
      assert.ok(clases.d >= 14, `clases ${clases.a} y ${clases.b}: ${clases.d.toFixed(1)}`);
      // AFK y Sin PC son grises a propósito: se separan entre sí, de Neutral y (Sin PC, rayado) del fondo.
      assert.ok(distancia(c('afk'), c('sin-pc')) >= 6, 'afk y sin-pc');
      assert.ok(distancia(c('afk'), c('neutral')) >= 14, 'afk y neutral');
      assert.ok(distancia(c('sin-pc'), c('superficie')) >= 3, 'sin-pc y superficie');
      const cursos = peorPareja(CURSOS.map((n) => [n, c(n)]));
      assert.ok(cursos.d >= 12, `cursos ${cursos.a} y ${cursos.b}: ${cursos.d.toFixed(1)}`);
    });
  }
}
