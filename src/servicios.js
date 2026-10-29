'use strict';
// Lógica de negocio de las estimaciones. Las rutas llaman a estas funciones; no hay SQL en las rutas de estimación.
const C = require('./calculos');

class ErrorApp extends Error {
  constructor(estado, mensaje) { super(mensaje); this.estado = estado; }
}
const falla = (estado, mensaje) => { throw new ErrorApp(estado, mensaje); };

module.exports = function crearServicios(db) {
  const esStaff = (u) => u.rol === 'admin' || u.rol === 'moderador';

  function parametro(metodoId, clave, defecto) {
    const r = db.prepare('SELECT valor FROM parametros_metodo WHERE metodo_id = ? AND clave = ?').get(metodoId, clave);
    return r ? r.valor : defecto;
  }

  function cargar(id) {
    const e = db.prepare(`SELECT e.*, m.codigo AS metodo_codigo, m.nombre AS metodo_nombre
                          FROM estimaciones e JOIN metodos m ON m.id = e.metodo_id WHERE e.id = ?`).get(id);
    if (!e) falla(404, 'La estimación no existe.');
    return e;
  }
  function rondaActual(estId) {
    return db.prepare('SELECT * FROM rondas WHERE estimacion_id = ? ORDER BY numero DESC LIMIT 1').get(estId) || null;
  }
  function actividades(proyectoId) {
    return db.prepare(`SELECT a.id, a.nombre, a.descripcion, a.orden, a.modulo_id, m.nombre AS modulo
                       FROM actividades a LEFT JOIN modulos m ON m.id = a.modulo_id
                       WHERE a.proyecto_id = ? ORDER BY a.orden, a.id`).all(proyectoId);
  }
  function expertosDe(estId) {
    return db.prepare(`SELECT u.id, u.nombre, u.correo, u.especialidad FROM estimacion_expertos x
                       JOIN usuarios u ON u.id = x.usuario_id WHERE x.estimacion_id = ? ORDER BY u.nombre`).all(estId);
  }
  function esInvitado(estId, userId) {
    return !!db.prepare('SELECT 1 FROM estimacion_expertos WHERE estimacion_id = ? AND usuario_id = ?').get(estId, userId);
  }
  function enviosDe(rondaId) {
    return db.prepare('SELECT usuario_id, enviado FROM envios WHERE ronda_id = ?').all(rondaId);
  }

  // ---------- permisos ----------
  function verificarAcceso(est, user) {
    if (esStaff(user)) return;
    if (!esInvitado(est.id, user.id)) falla(403, 'No participas en esta estimación.');
  }

  // ---------- crear / iniciar ----------
  const crear = db.transaction((proyectoId, datos, expertosIds, moderador) => {
    const proy = db.prepare('SELECT id FROM proyectos WHERE id = ?').get(proyectoId);
    if (!proy) falla(404, 'El proyecto no existe.');
    const met = db.prepare('SELECT * FROM metodos WHERE id = ? AND activo = 1').get(datos.metodo_id);
    if (!met) falla(400, 'El método no existe o está desactivado.');
    const info = db.prepare(`INSERT INTO estimaciones (proyecto_id, metodo_id, titulo, motivo, unidad, tarifa, personas, horas_semana,
        indirectos, plazo_semanas, max_rondas, umbral_dispersion, ocultar_valores, moderador_id)
        VALUES (@proyecto_id, @metodo_id, @titulo, @motivo, @unidad, @tarifa, @personas, @horas_semana, @indirectos, @plazo_semanas,
                @max_rondas, @umbral_dispersion, @ocultar_valores, @moderador_id)`).run({
      proyecto_id: proyectoId, metodo_id: met.id, titulo: datos.titulo, motivo: datos.motivo || '', unidad: datos.unidad, tarifa: datos.tarifa,
      personas: datos.personas, horas_semana: datos.horas_semana, indirectos: datos.indirectos, plazo_semanas: datos.plazo_semanas,
      max_rondas: met.codigo === 'delphi' ? datos.max_rondas ?? parametro(met.id, 'max_rondas', 3) : 1,
      umbral_dispersion: datos.umbral_dispersion ?? parametro(met.id, 'umbral_dispersion', 15),
      ocultar_valores: datos.ocultar_valores ?? parametro(met.id, 'ocultar_valores', 1),
      moderador_id: moderador.id,
    });
    asignarExpertos(info.lastInsertRowid, expertosIds);
    return info.lastInsertRowid;
  });

  function asignarExpertos(estId, ids) {
    const ins = db.prepare('INSERT OR IGNORE INTO estimacion_expertos (estimacion_id, usuario_id) VALUES (?, ?)');
    db.prepare('DELETE FROM estimacion_expertos WHERE estimacion_id = ?').run(estId);
    for (const uid of [...new Set(ids)]) {
      const u = db.prepare("SELECT id FROM usuarios WHERE id = ? AND activo = 1 AND rol = 'experto'").get(uid);
      if (!u) falla(400, 'Solo se pueden seleccionar expertos activos de la lista.');
      ins.run(estId, uid);
    }
  }

  const iniciar = db.transaction((id) => {
    const e = cargar(id);
    if (e.estado !== 'borrador') falla(409, 'Esta estimación ya fue iniciada.');
    const min = parametro(e.metodo_id, 'min_expertos', 1);
    const n = db.prepare('SELECT COUNT(*) c FROM estimacion_expertos WHERE estimacion_id = ?').get(id).c;
    if (n < min) falla(400, `El método requiere al menos ${min} experto(s); hay ${n} seleccionado(s).`);
    if (!actividades(e.proyecto_id).length) falla(400, 'El proyecto no tiene actividades definidas para estimar.');
    db.prepare("UPDATE estimaciones SET estado = 'en_curso', iniciada = datetime('now') WHERE id = ?").run(id);
    db.prepare('INSERT INTO rondas (estimacion_id, numero) VALUES (?, 1)').run(id);
  });

  // ---------- respuestas ----------
  function validarItem(e, it) {
    if (e.metodo_codigo === 'tres_puntos') {
      if (!C.tripleValida(it.optimista, it.probable, it.pesimista)) falla(400, 'En cada actividad debe cumplirse 0 ≤ optimista ≤ más probable ≤ pesimista.');
    } else if (!(typeof it.valor === 'number' && Number.isFinite(it.valor) && it.valor >= 0)) falla(400, 'El valor estimado debe ser un número mayor o igual que cero.');
  }

  const guardarRespuestas = db.transaction((id, user, items) => {
    const e = cargar(id);
    if (e.estado !== 'en_curso') falla(409, 'La estimación no está en curso.');
    if (!esInvitado(id, user.id)) falla(403, 'No participas en esta estimación.');
    const r = rondaActual(id);
    if (!r || r.estado !== 'abierta') falla(409, 'No hay una ronda abierta.');
    if (db.prepare('SELECT 1 FROM envios WHERE ronda_id = ? AND usuario_id = ?').get(r.id, user.id)) falla(409, 'Ya enviaste tus valores en esta ronda.');
    const ids = new Set(actividades(e.proyecto_id).map((a) => a.id));
    const up = db.prepare(`INSERT INTO respuestas (ronda_id, actividad_id, usuario_id, optimista, probable, pesimista, valor, comentario)
        VALUES (@r, @a, @u, @o, @m, @p, @v, @c)
        ON CONFLICT (ronda_id, actividad_id, usuario_id) DO UPDATE SET optimista = @o, probable = @m, pesimista = @p, valor = @v, comentario = @c`);
    const del = db.prepare('DELETE FROM respuestas WHERE ronda_id = ? AND actividad_id = ? AND usuario_id = ?');
    for (const it of items) {
      if (!ids.has(it.actividad_id)) falla(400, 'Una actividad no pertenece al proyecto.');
      const vacio = e.metodo_codigo === 'tres_puntos' ? [it.optimista, it.probable, it.pesimista].every((x) => x == null) : it.valor == null;
      if (vacio) { del.run(r.id, it.actividad_id, user.id); continue; }
      validarItem(e, it);
      up.run({ r: r.id, a: it.actividad_id, u: user.id, o: it.optimista ?? null, m: it.probable ?? null, p: it.pesimista ?? null, v: it.valor ?? null, c: (it.comentario || '').slice(0, 300) });
    }
  });

  const enviar = db.transaction((id, user) => {
    const e = cargar(id);
    if (e.estado !== 'en_curso') falla(409, 'La estimación no está en curso.');
    if (!esInvitado(id, user.id)) falla(403, 'No participas en esta estimación.');
    const r = rondaActual(id);
    if (!r || r.estado !== 'abierta') falla(409, 'No hay una ronda abierta.');
    if (db.prepare('SELECT 1 FROM envios WHERE ronda_id = ? AND usuario_id = ?').get(r.id, user.id)) falla(409, 'Ya enviaste tus valores en esta ronda.');
    const total = actividades(e.proyecto_id).length;
    const hechas = db.prepare('SELECT COUNT(*) c FROM respuestas WHERE ronda_id = ? AND usuario_id = ?').get(r.id, user.id).c;
    if (hechas < total) falla(400, `Faltan actividades por estimar (${hechas} de ${total}).`);
    db.prepare('INSERT INTO envios (ronda_id, usuario_id) VALUES (?, ?)').run(r.id, user.id);
  });

  // ---------- rondas ----------
  function respuestasEnviadas(rondaId) {
    return db.prepare(`SELECT r.* FROM respuestas r JOIN envios v ON v.ronda_id = r.ronda_id AND v.usuario_id = r.usuario_id
                       WHERE r.ronda_id = ?`).all(rondaId);
  }

  function estadisticasRonda(e, rondaId) {
    const acts = actividades(e.proyecto_id);
    const resp = respuestasEnviadas(rondaId);
    const out = {};
    for (const a of acts) {
      const rs = resp.filter((x) => x.actividad_id === a.id);
      if (!rs.length) { out[a.id] = null; continue; }
      if (e.metodo_codigo === 'delphi') {
        const s = C.estadisticasDelphi(rs.map((x) => x.valor));
        out[a.id] = { ...s, dispersion: C.redondear(s.dispersion, 1), consenso: s.dispersion != null && s.dispersion <= e.umbral_dispersion };
      } else {
        const c = C.consensoTresPuntos(rs);
        out[a.id] = { n: c.n, optimista: C.redondear(c.optimista), probable: C.redondear(c.probable), pesimista: C.redondear(c.pesimista), esperado: C.redondear(c.esperado), sigma: C.redondear(c.sigma) };
      }
    }
    return out;
  }

  const cerrarRonda = db.transaction((id, forzar) => {
    const e = cargar(id);
    if (e.estado !== 'en_curso') falla(409, 'La estimación no está en curso.');
    const r = rondaActual(id);
    if (!r || r.estado !== 'abierta') falla(409, 'No hay una ronda abierta.');
    const enviados = enviosDe(r.id).length;
    const invitados = expertosDe(id).length;
    if (!enviados) falla(400, 'Ningún experto ha enviado sus valores todavía.');
    if (!forzar && enviados < invitados) falla(409, `Faltan expertos por enviar (${enviados} de ${invitados}). Puedes cerrar la ronda igualmente si lo confirmas.`);
    db.prepare("UPDATE rondas SET estado = 'cerrada', cerrada = datetime('now') WHERE id = ?").run(r.id);
    if (e.metodo_codigo === 'tres_puntos') finalizarInterno(e, r);
  });

  const nuevaRonda = db.transaction((id) => {
    const e = cargar(id);
    if (e.estado !== 'en_curso' || e.metodo_codigo !== 'delphi') falla(409, 'Solo se pueden abrir rondas nuevas en una sesión Wideband Delphi en curso.');
    const r = rondaActual(id);
    if (!r || r.estado !== 'cerrada') falla(409, 'Cierra primero la ronda actual.');
    if (r.numero >= e.max_rondas) falla(409, `Se alcanzó el máximo de ${e.max_rondas} rondas.`);
    const nueva = db.prepare('INSERT INTO rondas (estimacion_id, numero) VALUES (?, ?)').run(id, r.numero + 1).lastInsertRowid;
    // Se precargan los valores de la ronda anterior como borrador para que cada experto los revise.
    db.prepare(`INSERT INTO respuestas (ronda_id, actividad_id, usuario_id, valor, comentario)
                SELECT ?, actividad_id, usuario_id, valor, '' FROM respuestas WHERE ronda_id = ?
                AND usuario_id IN (SELECT usuario_id FROM envios WHERE ronda_id = ?)`).run(nueva, r.id, r.id);
  });

  function finalizarInterno(e, ronda) {
    const resp = respuestasEnviadas(ronda.id);
    const acts = actividades(e.proyecto_id);
    const ins = db.prepare(`INSERT INTO resultados (estimacion_id, actividad_id, optimista, probable, pesimista, esperado, sigma, n_expertos)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    db.prepare('DELETE FROM resultados WHERE estimacion_id = ?').run(e.id);
    const filas = [];
    for (const a of acts) {
      const rs = resp.filter((x) => x.actividad_id === a.id);
      if (!rs.length) continue;
      if (e.metodo_codigo === 'tres_puntos') {
        const c = C.consensoTresPuntos(rs);
        filas.push({ esperado: c.esperado, sigma: c.sigma });
        ins.run(e.id, a.id, c.optimista, c.probable, c.pesimista, c.esperado, c.sigma, c.n);
      } else {
        const s = C.estadisticasDelphi(rs.map((x) => x.valor));
        filas.push({ esperado: s.media, sigma: null });
        ins.run(e.id, a.id, s.min, s.mediana, s.max, s.media, null, s.n);
      }
    }
    const t = C.totales(filas);
    db.prepare("UPDATE estimaciones SET estado = 'cerrada', cerrada = datetime('now'), esfuerzo_total = ?, sigma_total = ? WHERE id = ?")
      .run(t.esperado, t.sigma, e.id);
  }

  const finalizar = db.transaction((id) => {
    const e = cargar(id);
    if (e.estado !== 'en_curso') falla(409, 'La estimación no está en curso.');
    const r = rondaActual(id);
    if (!r || r.estado !== 'cerrada') falla(409, 'Cierra primero la ronda actual.');
    finalizarInterno(e, r);
  });

  // ---------- consulta ----------
  function detalle(id, user) {
    const e = cargar(id);
    verificarAcceso(e, user);
    const staff = esStaff(user);
    const proy = db.prepare('SELECT id, nombre, descripcion, problema, cliente, fecha_registro, fecha_requerida FROM proyectos WHERE id = ?').get(e.proyecto_id);
    const mod = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(e.moderador_id);
    const rondas = db.prepare('SELECT * FROM rondas WHERE estimacion_id = ? ORDER BY numero').all(id).map((r) => {
      const envios = enviosDe(r.id);
      const out = { id: r.id, numero: r.numero, estado: r.estado, abierta: r.abierta, cerrada: r.cerrada, enviados: staff ? envios.map((x) => x.usuario_id) : undefined, n_enviados: envios.length };
      if (staff || r.estado === 'cerrada') out.estadisticas = estadisticasRonda(e, r.id);
      if (staff) {
        out.respuestas = db.prepare('SELECT actividad_id, usuario_id, optimista, probable, pesimista, valor, comentario FROM respuestas WHERE ronda_id = ?').all(r.id);
      } else if (r.estado === 'cerrada' && !e.ocultar_valores) {
        out.valores_anonimos = respuestasEnviadas(r.id).map((x) => ({ actividad_id: x.actividad_id, optimista: x.optimista, probable: x.probable, pesimista: x.pesimista, valor: x.valor }));
      }
      return out;
    });
    const actual = rondas[rondas.length - 1] || null;
    let mias = null;
    if (!staff && actual) {
      mias = {
        ronda_id: actual.id,
        enviado: !!db.prepare('SELECT 1 FROM envios WHERE ronda_id = ? AND usuario_id = ?').get(actual.id, user.id),
        items: db.prepare('SELECT actividad_id, optimista, probable, pesimista, valor, comentario FROM respuestas WHERE ronda_id = ? AND usuario_id = ?').all(actual.id, user.id),
      };
    }
    const envActual = actual ? enviosDe(actual.id).map((x) => x.usuario_id) : [];
    return {
      estimacion: {
        id: e.id, titulo: e.titulo, motivo: e.motivo, estado: e.estado, unidad: e.unidad, tarifa: e.tarifa, personas: e.personas, horas_semana: e.horas_semana,
        indirectos: e.indirectos, plazo_semanas: e.plazo_semanas, max_rondas: e.max_rondas, umbral_dispersion: e.umbral_dispersion,
        ocultar_valores: !!e.ocultar_valores, metodo: { id: e.metodo_id, codigo: e.metodo_codigo, nombre: e.metodo_nombre },
        moderador: mod ? mod.nombre : '', creada: e.creada, iniciada: e.iniciada, cerrada: e.cerrada, esfuerzo_total: e.esfuerzo_total, sigma_total: e.sigma_total,
      },
      proyecto: proy,
      actividades: actividades(e.proyecto_id),
      requisitos: db.prepare('SELECT codigo, tipo, descripcion, prioridad FROM requisitos WHERE proyecto_id = ? ORDER BY codigo').all(e.proyecto_id),
      expertos: staff ? expertosDe(id).map((x) => ({ ...x, enviado: envActual.includes(x.id) })) : expertosDe(id).map((x) => ({ id: x.id, nombre: x.nombre, enviado: envActual.includes(x.id) })),
      rondas,
      mis_respuestas: mias,
      resultados: e.estado === 'cerrada' ? resultados(id, user) : null,
    };
  }

  function resultados(id, user) {
    const e = cargar(id);
    if (user) verificarAcceso(e, user);
    if (e.estado !== 'cerrada') falla(409, 'La estimación todavía no está cerrada.');
    const filas = db.prepare(`SELECT r.actividad_id, a.nombre AS actividad, m.nombre AS modulo, r.optimista, r.probable, r.pesimista, r.esperado, r.sigma, r.n_expertos
                              FROM resultados r JOIN actividades a ON a.id = r.actividad_id LEFT JOIN modulos m ON m.id = a.modulo_id
                              WHERE r.estimacion_id = ? ORDER BY a.orden, a.id`).all(id);
    const suma = (k) => filas.reduce((s, x) => s + (x[k] || 0), 0);
    const t = { esperado: e.esfuerzo_total, sigma: e.sigma_total };
    const tp = e.metodo_codigo === 'tres_puntos';
    const defs = tp
      ? [['Optimista', suma('optimista')], ['Más probable', suma('probable')], ['Pesimista', suma('pesimista')], ['Esperado', t.esperado]]
      : [['Mínimo de los expertos', suma('optimista')], ['Mediana', suma('probable')], ['Máximo de los expertos', suma('pesimista')], ['Consenso (promedio)', t.esperado]];
    const escenarios = defs.map(([nombre, valor]) => {
      const x = C.escenario(e, valor);
      return { nombre, ...x, cumple: Number.isFinite(x.semanas) ? x.semanas <= e.plazo_semanas : null };
    });
    const rangos = t.sigma != null ? [1, 2].map((k) => ({ nivel: k === 1 ? 68 : 95, desde: t.esperado - k * t.sigma, hasta: t.esperado + k * t.sigma })) : [];
    const necesaria = e.plazo_semanas > 0 && e.personas > 0 ? (e.unidad === 'dias' ? t.esperado * C.HORAS_DIA : t.esperado) / e.plazo_semanas / e.personas : null;
    return {
      metodo: e.metodo_codigo, unidad: e.unidad, filas, totales: { ...t, suma_o: suma('optimista'), suma_m: suma('probable'), suma_p: suma('pesimista') },
      escenarios, rangos, plazo_semanas: e.plazo_semanas, horas_semana_necesarias: necesaria,
    };
  }

  function csv(id, user) {
    const r = resultados(id, user);
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const n = (v) => (v == null ? '' : C.redondear(v, 2));
    const lin = [['Módulo', 'Actividad', r.metodo === 'tres_puntos' ? 'Optimista' : 'Mínimo', r.metodo === 'tres_puntos' ? 'Más probable' : 'Mediana', r.metodo === 'tres_puntos' ? 'Pesimista' : 'Máximo', r.metodo === 'tres_puntos' ? 'Esperado (E)' : 'Consenso', 'Sigma', 'Expertos'].map(q).join(',')];
    for (const f of r.filas) lin.push([q(f.modulo), q(f.actividad), n(f.optimista), n(f.probable), n(f.pesimista), n(f.esperado), n(f.sigma), f.n_expertos].join(','));
    lin.push('', ['Escenario', 'Esfuerzo', 'Semanas', 'Costo total'].map(q).join(','));
    for (const s of r.escenarios) lin.push([q(s.nombre), n(s.valor), n(s.semanas), n(s.total)].join(','));
    return '﻿' + lin.join('\r\n');
  }

  return { ErrorApp, falla, esStaff, cargar, crear, asignarExpertos, iniciar, guardarRespuestas, enviar, cerrarRonda, nuevaRonda, finalizar, detalle, resultados, csv, parametro, actividades, expertosDe };
};
