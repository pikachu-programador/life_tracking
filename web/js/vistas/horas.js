// Vista "Horas del día" (arquitectura §13). Barras por hora, mapa de calor y reloj de 24 h.
// Por ahora es un marcador: se completa en la fase 2.

export const titulo = 'Horas del día';

/** Dibuja la vista dentro de `contenedor`. */
export function render(contenedor) {
  const h1 = document.createElement('h1');
  h1.textContent = titulo;
  const p = document.createElement('p');
  p.textContent = 'Vista en construcción (la fase 2).';
  contenedor.append(h1, p);
}
