// Router con "#": AW solo sirve archivos estáticos, así que la vista se elige
// con la parte de la dirección que va después del "#" (por ejemplo "#/hoy").
// Cambiar el "#" no recarga la página: el navegador solo avisa con el evento "hashchange".
//
// Parámetros (F2-08): después de la ruta puede ir "?clave=valor&...", por ejemplo "#/hoy?fecha=2026-10-31".
// Así la fecha elegida queda en la dirección y se mantiene al recargar.

/**
 * Arranca el router.
 * @param {Object<string, {titulo: string, render: (contenedor: HTMLElement, parametros: URLSearchParams) => (void|(() => void))}>} rutas
 *   nombre de la ruta → módulo de la vista. Si `render` devuelve una función, se llama al salir
 *   de la vista (sirve para detener temporizadores o liberar gráficos).
 * @param {HTMLElement} contenedor  elemento donde se dibuja la vista.
 * @param {string} rutaInicial  ruta que se usa si el "#" está vacío o no existe.
 */
export function iniciarRouter(rutas, contenedor, rutaInicial) {
  let limpiarVistaAnterior = null;

  function mostrar() {
    // "#/hoy?fecha=2026-10-31" → nombre "hoy", parámetros { fecha: "2026-10-31" }
    const [nombre, consulta = ''] = location.hash.replace(/^#\/?/, '').split('?');
    if (!(nombre in rutas)) {
      // replace() no deja una entrada extra en el historial (el botón "atrás" sigue bien).
      location.replace('#/' + rutaInicial);
      return; // replace dispara otro "hashchange", que vuelve a llamar a mostrar().
    }

    if (limpiarVistaAnterior) limpiarVistaAnterior();
    const vista = rutas[nombre];
    contenedor.replaceChildren(); // borra la vista anterior
    const limpiar = vista.render(contenedor, new URLSearchParams(consulta));
    limpiarVistaAnterior = typeof limpiar === 'function' ? limpiar : null;
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

  // (V-11) Al cambiar de vista con el menú, el foco pasa al contenido: así el teclado y los lectores
  // de pantalla siguen a la vista nueva. En la primera carga no se mueve el foco.
  window.addEventListener('hashchange', () => {
    mostrar();
    contenedor.focus({ preventScroll: true });
  });
  mostrar(); // primera vista: al abrir o al recargar, se respeta el "#" actual
}

/**
 * Cambia los parámetros de la vista actual (por ejemplo, la fecha) sin cambiar de vista.
 * Ejemplo: irAParametros({ fecha: '2026-10-31' }) → "#/hoy?fecha=2026-10-31".
 */
export function irAParametros(parametros) {
  const [nombre] = location.hash.replace(/^#\/?/, '').split('?');
  const consulta = new URLSearchParams(Object.entries(parametros).filter(([, v]) => v)).toString();
  location.hash = '#/' + nombre + (consulta ? '?' + consulta : '');
}
