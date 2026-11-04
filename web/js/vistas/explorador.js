// Vista "Explorador de actividad" (arquitectura §13, visualizaciones §4). Por ahora es un marcador: se completa en V-08.

export const titulo = 'Explorador de actividad';

/** Dibuja la vista dentro de `contenedor`. */
export function render(contenedor) {
  const h1 = document.createElement('h1');
  h1.textContent = titulo;
  const p = document.createElement('p');
  p.textContent = 'Vista en construcción (V-08).';
  contenedor.append(h1, p);
}
