// Vista "Día típico" (arquitectura §13, visualizaciones §4). Por ahora es un marcador: se completa en V-06.

export const titulo = 'Día típico';

/** Dibuja la vista dentro de `contenedor`. */
export function render(contenedor) {
  const h1 = document.createElement('h1');
  h1.textContent = titulo;
  const p = document.createElement('p');
  p.textContent = 'Vista en construcción (V-06).';
  contenedor.append(h1, p);
}
