// Vista "Clasificación" (arquitectura §13). Más usados, sin clasificar y qué bloquea cada nivel.
// Por ahora es un marcador: se completa en las fases 2, 4 y 6.

export const titulo = 'Clasificación';

/** Dibuja la vista dentro de `contenedor`. */
export function render(contenedor) {
  const h1 = document.createElement('h1');
  h1.textContent = titulo;
  const p = document.createElement('p');
  p.textContent = 'Vista en construcción (las fases 2, 4 y 6).';
  contenedor.append(h1, p);
}
