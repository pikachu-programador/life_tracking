// Punto de entrada del dashboard: registra las vistas y arranca el router.
import { iniciarRouter } from './router.js';
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

iniciarRouter(rutas, document.getElementById('vista'), 'hoy');
