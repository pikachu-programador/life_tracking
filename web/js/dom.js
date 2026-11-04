// Ayudantes para crear elementos del DOM sin repetir createElement (los usan todas las vistas).

/**
 * Crea un elemento: el('button', { class: 'boton', onclick: f }, 'Texto', otroNodo).
 * - Atributos que empiezan con "on" → escuchan ese evento (onclick → 'click').
 * - true → atributo sin valor (disabled); false, null o undefined → no se pone.
 * - style puede ser un objeto: { '--valor': '40%', color: 'var(--color-texto)' }.
 * - Los hijos pueden ser texto, nodos o listas; null y false se saltan.
 * @returns {HTMLElement}
 */
export function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  ponerAtributos(nodo, atributos);
  nodo.append(...aplanar(hijos));
  return nodo;
}

/** Igual que el(), pero para SVG (iconos y gráficos pequeños hechos a mano). */
export function svg(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElementNS('http://www.w3.org/2000/svg', etiqueta);
  ponerAtributos(nodo, atributos);
  nodo.append(...aplanar(hijos));
  return nodo;
}

function ponerAtributos(nodo, atributos) {
  for (const [k, v] of Object.entries(atributos ?? {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k.startsWith('on') && typeof v === 'function') nodo.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, valor] of Object.entries(v)) nodo.style.setProperty(prop, valor);
    } else if (v === true) nodo.setAttribute(k, '');
    else nodo.setAttribute(k, v);
  }
}

function aplanar(hijos) {
  return hijos.flat(Infinity).filter((h) => h !== null && h !== undefined && h !== false)
    .map((h) => (typeof h === 'number' ? String(h) : h));
}

/** Reemplaza el contenido de un contenedor. */
export function reemplazar(contenedor, ...hijos) {
  contenedor.replaceChildren(...aplanar(hijos));
}
