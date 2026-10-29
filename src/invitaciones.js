'use strict';
// Invitaciones a los expertos: creación, correo con la descripción del proyecto y enlaces de acceso.
const crypto = require('crypto');

const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fechaLarga = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—');

module.exports = function crearInvitaciones(db, S, correo) {
  const { falla } = S;

  function contexto(estId) {
    const e = S.cargar(estId);
    const p = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(e.proyecto_id);
    const mod = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(e.moderador_id);
    const n = db.prepare('SELECT COUNT(*) c FROM actividades WHERE proyecto_id = ?').get(p.id).c;
    return { e, p, moderador: mod ? mod.nombre : '', actividades: n };
  }

  function redactar(ctx, inv, nombre, base) {
    const { e, p, moderador, actividades } = ctx;
    const enlaceEst = `${base}/#/estimaciones/${e.id}`;
    const enlaceReg = inv.token ? `${base}/#/registro?token=${inv.token}` : '';
    const enlace = inv.usuario_id ? enlaceEst : enlaceReg;
    const motivo = e.motivo || 'Tu experiencia ayuda a que la estimación sea más realista y reduce el sesgo de una sola persona.';
    const asunto = `Invitación a estimar el proyecto «${p.nombre}» (${e.metodo_nombre})`;
    const texto = [
      `Hola ${nombre || ''}`.trim() + ',', '',
      `${moderador} te invita a participar como experto en la estimación del proyecto «${p.nombre}» con el método ${e.metodo_nombre}.`, '',
      'DESCRIPCIÓN DEL PROYECTO', p.descripcion || '(sin descripción)', '',
      `Problema que resuelve: ${p.problema || '—'}`, `Cliente: ${p.cliente || '—'}`,
      `Fecha requerida por el cliente: ${fechaLarga(p.fecha_requerida)}`, `Actividades a estimar: ${actividades}`, '',
      'POR QUÉ NECESITAMOS TU PARTICIPACIÓN', motivo, '',
      'CÓMO PARTICIPAR',
      inv.usuario_id ? `1. Abre este enlace e inicia sesión con tu cuenta: ${enlace}` : `1. Crea tu cuenta de experto con este enlace (el correo ya viene indicado): ${enlace}`,
      '2. Revisa la definición del proyecto.', '3. Escribe tus valores por actividad y pulsa «Enviar valores».', '',
      'Si no esperabas esta invitación, puedes ignorar este mensaje.',
    ].join('\n');
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;line-height:1.5;color:#14212b">
      <p>Hola ${escapar(nombre)},</p>
      <p><b>${escapar(moderador)}</b> te invita a participar como experto en la estimación del proyecto <b>«${escapar(p.nombre)}»</b> con el método <b>${escapar(e.metodo_nombre)}</b>.</p>
      <h3 style="margin-bottom:4px">Descripción del proyecto</h3><p style="margin-top:0">${escapar(p.descripcion) || '(sin descripción)'}</p>
      <ul><li><b>Problema que resuelve:</b> ${escapar(p.problema) || '—'}</li><li><b>Cliente:</b> ${escapar(p.cliente) || '—'}</li>
      <li><b>Fecha requerida por el cliente:</b> ${fechaLarga(p.fecha_requerida)}</li><li><b>Actividades a estimar:</b> ${actividades}</li></ul>
      <h3 style="margin-bottom:4px">Por qué necesitamos tu participación</h3><p style="margin-top:0">${escapar(motivo)}</p>
      <p><a href="${escapar(enlace)}" style="background:#0a6c74;color:#fff;padding:10px 16px;border-radius:4px;text-decoration:none">${inv.usuario_id ? 'Entrar y participar' : 'Crear mi cuenta y participar'}</a></p>
      <p style="font-size:13px;color:#546574">Si el botón no funciona, copia este enlace: ${escapar(enlace)}<br>Si no esperabas esta invitación, ignora este mensaje.</p></div>`;
    return { asunto, texto, html, enlace };
  }

  // Crea la invitación de un experto ya incluido como participante (si no existe).
  function sincronizar(estId) {
    const part = db.prepare(`SELECT u.id, u.correo FROM estimacion_expertos x JOIN usuarios u ON u.id = x.usuario_id WHERE x.estimacion_id = ?`).all(estId);
    const ins = db.prepare('INSERT OR IGNORE INTO invitaciones (estimacion_id, usuario_id, correo) VALUES (?, ?, ?)');
    for (const u of part) ins.run(estId, u.id, u.correo);
    // Se quitan las invitaciones de quienes ya no participan (solo las de usuarios registrados).
    db.prepare(`DELETE FROM invitaciones WHERE estimacion_id = ? AND usuario_id IS NOT NULL AND estado <> 'aceptada'
                AND usuario_id NOT IN (SELECT usuario_id FROM estimacion_expertos WHERE estimacion_id = ?)`).run(estId, estId);
  }

  // Invitar a una dirección de correo: usuario existente (se añade como participante) o persona sin cuenta (token de registro).
  const invitarCorreo = db.transaction((estId, correoDestino) => {
    const e = S.cargar(estId);
    if (e.estado === 'cerrada') falla(409, 'La estimación ya está cerrada.');
    const c = String(correoDestino).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) falla(400, `«${correoDestino}» no es un correo válido.`);
    const u = db.prepare('SELECT id, rol, activo FROM usuarios WHERE correo = ?').get(c);
    if (u) {
      if (u.rol !== 'experto' || !u.activo) falla(400, `${c} pertenece a un usuario que no es un experto activo.`);
      db.prepare('INSERT OR IGNORE INTO estimacion_expertos (estimacion_id, usuario_id) VALUES (?, ?)').run(estId, u.id);
      db.prepare('INSERT OR IGNORE INTO invitaciones (estimacion_id, usuario_id, correo) VALUES (?, ?, ?)').run(estId, u.id, c);
    } else {
      db.prepare('INSERT OR IGNORE INTO invitaciones (estimacion_id, correo, token) VALUES (?, ?, ?)').run(estId, c, crypto.randomBytes(24).toString('hex'));
    }
  });

  // Envía las invitaciones pendientes (o todas las no aceptadas si reenviar = true).
  async function enviar(estId, base, { reenviar = false } = {}) {
    const ctx = contexto(estId);
    if (ctx.e.estado === 'borrador') return [];
    sincronizar(estId);
    const filas = db.prepare(`SELECT i.*, u.nombre FROM invitaciones i LEFT JOIN usuarios u ON u.id = i.usuario_id
                              WHERE i.estimacion_id = ? AND i.estado ${reenviar ? "<> 'aceptada'" : "= 'pendiente'"}`).all(estId);
    const res = [];
    for (const inv of filas) {
      const m = redactar(ctx, inv, inv.nombre || '', base);
      const r = await correo.enviar({ estimacionId: estId, para: inv.correo, asunto: m.asunto, texto: m.texto, html: m.html });
      if (r.estado !== 'error') db.prepare("UPDATE invitaciones SET estado = 'enviada', enviada = datetime('now') WHERE id = ?").run(inv.id);
      res.push({ correo: inv.correo, estado: r.estado, error: r.error });
    }
    return res;
  }

  function listar(estId, base) {
    sincronizar(estId);
    const ctx = contexto(estId);
    const filas = db.prepare(`SELECT i.id, i.correo, i.token, i.estado, i.usuario_id, i.enviada, i.aceptada, u.nombre FROM invitaciones i
                              LEFT JOIN usuarios u ON u.id = i.usuario_id WHERE i.estimacion_id = ? ORDER BY i.id`).all(estId);
    return {
      modo: correo.modo(),
      invitaciones: filas.map((i) => ({
        id: i.id, correo: i.correo, nombre: i.nombre || '', estado: i.estado, registrado: !!i.usuario_id, enviada: i.enviada, aceptada: i.aceptada,
        enlace: i.usuario_id ? `${base}/#/estimaciones/${estId}` : `${base}/#/registro?token=${i.token}`,
      })),
      correos: db.prepare('SELECT id, para, asunto, texto, estado, error, creado FROM correos WHERE estimacion_id = ? ORDER BY id DESC LIMIT 30').all(estId),
      estimacion_estado: ctx.e.estado,
    };
  }

  // El experto abrió la estimación: se marca su invitación como aceptada.
  function marcarAceptada(estId, usuarioId) {
    db.prepare("UPDATE invitaciones SET estado = 'aceptada', aceptada = datetime('now') WHERE estimacion_id = ? AND usuario_id = ? AND estado <> 'aceptada'").run(estId, usuarioId);
  }

  function porToken(token) {
    return db.prepare(`SELECT i.*, e.titulo, e.estado AS estimacion_estado, p.nombre AS proyecto FROM invitaciones i
                       JOIN estimaciones e ON e.id = i.estimacion_id JOIN proyectos p ON p.id = e.proyecto_id WHERE i.token = ?`).get(token);
  }

  return { invitarCorreo, enviar, listar, sincronizar, marcarAceptada, porToken, redactar, contexto };
};
