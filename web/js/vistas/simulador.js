// Vista "Simulador" (arquitectura §13). Intervenciones simuladas por día y nivel.
// Por ahora es un marcador: se completa en la fase 4.

export const titulo = 'Simulador';

/** Dibuja la vista dentro de `contenedor`. */
export function render(contenedor) {
  const h1 = document.createElement('h1');
  h1.textContent = titulo;
  const p = document.createElement('p');
  p.textContent = 'Vista en construcción (la fase 4).';
  contenedor.append(h1, p);
}
