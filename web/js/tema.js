// Modo claro / oscuro.
// Hay tres opciones: "sistema" (sigue a Windows), "claro" y "oscuro".
// La elección se guarda en localStorage para que sobreviva a recargar la página.
// tokens.css hace el resto: con data-tema en <html> cambia `color-scheme`, y light-dark() elige el color.

const CLAVE = 'rastreador-tema';
const OPCIONES = ['sistema', 'claro', 'oscuro'];
const NOMBRES = { sistema: 'Tema: sistema', claro: 'Tema: claro', oscuro: 'Tema: oscuro' };

/** Tema elegido ("sistema", "claro" u "oscuro"). */
export function temaElegido() {
  const guardado = localStorage.getItem(CLAVE);
  return OPCIONES.includes(guardado) ? guardado : 'sistema';
}

/** ¿Se está viendo en oscuro ahora mismo? (útil para los gráficos) */
export function esOscuro() {
  const tema = temaElegido();
  if (tema === 'sistema') return matchMedia('(prefers-color-scheme: dark)').matches;
  return tema === 'oscuro';
}

/** Aplica un tema y avisa con el evento "tema-cambiado" (los gráficos lo escuchan). */
export function aplicarTema(tema) {
  if (tema === 'sistema') {
    document.documentElement.removeAttribute('data-tema');
    localStorage.removeItem(CLAVE);
  } else {
    document.documentElement.setAttribute('data-tema', tema);
    localStorage.setItem(CLAVE, tema);
  }
  document.dispatchEvent(new CustomEvent('tema-cambiado'));
}

/**
 * Prepara un botón que pasa por sistema → claro → oscuro.
 * También aplica el tema guardado y escucha si Windows cambia de modo.
 */
export function iniciarTema(boton) {
  aplicarTema(temaElegido());
  const actualizarTexto = () => { boton.textContent = NOMBRES[temaElegido()]; };
  actualizarTexto();

  boton.addEventListener('click', () => {
    const siguiente = OPCIONES[(OPCIONES.indexOf(temaElegido()) + 1) % OPCIONES.length];
    aplicarTema(siguiente);
    actualizarTexto();
  });

  // Si el tema es "sistema" y Windows cambia de claro a oscuro, también hay que avisar.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (temaElegido() === 'sistema') document.dispatchEvent(new CustomEvent('tema-cambiado'));
  });
}
