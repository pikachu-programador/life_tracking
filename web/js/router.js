// Router con "#": AW solo sirve archivos estáticos, así que la vista se elige
// con la parte de la dirección que va después del "#" (por ejemplo "#/hoy").
// Cambiar el "#" no recarga la página: el navegador solo avisa con el evento "hashchange".

/**
 * Arranca el router.
 * @param {Object<string, {titulo: string, render: (contenedor: HTMLElement) => void}>} rutas
 *   nombre de la ruta → módulo de la vista.
 * @param {HTMLElement} contenedor  elemento donde se dibuja la vista.
 * @param {string} rutaInicial  ruta que se usa si el "#" está vacío o no existe.
 */
export function iniciarRouter(rutas, contenedor, rutaInicial) {
  function mostrar() {
    // "#/horas" → "horas"
    const nombre = location.hash.replace(/^#\/?/, '');
    if (!(nombre in rutas)) {
      // replace() no deja una entrada extra en el historial (el botón "atrás" sigue bien).
      location.replace('#/' + rutaInicial);
      return; // replace dispara otro "hashchange", que vuelve a llamar a mostrar().
    }

    const vista = rutas[nombre];
    contenedor.replaceChildren(); // borra la vista anterior
    vista.render(contenedor);
    document.title = vista.titulo + ' · Rastreador';

    // Marca el enlace activo del menú (el CSS lo resalta con [aria-current]).
    for (const enlace of document.querySelectorAll('.menu a')) {
      if (enlace.getAttribute('href') === '#/' + nombre) {
        enlace.setAttribute('aria-current', 'page');
      } else {
        enlace.removeAttribute('aria-current');
      }
    }
  }

  window.addEventListener('hashchange', mostrar);
  mostrar(); // primera vista: al abrir o al recargar, se respeta el "#" actual
}
