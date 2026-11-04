// Vista "Comparar" (arquitectura §13, visualizaciones §4). Por ahora es un marcador: se completa en V-09.

export const titulo = 'Comparar';

/** Dibuja la vista dentro de `contenedor`. */
export function render(contenedor) {
  const h1 = document.createElement('h1');
  h1.textContent = titulo;
  const p = document.createElement('p');
  p.textContent = 'Vista en construcción (V-09).';
  contenedor.append(h1, p);
}
