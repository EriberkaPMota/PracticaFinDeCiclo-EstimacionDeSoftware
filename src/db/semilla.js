'use strict';
// Datos iniciales: métodos, parámetros, usuarios de prueba y un proyecto de ejemplo ya estimado.
const bcrypt = require('bcryptjs');
const crearServicios = require('../servicios');

const CLAVES = { admin: 'Admin2026!', moderador: 'Moderador2026!', experto: 'Experto2026!' };

function sembrar(db) {
  if (db.prepare('SELECT COUNT(*) c FROM usuarios').get().c > 0) return false;
  const hash = (c) => bcrypt.hashSync(c, 10);
  db.transaction(() => {
    const u = db.prepare('INSERT INTO usuarios (nombre, correo, clave_hash, rol, especialidad) VALUES (?, ?, ?, ?, ?)');
    u.run('Administrador', 'admin@uce.edu.do', hash(CLAVES.admin), 'admin', '').lastInsertRowid;
    const mod = u.run('Moderador de prueba', 'moderador@uce.edu.do', hash(CLAVES.moderador), 'moderador', '').lastInsertRowid;
    const exp = [['Ana Beltré', 'ana@uce.edu.do', 'Desarrollo web'], ['Luis Peña', 'luis@uce.edu.do', 'Bases de datos'], ['Marta Rosario', 'marta@uce.edu.do', 'Pruebas de software']]
      .map(([n, c, e]) => u.run(n, c, hash(CLAVES.experto), 'experto', e).lastInsertRowid);

    const cfg = db.prepare('INSERT INTO configuracion (clave, etiqueta, valor) VALUES (?, ?, ?)');
    cfg.run('tarifa_hora', 'Tarifa por hora (RD$)', 350);
    cfg.run('personas', 'Personas en el equipo', 2);
    cfg.run('horas_semana', 'Horas por persona por semana', 15);
    cfg.run('indirectos_semana', 'Costos indirectos por semana (RD$)', 1500);

    const m = db.prepare('INSERT INTO metodos (codigo, nombre, descripcion) VALUES (?, ?, ?)');
    const tp = m.run('tres_puntos', 'Tres Puntos (PERT)', 'Cada experto estima O, M y P por actividad; la herramienta promedia y calcula E y σ.').lastInsertRowid;
    const dl = m.run('delphi', 'Wideband Delphi', 'Rondas anónimas de estimación entre varios expertos hasta lograr consenso, guiadas por un moderador.').lastInsertRowid;
    const p = db.prepare('INSERT INTO parametros_metodo (metodo_id, clave, etiqueta, ayuda, valor, minimo, maximo) VALUES (?, ?, ?, ?, ?, ?, ?)');
    p.run(tp, 'min_expertos', 'Mínimo de expertos', 'Cantidad mínima de expertos para iniciar la estimación.', 1, 1, 50);
    p.run(dl, 'min_expertos', 'Mínimo de expertos', 'Wideband Delphi requiere varios estimadores.', 3, 2, 50);
    p.run(dl, 'max_rondas', 'Máximo de rondas', 'Rondas permitidas antes de cerrar con el consenso disponible.', 3, 1, 10);
    p.run(dl, 'umbral_dispersion', 'Umbral de dispersión (%)', 'Dispersión = (máximo − mínimo) / mediana × 100. Por debajo se considera consenso.', 15, 0, 1000);
    p.run(dl, 'ocultar_valores', 'Ocultar valores individuales (1 = sí)', 'Si es 1, los expertos no ven los valores de los demás.', 1, 0, 1);

    // Proyecto de ejemplo: definición completa
    const proy = db.prepare('INSERT INTO proyectos (nombre, descripcion, problema, cliente, fecha_registro, fecha_requerida, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('Estimador de software UCE',
        'Herramienta web para estimar el esfuerzo, plazo y costo de proyectos de software con Tres Puntos y Wideband Delphi.',
        'Los equipos estiman el esfuerzo de forma informal y sin registro; no hay historial de quién estimó, con qué método ni cuándo, ni forma de comparar estimaciones.',
        'Ing. Francisco José Santana V., MTi (Estimación de Software, UCE)', '2026-10-05', '2026-10-29', mod).lastInsertRowid;
    const mod_ = db.prepare('INSERT INTO modulos (proyecto_id, nombre, descripcion) VALUES (?, ?, ?)');
    const mDoc = mod_.run(proy, 'Documentación', 'Definición del problema, estimación y guía de uso').lastInsertRowid;
    const mDis = mod_.run(proy, 'Diseño', 'Interfaz y base de datos').lastInsertRowid;
    const mDes = mod_.run(proy, 'Desarrollo', 'Módulos de la herramienta').lastInsertRowid;
    const mCal = mod_.run(proy, 'Calidad', 'Pruebas y correcciones').lastInsertRowid;
    const rq = db.prepare('INSERT INTO requisitos (proyecto_id, modulo_id, codigo, tipo, descripcion, prioridad) VALUES (?, ?, ?, ?, ?, ?)');
    [['RF01', mDes, 'El sistema permitirá a los usuarios iniciar sesión con correo y clave.', 'alta'],
      ['RF02', mDes, 'El sistema permitirá al administrador registrar y desactivar usuarios con rol de moderador o experto.', 'alta'],
      ['RF03', mDes, 'El sistema permitirá definir un proyecto con su problema, requisitos, módulos, actividades y fecha requerida por el cliente.', 'alta'],
      ['RF04', mDes, 'El sistema permitirá seleccionar un proyecto definido y aplicarle uno de los métodos de estimación disponibles.', 'alta'],
      ['RF05', mDes, 'El sistema permitirá seleccionar los expertos participantes desde la lista de expertos registrados.', 'alta'],
      ['RF06', mDes, 'El sistema permitirá a cada experto registrar sus valores optimista, más probable y pesimista por actividad.', 'alta'],
      ['RF07', mDes, 'El sistema permitirá al moderador gestionar las rondas de Wideband Delphi y cerrar con el consenso.', 'alta'],
      ['RF08', mDes, 'El sistema calculará el esfuerzo esperado, la desviación estándar, los rangos de confianza, el plazo y el costo.', 'alta'],
      ['RF09', mDes, 'El sistema guardará el historial de estimaciones de cada proyecto con sus estimadores y resultados.', 'alta'],
      ['RF10', mDes, 'El sistema permitirá configurar los parámetros de cada método de estimación.', 'media'],
      ['RF11', mDes, 'El sistema permitirá exportar los resultados de una estimación en formato CSV.', 'baja']]
      .forEach(([c, mo, d, pr]) => rq.run(proy, mo, c, 'funcional', d, pr));
    [['RNF01', 'El sistema guardará las claves cifradas con bcrypt.'], ['RNF02', 'El sistema mostrará los valores individuales de un experto solo al moderador mientras la ronda esté abierta.'],
      ['RNF03', 'El sistema responderá a las consultas habituales en menos de un segundo.'], ['RNF04', 'El sistema podrá usarse desde cualquier navegador actual.']]
      .forEach(([c, d]) => rq.run(proy, null, c, 'no_funcional', d, 'media'));
    const act = db.prepare('INSERT INTO actividades (proyecto_id, modulo_id, nombre, orden) VALUES (?, ?, ?, ?)');
    const tareas = [['Definición y documentación (fase 1)', mDoc, [20, 28, 40]], ['Estimación del proyecto', mDoc, [3, 4, 6]], ['Diseño de la base de datos y de la interfaz', mDis, [14, 20, 32]],
      ['Usuarios, registro, inicio de sesión y roles', mDes, [10, 16, 26]], ['Gestión de proyectos (módulos, requisitos y actividades)', mDes, [10, 14, 22]],
      ['Módulo Tres Puntos', mDes, [12, 18, 28]], ['Módulo Wideband Delphi (rondas y consenso)', mDes, [20, 30, 46]], ['Invitaciones por correo y configuración de Gmail', mDes, [8, 12, 20]],
      ['Historial, resultados y reporte CSV', mDes, [6, 10, 16]], ['Pruebas y correcciones', mCal, [14, 22, 36]], ['Guía de uso y publicación con ngrok', mDoc, [4, 6, 10]],
      ['Preparación de la defensa', mDoc, [4, 6, 10]]];
    const ids = tareas.map(([n, mo], i) => act.run(proy, mo, n, i + 1).lastInsertRowid);

    // Estimación de ejemplo ya cerrada: tres expertos cuyos valores promedian los del caso práctico.
    const S = crearServicios(db);
    const est = S.crear(proy, { metodo_id: tp, titulo: 'Estimación inicial por Tres Puntos', motivo: 'Cada experto aporta su experiencia en su área (desarrollo, bases de datos y pruebas); al promediar sus valores se reduce el sesgo de una sola persona.', unidad: 'horas', tarifa: 350, personas: 2, horas_semana: 15, indirectos: 1500, plazo_semanas: 3, expertos: [] }, exp, { id: mod });
    S.iniciar(est);
    const ronda = db.prepare('SELECT id FROM rondas WHERE estimacion_id = ?').get(est).id;
    const ins = db.prepare('INSERT INTO respuestas (ronda_id, actividad_id, usuario_id, optimista, probable, pesimista) VALUES (?, ?, ?, ?, ?, ?)');
    const desv = [-1, 0, 1];
    exp.forEach((uid, k) => {
      tareas.forEach(([, , [o, mm, pp]], i) => ins.run(ronda, ids[i], uid, o + desv[k], mm + desv[k], pp + desv[k]));
      db.prepare('INSERT INTO envios (ronda_id, usuario_id) VALUES (?, ?)').run(ronda, uid);
    });
    S.cerrarRonda(est, false);
  })();
  return true;
}

module.exports = { sembrar, CLAVES };
