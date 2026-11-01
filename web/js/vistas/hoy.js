// Vista "Hoy" (arquitectura §13). Horas despierto, bloque actual, línea de tiempo y cumplimiento del día.
// Por ahora es un marcador: se completa en las fases 1 a 6.

export const titulo = 'Hoy';

/** Dibuja la vista dentro de `contenedor`. */
export function render(contenedor) {
  const h1 = document.createElement('h1');
  h1.textContent = titulo;
  const p = document.createElement('p');
  p.textContent = 'Vista en construcción (las fases 1 a 6).';
  contenedor.append(h1, p);
}
