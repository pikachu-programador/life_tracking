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

// La clave es lo que va después de "#/" en la dirección.
const rutas = { hoy, horas, horario, cumplimiento, simulador, clasificacion, diario, ajustes };

iniciarTema(document.getElementById('boton-tema'));
iniciarRouter(rutas, document.getElementById('vista'), 'hoy');

// ── Estado de ActivityWatch ──
// Si AW no responde, se muestra un aviso arriba en vez de dejar el dashboard roto.
// Se revisa al abrir y luego cada 30 s; el aviso se quita solo cuando AW vuelve.
const avisoAW = document.getElementById('aviso-aw');

async function revisarAW() {
  try {
    await aw.info();
    avisoAW.hidden = true;
  } catch (error) {
    avisoAW.textContent = 'ActivityWatch no responde. Revisa que esté abierto (ícono en la bandeja). '
      + 'Los datos se actualizarán cuando vuelva.';
    avisoAW.hidden = false;
    console.warn(error.message);
  }
}

revisarAW();
setInterval(revisarAW, 30_000);
