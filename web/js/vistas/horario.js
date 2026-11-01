// Vista "Horario" (arquitectura §13). Editor del plan y planificador semanal.
// Por ahora es un marcador: se completa en la fase 3.

export const titulo = 'Horario';

/** Dibuja la vista dentro de `contenedor`. */
export function render(contenedor) {
  const h1 = document.createElement('h1');
  h1.textContent = titulo;
  const p = document.createElement('p');
  p.textContent = 'Vista en construcción (la fase 3).';
  contenedor.append(h1, p);
}
