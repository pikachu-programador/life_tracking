// Temas de estilo (V-10): propuestas de paleta, tipografía y formas para que Dremy elija una (o las mezcle).
//
// Cada tema es un archivo css/temas/<id>.css que redefine las MISMAS variables de tokens.css.
// Elegir un tema = poner un <link> a ese archivo justo DESPUÉS del <link> de tokens.css: como usa el
// mismo selector (:root) y viene después, sus valores ganan, y todo el resto del CSS no cambia.
// "provisional" = sin archivo: solo tokens.css.
//
// Ojo: esto es distinto del modo claro/oscuro (js/tema.js). Cada tema trae sus dos modos con light-dark().
//
// Uso:
//   import { iniciarTemasEstilo, elegirTemaEstilo } from './temas.js';
//   iniciarTemasEstilo();               // al arrancar: aplica el tema guardado
//   await elegirTemaEstilo('cuaderno'); // lo cambia, lo guarda y avisa con el evento 'tema-cambiado'

const CLAVE = 'rastreador-tema-estilo'; // en localStorage: compartida por index.html y muestra.html
const ID_HOJA = 'tema-estilo';          // id del <link> del tema

/** Tema que se usa si no hay nada guardado (o lo guardado ya no existe). */
export const TEMA_POR_DEFECTO = 'provisional';

/**
 * Temas disponibles, en el orden en que se muestran. `archivo` es relativo a web/ (null = solo tokens.css).
 * @type {ReadonlyArray<{id: string, nombre: string, descripcion: string, archivo: string|null}>}
 */
export const TEMAS = Object.freeze([
  {
    id: 'provisional',
    nombre: 'Provisional',
    descripcion: 'Solo tokens.css: la paleta de trabajo, sin tema encima.',
    archivo: null,
  },
  {
    id: 'sereno',
    nombre: 'Sereno',
    descripcion: 'Calma y aire: grises fríos, acento azul, esquinas redondeadas, sombras suaves y Segoe UI Variable.',
    archivo: 'css/temas/sereno.css',
  },
  {
    id: 'cuaderno',
    nombre: 'Cuaderno',
    descripcion: 'Papel y tinta: fondos cálidos, letra con serifa (Cambria), líneas finas y colores de lápiz.',
    archivo: 'css/temas/cuaderno.css',
  },
  {
    id: 'tablero',
    nombre: 'Tablero',
    descripcion: 'Panel de instrumentos: interfaz en blanco y negro, colores de señal, esquinas rectas y Bahnschrift.',
    archivo: 'css/temas/tablero.css',
  },
].map((t) => Object.freeze(t)));

/** ¿Existe un tema con este id? */
export function esTemaValido(id) {
  return TEMAS.some((t) => t.id === id);
}

/** El id si es válido; si no (null, vacío, un tema que ya no existe), el tema por defecto. */
export function normalizarTema(id) {
  return esTemaValido(id) ? id : TEMA_POR_DEFECTO;
}

/** Archivo CSS de un tema (relativo a web/), o null si es el provisional o no existe. */
export function archivoDeTema(id) {
  return TEMAS.find((t) => t.id === id)?.archivo ?? null;
}

// ── Lo que sigue usa el navegador (document, localStorage) ──

// localStorage puede fallar (por ejemplo, con el almacenamiento bloqueado): entonces no se recuerda, y listo.
function leerGuardado() {
  try { return localStorage.getItem(CLAVE); } catch { return null; }
}
function guardar(id) {
  try {
    if (id === TEMA_POR_DEFECTO) localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, id);
  } catch { /* sin almacenamiento: el tema dura hasta recargar */ }
}

let aplicado = null;  // id del tema que se ve ahora (null = todavía no se aplicó ninguno)
let pedidos = 0;      // cuenta los cambios pedidos: si llegan dos seguidos, gana el último
let escuchando = false;

/** Tema de estilo elegido ahora ('provisional', 'sereno', …). */
export function temaEstilo() {
  return aplicado ?? normalizarTema(leerGuardado());
}

/**
 * Elige un tema: lo aplica, lo guarda en localStorage y avisa con el evento 'tema-cambiado'
 * (después de que cargue la hoja, para que los gráficos lean los colores nuevos).
 * @param {string} id
 * @returns {Promise<string>} el tema que quedó aplicado (si el archivo no carga, queda el anterior)
 */
export async function elegirTemaEstilo(id) {
  const elegido = normalizarTema(id);
  const quedo = await aplicar(elegido);
  if (quedo === elegido) guardar(elegido);
  return quedo;
}

/**
 * Aplica el tema guardado (llamar una vez al cargar la página). Si en otra pestaña se elige otro
 * tema (por ejemplo, en muestra.html), esta pestaña también cambia.
 * @returns {Promise<string>} el tema aplicado
 */
export function iniciarTemasEstilo() {
  // El evento "storage" llega a las OTRAS pestañas del mismo origen cuando una cambia localStorage.
  if (!escuchando) {
    escuchando = true;
    window.addEventListener('storage', (e) => {
      if (e.key === CLAVE) aplicar(normalizarTema(e.newValue));
    });
  }
  return aplicar(normalizarTema(leerGuardado()));
}

/** Pone o quita el <link> del tema. Devuelve el id del tema que quedó. */
async function aplicar(id) {
  const numero = ++pedidos;
  const anterior = document.getElementById(ID_HOJA);
  const archivo = archivoDeTema(id);

  // Provisional: basta con quitar la hoja del tema (si había una).
  if (!archivo) {
    if (anterior) anterior.remove();
    return terminar(id, Boolean(anterior));
  }
  // Ese tema ya está puesto.
  if (anterior && anterior.dataset.tema === id) return terminar(id, false);

  // La hoja nueva se agrega SIN quitar la anterior: así no hay un instante sin tema (parpadeo).
  const hoja = document.createElement('link');
  hoja.rel = 'stylesheet';
  hoja.href = archivo;
  hoja.dataset.tema = id;
  const tokens = document.getElementById('tokens') ?? document.querySelector('link[href$="tokens.css"]');
  const cargada = new Promise((resolver) => {
    hoja.addEventListener('load', () => resolver(true), { once: true });
    hoja.addEventListener('error', () => resolver(false), { once: true });
  });
  // Justo después de tokens.css (o del tema anterior, que se quita enseguida).
  const despuesDe = anterior ?? tokens;
  if (despuesDe) despuesDe.after(hoja);
  else document.head.append(hoja);

  const ok = await cargada;
  if (numero !== pedidos) {   // mientras cargaba se pidió otro tema: esta hoja ya no sirve
    hoja.remove();
    return temaEstilo();
  }
  if (!ok) {
    hoja.remove();
    console.warn(`No se pudo cargar el tema "${id}" (${archivo}); sigue el anterior.`);
    return temaEstilo();
  }
  if (anterior) anterior.remove();
  hoja.id = ID_HOJA;
  return terminar(id, true);
}

/** Recuerda el tema y, si cambió lo que se ve, avisa (graficos.js redibuja con 'tema-cambiado'). */
function terminar(id, cambio) {
  aplicado = id;
  document.documentElement.dataset.temaEstilo = id;
  if (cambio) document.dispatchEvent(new CustomEvent('tema-cambiado', { detail: { estilo: id } }));
  return id;
}
