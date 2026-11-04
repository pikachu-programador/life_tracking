// Tipos y constantes del motor: el CONTRATO entre el motor, el dashboard y el agente (arquitectura §6.7).
//
// Este archivo solo tiene constantes y la forma de los datos escrita con JSDoc (@typedef).
// JSDoc son comentarios con una sintaxis especial: el editor los lee para autocompletar y avisar
// de errores, pero el navegador y Node los ignoran (no cambian cómo corre el código).
//
// Si un módulo necesita otra forma de datos, se cambia primero en docs/arquitectura.md §6.7 y aquí.
//
// Convenciones (§6.7):
// - Instantes: milisegundos desde 1970 en UTC (number). Nombres: inicio, fin, instante.
// - Duraciones: segundos (los nombres terminan en "Seg"), salvo que terminen en "Min".
// - Fechas: texto 'AAAA-MM-DD'. Horas del plan: 'HH:MM' en hora de Lima.

// ── Clases y estados (§7, §10) ──

/** Clases de actividad (primer nivel de las categorías de AW), en el orden en que se muestran. */
export const CLASES = ['estudio', 'ia', 'neutral', 'distraccion', 'sin-clasificar'];

/** Estados sin actividad: PC encendida sin uso, y sin datos (apagada o suspendida). */
export const ESTADOS_SIN_ACTIVIDAD = ['afk', 'sin-pc'];

/** Todo lo que puede ser un segmento (`Estado`). */
export const ESTADOS = [...CLASES, ...ESTADOS_SIN_ACTIVIDAD];

/** Primer nivel de la categoría en AW → clave de la clase. Lo desconocido cuenta como 'sin-clasificar'. */
export const CLASE_DE_AW = {
  'Estudio': 'estudio',
  'Distracción': 'distraccion',
  'Neutral': 'neutral',
  'IA': 'ia',
  'Uncategorized': 'sin-clasificar',
};

/** Nombre visible de cada estado. */
export const NOMBRE_ESTADO = {
  'estudio': 'Estudio',
  'ia': 'IA',
  'neutral': 'Neutral',
  'distraccion': 'Distracción',
  'sin-clasificar': 'Sin clasificar',
  'afk': 'AFK',
  'sin-pc': 'Sin PC',
};

/** Área que se usa cuando una categoría de Estudio no tiene segundo nivel. */
export const SIN_AREA = 'Sin área';

/**
 * Nombres de proceso de cada navegador (copiado de `browser_appname_regex` de aw-webui; solo los de escritorio).
 * La clave es la que aparece en el id del bucket: "aw-watcher-web-<clave>_<host>".
 * (Movido aquí desde web/js/consultas.js para que el motor también lo use; consultas.js lo reexporta.)
 */
export const REGEX_APP_NAVEGADOR = {
  chrome: '(?i)^(google[-_ ]?chrome|chrome|chromium|ungoogled[-_ ]?chromium|arc(\\.exe)?$|dia(\\.exe)?$|helium(\\.exe)?$)',
  firefox: '(?i)(firefox|librewolf|waterfox|nightly)',
  opera: '(?i)(opera)',
  brave: '(?i)(brave)',
  edge: '(?i)^(microsoft[-_ ]?edge|msedge)',
  vivaldi: '(?i)(vivaldi)',
};

// ── Plan (§8) ──

export const DIAS_SEMANA = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
export const NOMBRE_DIA = { lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves', vie: 'Viernes', sab: 'Sábado', dom: 'Domingo' };
export const NIVELES = ['ninguno', 'aviso', 'friccion', 'total'];
export const NOMBRE_NIVEL = { ninguno: 'Ninguno', aviso: 'Aviso', friccion: 'Fricción', total: 'Total' };
export const TIPOS_BLOQUE = ['estudio_pc', 'estudio_papel', 'examen'];
export const NOMBRE_TIPO_BLOQUE = { estudio_pc: 'Estudio en PC', estudio_papel: 'Estudio en papel', examen: 'Examen' };
export const TIPOS_CLASE = ['teoria', 'laboratorio'];
export const MEDICIONES = ['pc', 'checkin', 'dia_logico'];
export const PRIORIDADES = ['alta', 'media', 'baja'];
export const TIPOS_EXCEPCION = ['feriado', 'examenes', 'libre'];
export const EFECTOS_EXCEPCION = ['cancelar_clases_y_bloques', 'subir_bloques_a_total', 'cancelar_bloques'];
/** Colores de curso: nombres de tokens de css/tokens.css (--color-curso-1 … --color-curso-8). */
export const COLORES_CURSO = ['curso-1', 'curso-2', 'curso-3', 'curso-4', 'curso-5', 'curso-6', 'curso-7', 'curso-8'];

// ── Check-ins (§12) ──

export const TIPOS_CHECKIN = ['despertar', 'dormir', 'rutina', 'papel', 'asistencia'];

// ── Cumplimiento (§9) ──

export const ESTADOS_CUMPLIMIENTO = ['cumplido', 'parcial', 'fallido', 'no_medible', 'pendiente', 'en_curso'];
/** Peso de cada estado en el % del día. Los demás estados no entran al cálculo. */
export const PESO_ESTADO = { cumplido: 1, parcial: 0.5, fallido: 0 };
export const CONTEXTOS = ['bloque', 'clase', 'rutina', 'libre'];

// ── Intervenciones (§11) ──

export const ACCIONES = ['permitir', 'aviso', 'friccion', 'bloqueo'];

// ─────────────────────────────────────────────────────────────────────────────
// Formas de los datos (las mismas que docs/arquitectura.md §6.7).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {'estudio'|'ia'|'neutral'|'distraccion'|'sin-clasificar'|'afk'|'sin-pc'} Estado
 */

// ── Datos de AW ──

/**
 * Evento de AW (API, consulta o exportación).
 * @typedef {Object} EventoAW
 * @property {number} [id]
 * @property {string} timestamp   ISO 8601
 * @property {number} duration    segundos
 * @property {Object<string, *>} data
 *   ventana: app, title · web: url, title, audible, incognito, tabCount ·
 *   categorizado: $category (string[]) · web tras split_url_events: $domain, $path…
 */

/**
 * Resultado de la consulta canónica (web/js/consultas.js) para UN día de AW.
 * @typedef {Object} DatosDiaAW
 * @property {EventoAW[]} eventos     ventana ∩ (no AFK ∪ pestañas con audio), con data.$category
 * @property {EventoAW[]} navegador   pestañas mientras el navegador era la ventana activa (url, title, $domain, audible, incognito)
 * @property {EventoAW[]} no_afk      periodos de uso de la PC (data puede venir vacío)
 * @property {EventoAW[]} afk         periodos AFK: PC encendida sin uso (data.status = "afk")
 */

/**
 * Regla del ajuste `classes` de AW (Ajustes → Categorización).
 * @typedef {Object} ReglaAW
 * @property {number} [id]
 * @property {string[]} name   ruta: ['Estudio', 'Programación']
 * @property {{type: ('regex'|'none'|null), regex?: string, ignore_case?: boolean, select_keys?: string[], priority?: number}} rule
 * @property {Object} [data]   color, score… (el motor no los usa)
 */

/**
 * @typedef {Object} ReglaCompilada
 * @property {string[]} categoria
 * @property {RegExp} regex           sin las banderas g ni y (test() no guarda estado)
 * @property {string[]|null} claves   select_keys; null = todos los campos de texto de data
 * @property {number} rango           priority si la tiene; si no, profundidad × 10
 * @property {number} indice          posición en `classes`; en empate de rango gana la mayor
 */

/**
 * @typedef {Object} ReglasCompiladas
 * @property {ReglaCompilada[]} reglas
 * @property {Array<{categoria: string[], regex: string, mensaje: string}>} errores   reglas que no compilan en JS
 */

// ── Segmentos ──

/**
 * Tramo continuo con un solo estado y una sola actividad.
 * Una lista de segmentos de un rango lo cubre entero: ordenada, sin huecos ni solapes.
 * @typedef {Object} Segmento
 * @property {number} inicio
 * @property {number} fin                 > inicio
 * @property {Estado} clase
 * @property {string[]|null} categoria    ruta de AW; null en afk y sin-pc
 * @property {string|null} area           si clase = 'estudio': categoria[1] (o SIN_AREA); si no, null
 * @property {string|null} app
 * @property {string|null} titulo
 * @property {string|null} url            solo en navegadores con datos web
 * @property {string|null} dominio        de la url, sin "www."
 * @property {boolean} audible
 * @property {boolean} incognito
 */

/**
 * Segmento con su lugar en el plan. asignarContexto parte los segmentos en los bordes de
 * bloques, clases y rutinas. Si se superponen: bloque > clase > rutina > libre.
 * @typedef {Segmento & {
 *   contexto: ('bloque'|'clase'|'rutina'|'libre'),
 *   bloqueId: (string|null),
 *   cursoId: (string|null),
 *   claseId: (string|null),
 *   rutinaId: (string|null)
 * }} SegmentoConContexto
 *   bloqueId, claseId y rutinaId son ids del día (BloqueDia.id, ClaseDia.id, RutinaDia.id);
 *   rutinaId solo para rutinas con franja horaria.
 */

// ── Check-ins y día lógico ──

/**
 * Check-in normalizado (bucket rastreador-checkins_<host>, §12).
 * @typedef {Object} Checkin
 * @property {number|null} id      id del evento en AW (para borrarlo)
 * @property {number} instante     cuándo se registró
 * @property {string} fecha        día lógico al que se refiere: data.fecha o, si no está, el día de AW del instante
 * @property {('despertar'|'dormir'|'rutina'|'papel'|'asistencia')} tipo
 * @property {string} refId        rutina: id de la rutina · papel: id del bloque del plan · asistencia: id de la clase del plan
 * @property {string} valor        despertar y dormir: 'HH:MM' · rutina y papel: 'hecho' o 'no_hecho' · asistencia: 'asistio' o 'falto'
 * @property {string} nota
 */

/**
 * @typedef {Object} DiaLogico
 * @property {string} fecha
 * @property {number} inicio
 * @property {number} fin               ≥ inicio, y nunca más de 24 h después del inicio
 * @property {('checkin'|'actividad'|'inicio_dia')} fuenteInicio
 * @property {('checkin'|'actividad'|'ahora'|'inicio_dia'|'sin_datos')} fuenteFin
 * @property {boolean} cerrado          el fin ya no cambia con datos nuevos
 * @property {boolean} sinDatos         ninguna actividad en el día (entonces fin = inicio)
 * @property {number} despiertoSeg      (fin − inicio) / 1000
 */

// ── Plan ──

/**
 * Plan (ajuste rastreador-plan, §8). normalizarPlan completa lo que falte.
 * @typedef {Object} Plan
 * @property {number} version
 * @property {{nombre: string, inicio: string, fin: string}} ciclo
 * @property {Curso[]} cursos
 * @property {ClasePlan[]} clases
 * @property {Rutina[]} rutinas
 * @property {BloquePlan[]} bloques
 * @property {Excepcion[]} excepciones
 * @property {Umbrales} umbrales
 */

/**
 * @typedef {Object} Curso
 * @property {string} id
 * @property {string} nombre
 * @property {string[]} area              ['Estudio', 'Programación']
 * @property {string} color               uno de COLORES_CURSO
 * @property {number} meta_horas_semana
 * @property {('alta'|'media'|'baja')} prioridad
 */

/**
 * @typedef {Object} ClasePlan
 * @property {string} id                  si falta, normalizarPlan pone 'c-<curso>-<dias>-<HHMM>'
 * @property {string} curso
 * @property {('teoria'|'laboratorio')} tipo
 * @property {string[]} dias
 * @property {string} inicio
 * @property {string} fin
 * @property {string} lugar
 * @property {boolean} usa_pc
 */

/**
 * @typedef {Object} Rutina
 * @property {string} id
 * @property {string} nombre
 * @property {string[]} dias
 * @property {string} [inicio]            sin inicio ni fin: cuenta en todo el día lógico
 * @property {string} [fin]
 * @property {('pc'|'checkin'|'dia_logico')} medicion
 * @property {('despertar'|'dormir')} [evento]   solo en dia_logico; si falta, se deduce del id o del nombre
 * @property {string[]} [categoria]       solo en pc
 * @property {number} [minutos_meta]      solo en pc
 * @property {number} tolerancia_min
 */

/**
 * @typedef {Object} BloquePlan
 * @property {string} id
 * @property {('estudio_pc'|'estudio_papel'|'examen')} tipo
 * @property {string} curso
 * @property {({tipo: 'semanal', dias: string[]}|{tipo: 'unica', fecha: string})} repeticion
 * @property {string} inicio
 * @property {string} fin                 si fin < inicio, el bloque cruza la medianoche
 * @property {('ninguno'|'aviso'|'friccion'|'total')} nivel
 * @property {string} objetivo
 * @property {string} por_que
 * @property {Array<{fecha: string, fin: string, motivo: string}>} [terminados_antes]
 */

/**
 * @typedef {Object} Excepcion
 * @property {string} desde
 * @property {string} hasta
 * @property {('feriado'|'examenes'|'libre')} tipo
 * @property {('cancelar_clases_y_bloques'|'subir_bloques_a_total'|'cancelar_bloques')} efecto
 * @property {string} [nota]
 */

/**
 * @typedef {Object} Umbrales
 * @property {number} tolerancia_inicio_min       10
 * @property {number} foco_cumplido                0.7
 * @property {number} foco_parcial                 0.4
 * @property {number} dia_cumplido                 0.8
 * @property {number} hueco_sueno_h                3
 * @property {number} peso_despertar_dormir_min    30
 */

/**
 * Lo planificado para un día lógico (expandirDia). Las horas ya son instantes.
 * @typedef {Object} ItemsDelDia
 * @property {string} fecha
 * @property {boolean} enCiclo
 * @property {Excepcion[]} excepciones    las que cubren la fecha
 * @property {BloqueDia[]} bloques        ordenados por inicio
 * @property {ClaseDia[]} clases
 * @property {RutinaDia[]} rutinas
 */

/**
 * @typedef {Object} BloqueDia
 * @property {string} id                  '<bloqueId>@<fecha>'
 * @property {string} bloqueId
 * @property {string} tipo
 * @property {string} curso
 * @property {number} inicio
 * @property {number} fin                 el real si terminó antes; si no, el planificado
 * @property {number} finPlan
 * @property {string} nivel               el del plan, con el efecto de las excepciones
 * @property {boolean} subidoPorExcepcion una excepción lo subió a total (gana sobre cualquier cambio de nivel)
 * @property {string} objetivo
 * @property {string} porQue
 * @property {{fin: number, motivo: string}|null} terminadoAntes
 */

/**
 * @typedef {Object} ClaseDia
 * @property {string} id                  '<claseId>@<fecha>'
 * @property {string} claseId
 * @property {string} curso
 * @property {string} tipo
 * @property {number} inicio
 * @property {number} fin
 * @property {string} lugar
 * @property {boolean} usaPc
 */

/**
 * @typedef {Object} RutinaDia
 * @property {string} id                  '<rutinaId>@<fecha>'
 * @property {string} rutinaId
 * @property {string} nombre
 * @property {('pc'|'checkin'|'dia_logico')} medicion
 * @property {('despertar'|'dormir'|null)} evento
 * @property {number|null} inicio         null = sin franja (todo el día lógico); en dia_logico, la hora objetivo
 * @property {number|null} fin
 * @property {string[]|null} categoria
 * @property {number|null} minutosMeta
 * @property {number} toleranciaMin
 */

// ── Cumplimiento ──

/**
 * @typedef {('cumplido'|'parcial'|'fallido'|'no_medible'|'pendiente'|'en_curso')} EstadoCumplimiento
 *   pendiente = todavía no empieza o le falta el check-in (solo hoy); en_curso = ocurre ahora.
 *   Solo cumplido (1), parcial (0,5) y fallido (0) entran al % (§9).
 */

/**
 * @typedef {Object} EstadoBloque
 * @property {string} id                  id del BloqueDia
 * @property {string} bloqueId
 * @property {string} tipo
 * @property {string} curso
 * @property {number} inicio
 * @property {number} fin
 * @property {number} duracionPlanSeg
 * @property {EstadoCumplimiento} estado
 * @property {number|null} foco           Estudio ÷ duración planificada (0 a 1); null en papel
 * @property {number} estudioSeg
 * @property {number} iaSeg
 * @property {number} distraccionSeg
 * @property {number|null} retrasoMin     del inicio al primer Estudio dentro del bloque (≥ 0); null si no hubo
 * @property {boolean} salidaEmergencia
 * @property {string|null} checkin        valor del check-in (papel)
 * @property {string} motivo              por qué tiene ese estado, en una frase
 */

/**
 * @typedef {Object} EstadoRutina
 * @property {string} id                  id de la RutinaDia
 * @property {string} rutinaId
 * @property {string} nombre
 * @property {string} medicion
 * @property {EstadoCumplimiento} estado
 * @property {number} pesoSeg             peso en el %: pc = minutos_meta; checkin = su franja (o 30 min); dia_logico = peso_despertar_dormir_min
 * @property {number|null} logradoSeg     pc: tiempo de la categoría en su ventana
 * @property {number|null} metaSeg
 * @property {number|null} horaReal       dia_logico: inicio o fin del día lógico
 * @property {number|null} horaObjetivo
 * @property {string} motivo
 */

/**
 * @typedef {Object} PorcentajeDia
 * @property {number|null} porcentaje     0 a 1; null si no hay nada medible
 * @property {boolean|null} cumplido      porcentaje ≥ umbrales.dia_cumplido
 * @property {number} pesoSeg             Σ duración planificada (o peso) de lo medible
 * @property {number} medibles
 */

// ── Resúmenes (visualizaciones §1 y §3) ──

/**
 * Todas las métricas de un día lógico. Tiempos en segundos.
 * @typedef {Object} ResumenDia
 * @property {string} fecha
 * @property {DiaLogico} dia
 * @property {boolean} sinDatos
 * @property {number} despiertoSeg
 * @property {number} activoSeg                   suma de las 5 clases de actividad
 * @property {Object<string, number>} porEstado   las 7 claves de ESTADOS; suman despiertoSeg
 * @property {Object<string, number>} porArea     Estudio por área
 * @property {Object<string, number>} porCategoria   ruta unida con ' > ' ('Distracción > Video') → seg; solo actividad
 * @property {Object<string, {bloquesSeg: number, papelSeg: number}>} porCurso   todos los cursos del plan
 * @property {number} clasesSeg                   tiempo en clases (V-03)
 * @property {number} papelSeg                    bloques estudio_papel con check-in "hecho"
 * @property {number} estudioTotalSeg             porEstado.estudio + papelSeg
 * @property {Array<{estados: Object<string, number>, areas: Object<string, number>, cursos: Object<string, number>}>} porHora
 *   24 entradas por hora local (0 a 23); ninguna suma más de 3600
 * @property {string[]} tramos                    96 tramos de 15 min por hora local: 'clase' o el Estado dominante;
 *                                                fuera del día lógico, 'sin-pc'
 * @property {string[]} tramosPlan                96 tramos: 'bloque', 'clase', 'rutina' o 'libre'
 * @property {number} cambiosApp
 * @property {number|null} cambiosPorHora         cambios de app por hora activa
 * @property {{inicio: number, fin: number, seg: number}|null} focoMasLargo   Estudio continuo (tolera cortes < 2 min)
 * @property {EstadoBloque[]} bloques
 * @property {EstadoRutina[]} rutinas
 * @property {PorcentajeDia} cumplimiento
 * @property {number|null} retrasoMedioMin
 * @property {Object<string, number>} porApp
 * @property {Object<string, number>} porDominio
 */

/**
 * @typedef {Object} Estadistico
 * @property {number} total
 * @property {number|null} promedio            por día con datos
 * @property {number|null} promedioConVacios   los días sin datos cuentan como 0
 * @property {number|null} mediana             días con datos
 * @property {{valor: number, fecha: string}|null} max
 * @property {{valor: number, fecha: string}|null} min
 * @property {number|null} desviacion          desviación estándar poblacional, días con datos
 */

/**
 * @typedef {Object} Racha
 * @property {number} actual   días seguidos que terminan en `hasta` (los días sin nada medible no cortan ni suman)
 * @property {number} mejor
 */

/**
 * @typedef {Object} ComparacionPeriodo
 * @property {string} desde    período anterior del mismo largo
 * @property {string} hasta
 * @property {Object<string, {actual: (number|null), anterior: (number|null), diferencia: (number|null)}>} metricas
 *   métricas de tipo 'suma' comparan totales; las de tipo 'promedio', promedios
 */

/**
 * @typedef {Object} ResumenPeriodo
 * @property {string} desde
 * @property {string} hasta
 * @property {number} dias
 * @property {number} diasConDatos
 * @property {string[]} fechasSinDatos
 * @property {Object<string, Estadistico>} metricas     una por clave de METRICAS
 * @property {{porEstado: Object<string, number>, porArea: Object<string, number>, porCurso: Object<string, {bloquesSeg: number, papelSeg: number}>,
 *            porCategoria: Object<string, number>, porApp: Object<string, number>, porDominio: Object<string, number>,
 *            clasesSeg: number, papelSeg: number}} totales
 * @property {Object<string, Object<string, (number|null)>>} porDiaSemana   'lun' → clave de METRICAS → promedio
 * @property {{diaCumplido: Racha, rutinas: Object<string, Racha>}} rachas
 * @property {PorcentajeDia} cumplimiento        la fórmula del día con todos los días del período
 * @property {ComparacionPeriodo|null} comparacion
 */

// ── Niveles e intervenciones (§11) ──

/**
 * Ajuste rastreador-niveles. Lo vigente se calcula: base + cambios con aplica_desde ≤ fecha.
 * @typedef {Object} Niveles
 * @property {number} version
 * @property {ConfigNiveles} base
 * @property {Array<{aplica_desde: string, creado: string, ruta: string, valor: *}>} cambios
 *   ruta con puntos: 'friccion.comodines_semana', 'bloques.b-bd1-lun', 'patrones_url'
 */

/**
 * @typedef {Object} ConfigNiveles
 * @property {{permiso_min: number}} aviso
 * @property {{espera_s: number, pase_min: number, comodines_semana: number}} friccion
 * @property {{espera_salida_min: number, frase_salida: string, bloquear_sin_clasificar: boolean}} total
 * @property {{avisos_para_friccion: number}} escalamiento
 * @property {string[]} patrones_url      regex extra que se bloquean en todos los niveles
 * @property {string[]} nunca_bloquear    regex de apps o URLs que nunca se bloquean
 * @property {Object<string, string>} bloques   id del bloque del plan → nivel elegido (manda sobre el del plan)
 */

/**
 * Lo que el Decisor evalúa en un momento.
 * @typedef {Object} Actividad
 * @property {string|null} app
 * @property {string|null} titulo
 * @property {string|null} url
 * @property {string[]|null} categoria
 */

/**
 * @typedef {Object} EstadoIntervencion
 * @property {Array<{objetivo: string, hasta: number, tipo: ('permiso'|'pase')}>} pases
 * @property {Object<string, number>} avisos       id del BloqueDia (o ClaseDia) → avisos dados
 * @property {Object<string, boolean>} escalados   id del BloqueDia → ya subió a fricción
 * @property {number} comodines                    los que quedan esta semana
 * @property {{objetivo: string, accion: string, itemId: (string|null)}|null} ultima   intervención en curso (no se repite)
 */

/**
 * @typedef {Object} EntradaDecisor
 * @property {Actividad} actividad
 * @property {BloqueDia|null} bloque     bloque activo en `ahora`
 * @property {ClaseDia|null} clase       clase activa (solo cuenta si usaPc)
 * @property {ConfigNiveles} config      configuración vigente
 * @property {EstadoIntervencion} estado
 * @property {number} ahora
 */

/**
 * @typedef {Object} Decision
 * @property {('permitir'|'aviso'|'friccion'|'bloqueo')} accion
 * @property {string} nivel        nivel efectivo, ya escalado
 * @property {string} objetivo     'web:<dominio>' o 'app:<app>'
 * @property {string} motivo       'fuera_de_bloque' | 'nivel_ninguno' | 'protegido' | 'ia' | 'nunca_bloquear' |
 *                                 'pase_vigente' | 'no_bloqueable' | 'distraccion' | 'patron_url' | 'sin_clasificar'
 */

/**
 * Lo que se guarda en rastreador-intervenciones (§12).
 * @typedef {Object} Intervencion
 * @property {number} instante
 * @property {string|null} bloqueId     id del BloqueDia
 * @property {string|null} claseId      id de la ClaseDia
 * @property {string} nivel
 * @property {('aviso'|'friccion'|'bloqueo'|'pase'|'escalamiento'|'salida_emergencia')} accion
 * @property {string} objetivo
 * @property {string|null} app
 * @property {string|null} url
 * @property {string|null} titulo
 * @property {string} motivo
 */

/**
 * Cómo reacciona la persona simulada.
 * @typedef {Object} PoliticaSimulada
 * @property {boolean} continuarAviso   tras un aviso pulsa "continuar" (permiso de aviso.permiso_min)
 * @property {boolean} usarPases        en fricción usa un pase si quedan comodines
 */

/**
 * @typedef {Object} ResultadoSimulacion
 * @property {string} nivel                     'plan' o el nivel forzado
 * @property {Intervencion[]} intervenciones
 * @property {Array<{inicio: number, fin: number, itemId: (string|null), objetivo: string}>} cortes   tiempo que se habría impedido
 * @property {number} cortadoSeg
 * @property {Object<string, {avisos: number, fricciones: number, bloqueos: number, pases: number, escalo: boolean, cortadoSeg: number}>} porItem
 *   por id de BloqueDia o ClaseDia
 * @property {{avisos: number, fricciones: number, bloqueos: number, pases: number, comodinesUsados: number, cortadoSeg: number}} totales
 */

// ── Dashboard (web/js/datos.js, F2-09) ──

/**
 * Todo lo de un día lógico, listo para las vistas.
 * @typedef {Object} DiaCompleto
 * @property {string} fecha
 * @property {boolean} esHoy
 * @property {DiaLogico} dia
 * @property {SegmentoConContexto[]} segmentos   del día lógico
 * @property {ItemsDelDia} items
 * @property {ResumenDia} resumen
 * @property {Checkin[]} checkins                del día
 * @property {Plan} plan
 * @property {ConfigNiveles} config              vigente ese día
 */
