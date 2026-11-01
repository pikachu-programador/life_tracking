// Vista "Cumplimiento" (arquitectura §13). Calendario, puntualidad, foco y horas por curso.
// Por ahora es un marcador: se completa en las fases 4 y 5.

export const titulo = 'Cumplimiento';

/** Dibuja la vista dentro de `contenedor`. */
export function render(contenedor) {
  const h1 = document.createElement('h1');
  h1.textContent = titulo;
  const p = document.createElement('p');
  p.textContent = 'Vista en construcción (las fases 4 y 5).';
  contenedor.append(h1, p);
}
