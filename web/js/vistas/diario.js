// Vista "Diario" (arquitectura §13). Check-ins e intervenciones con su motivo.
// Por ahora es un marcador: se completa en las fases 5 y 8.

export const titulo = 'Diario';

/** Dibuja la vista dentro de `contenedor`. */
export function render(contenedor) {
  const h1 = document.createElement('h1');
  h1.textContent = titulo;
  const p = document.createElement('p');
  p.textContent = 'Vista en construcción (las fases 5 y 8).';
  contenedor.append(h1, p);
}
