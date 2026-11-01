// Almacén de días del dashboard: une el cliente de AW, la consulta canónica y la caché.
// Todas las vistas piden los datos aquí, así comparten la misma caché.
import { aw } from './aw.js';
import { eventosCategorizados } from './consultas.js';
import { crearAlmacenDias } from './datos-dia.js';

export const almacen = crearAlmacenDias({
  pedirPeriodos: (periodos) => eventosCategorizados(aw, periodos),
  // Hora en que empieza el día según AW (Ajustes → "Start of day"); si no se puede leer, 04:00.
  inicioDia: async () => {
    try {
      return (await aw.ajuste('startOfDay')) ?? '04:00';
    } catch {
      return '04:00';
    }
  },
});
