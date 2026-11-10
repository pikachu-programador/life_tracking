// Botones "Exportar" e "Importar" del plan (F3-02). Los usan Horario y Ajustes.
// La lógica pura (armar y leer el JSON) está en js/respaldo.js; aquí van los diálogos.

import { el } from '../dom.js';
import { datos } from '../datos.js';
import { reloj } from '../reloj.js';
import { abrirDialogo } from './ui.js';
import { textoDeRespaldo, leerRespaldo, nombreDeRespaldo, descargarTexto, elegirArchivo } from '../respaldo.js';
import { NIVELES_INICIALES } from '../../motor/niveles.js';

/** "7 cursos, 8 clases, 5 rutinas, 9 bloques y 1 excepción". */
export function resumenDePlan(plan) {
  const partes = [
    [plan.cursos.length, 'curso', 'cursos'], [plan.clases.length, 'clase', 'clases'], [plan.rutinas.length, 'rutina', 'rutinas'],
    [plan.bloques.length, 'bloque', 'bloques'], [plan.excepciones.length, 'excepción', 'excepciones'],
  ].map(([n, uno, varios]) => `${n} ${n === 1 ? uno : varios}`);
  return `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`;
}

/** Descarga el plan y los niveles en un archivo JSON. */
export async function exportarRespaldo() {
  const [plan, niveles] = await Promise.all([datos.plan(), datos.niveles()]);
  const ahora = reloj.ahora();
  descargarTexto(nombreDeRespaldo(ahora), textoDeRespaldo({ plan, niveles, ahora }));
}

/**
 * Elige un archivo, lo valida, pide confirmación y reemplaza el plan.
 * Los niveles del respaldo solo se restauran si aquí todavía no se tocaron (siguen siendo los iniciales):
 * importar un archivo no debe servir para aflojar los niveles en el acto (asimetría de §11).
 * @returns {Promise<{importado: boolean, mensaje: string}>}
 */
export async function importarRespaldo() {
  const archivo = await elegirArchivo();
  if (!archivo) return { importado: false, mensaje: '' };

  let leido;
  try {
    leido = leerRespaldo(archivo.texto, { inicioDia: await datos.inicioDia() });
  } catch (error) {
    await abrirDialogo({ titulo: 'No se pudo importar', contenido: error.message, acciones: [{ valor: 'cerrar', texto: 'Cerrar' }] });
    return { importado: false, mensaje: '' };
  }
  if (!leido.valido) {
    const mostrados = leido.errores.slice(0, 8);
    await abrirDialogo({
      titulo: 'El plan del archivo tiene errores',
      contenido: [
        el('p', {}, `No se importó nada. Corrige el archivo "${archivo.nombre}" y vuelve a intentar:`),
        el('ul', { class: 'lista-errores' }, mostrados.map((e) => el('li', {}, e.mensaje))),
        leido.errores.length > mostrados.length && el('p', {}, `…y ${leido.errores.length - mostrados.length} más.`),
      ],
      acciones: [{ valor: 'cerrar', texto: 'Cerrar' }],
    });
    return { importado: false, mensaje: '' };
  }

  const actual = await datos.plan();
  const respuesta = await abrirDialogo({
    titulo: '¿Reemplazar el plan actual?',
    contenido: [
      el('p', {}, `Plan actual: ${resumenDePlan(actual)}.`),
      el('p', {}, `Plan del archivo "${archivo.nombre}": ${resumenDePlan(leido.plan)}.`),
      el('p', {}, 'El plan actual se pierde (expórtalo antes si quieres conservarlo).'),
    ],
    acciones: [{ valor: 'cancelar', texto: 'Cancelar' }, { valor: 'reemplazar', texto: 'Reemplazar el plan', tipo: 'peligro' }],
  });
  if (respuesta !== 'reemplazar') return { importado: false, mensaje: '' };

  await datos.guardarPlan(leido.plan);
  let mensaje = `Plan importado: ${resumenDePlan(leido.plan)}.`;
  if (leido.niveles) {
    const sinTocar = JSON.stringify(await datos.niveles()) === JSON.stringify(NIVELES_INICIALES);
    if (sinTocar) {
      await datos.guardarNiveles(leido.niveles);
      mensaje += ' También se restauraron los niveles del respaldo.';
    } else {
      mensaje += ' Los niveles del respaldo no se importaron porque ya tienes niveles configurados (se cambian en Ajustes).';
    }
  }
  return { importado: true, mensaje };
}
