// Vista "Horario" (arquitectura §13). Editor del plan y planificador semanal.
// F3-02: lee el plan del ajuste `rastreador-plan` de AW y permite exportarlo e importarlo en JSON.
// El editor llega con F3-04 y el planificador semanal con F3-05.

import { el, reemplazar } from '../dom.js';
import { datos } from '../datos.js';
import { crearCabecera, textoDeError } from '../componentes/vista.js';
import { crearTarjeta, crearCargando, crearError, crearAviso, crearTabla } from '../componentes/ui.js';
import { exportarRespaldo, importarRespaldo, resumenDePlan } from '../componentes/respaldo.js';

export const titulo = 'Horario';

/** Dibuja la vista dentro de `contenedor`. */
export function render(contenedor) {
  const mensajes = el('div', { class: 'vista-mensajes' });
  const cuerpo = el('div', { class: 'vista-cuerpo' }, crearCargando({ filas: 4 }));

  const botonExportar = el('button', { class: 'boton', type: 'button', onclick: () => exportarRespaldo().catch(mostrarError) }, 'Exportar');
  const botonImportar = el('button', {
    class: 'boton', type: 'button',
    onclick: async () => {
      try {
        const { importado, mensaje } = await importarRespaldo();
        if (importado) { reemplazar(mensajes, crearAviso('exito', mensaje)); await cargar(); }
      } catch (error) { mostrarError(error); }
    },
  }, 'Importar');
  const cabecera = crearCabecera({ titulo, acciones: [botonExportar, botonImportar] });
  contenedor.append(cabecera, mensajes, cuerpo);

  function mostrarError(error) {
    reemplazar(mensajes, crearAviso('error', textoDeError(error)));
  }

  async function cargar() {
    try {
      const plan = await datos.plan();
      cabecera.subtitulo.textContent = plan.ciclo.nombre
        ? `Ciclo ${plan.ciclo.nombre} · ${plan.ciclo.inicio} a ${plan.ciclo.fin}` : 'Todavía no hay un ciclo definido';
      reemplazar(cuerpo, crearTarjeta({
        titulo: 'Plan guardado en ActivityWatch',
        subtitulo: resumenDePlan(plan),
        contenido: crearTabla({
          columnas: [{ clave: 'que', titulo: 'Parte del plan' }, { clave: 'cuantos', titulo: 'Cantidad', numerica: true }],
          filas: ['cursos', 'clases', 'rutinas', 'bloques', 'excepciones'].map((lista) => ({ que: lista[0].toUpperCase() + lista.slice(1), cuantos: plan[lista].length })),
        }),
        pie: 'El plan vive en el ajuste "rastreador-plan" de AW. Exportar guarda una copia en un archivo JSON; Importar la restaura.',
      }));
    } catch (error) {
      reemplazar(cuerpo, crearError(textoDeError(error), { reintentar: cargar }));
    }
  }
  cargar();
}
