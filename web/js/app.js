// Punto de entrada del dashboard: registra las vistas y arranca el router.
import { iniciarRouter } from './router.js';
import { iniciarTema } from './tema.js';
import { aw } from './aw.js';
import * as hoy from './vistas/hoy.js';
import * as horas from './vistas/horas.js';
import * as horario from './vistas/horario.js';
import * as cumplimiento from './vistas/cumplimiento.js';
import * as simulador from './vistas/simulador.js';
import * as clasificacion from './vistas/clasificacion.js';
import * as diario from './vistas/diario.js';
import * as ajustes from './vistas/ajustes.js';
import * as resumen from './vistas/resumen.js';
import * as tipico from './vistas/tipico.js';
import * as comparar from './vistas/comparar.js';
import * as explorador from './vistas/explorador.js';
import { reloj } from './reloj.js';
import { horaLocal, fechaCorta, fechaLocal } from './fechas.js';

// La clave es lo que va después de "#/" en la dirección.
const rutas = {
  hoy, horas, horario, cumplimiento, simulador, clasificacion, diario, ajustes,
  resumen, tipico, comparar, explorador, // V-05, V-06, V-09 y V-08
};

iniciarTema(document.getElementById('boton-tema'));
iniciarRouter(rutas, document.getElementById('vista'), 'hoy');

// ── Estado de ActivityWatch ──
// Si AW no responde, se muestra un aviso arriba en vez de dejar el dashboard roto.
// Se revisa al abrir y luego cada 30 s; el aviso se quita solo cuando AW vuelve.
const avisoAW = document.getElementById('aviso-aw');
// V-11: además del aviso, el pie del menú muestra el estado (punto de color + texto).
const estadoAW = document.getElementById('estado-aw');

async function revisarAW() {
  try {
    const info = await aw.info();
    avisoAW.hidden = true;
    estadoAW.dataset.estado = 'conectado';
    estadoAW.querySelector('.estado-aw-texto').textContent = `AW ${info.version} · ${info.hostname}`;
  } catch (error) {
    avisoAW.textContent = 'ActivityWatch no responde. Revisa que esté abierto (ícono en la bandeja). '
      + 'Los datos se actualizarán cuando vuelva.';
    avisoAW.hidden = false;
    estadoAW.dataset.estado = 'sin-conexion';
    estadoAW.querySelector('.estado-aw-texto').textContent = 'AW sin conexión';
    console.warn(error.message);
  }
}

revisarAW();
setInterval(revisarAW, 30_000);

// ── Reloj de prueba (H-02) ──
// Con ?ahora= en la dirección, el pie del menú lo recuerda: los datos no son de la hora real.
if (reloj.dePrueba) {
  const etiqueta = document.getElementById('reloj-prueba');
  const mostrar = () => {
    const t = reloj.ahora();
    etiqueta.textContent = `Reloj de prueba: ${fechaCorta(fechaLocal(t))}, ${horaLocal(t)}`;
  };
  mostrar();
  etiqueta.hidden = false;
  setInterval(mostrar, 15_000);
}
