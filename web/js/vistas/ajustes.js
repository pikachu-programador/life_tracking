// Vista "Ajustes" (arquitectura §13). Niveles, umbrales, respaldo y estado de AW y del agente.
// Por ahora es un marcador: se completa en las fases 3 y 4.

export const titulo = 'Ajustes';

/** Dibuja la vista dentro de `contenedor`. */
export function render(contenedor) {
  const h1 = document.createElement('h1');
  h1.textContent = titulo;
  const p = document.createElement('p');
  p.textContent = 'Vista en construcción (las fases 3 y 4).';
  contenedor.append(h1, p);
}
