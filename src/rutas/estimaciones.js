'use strict';
const express = require('express');
const { exigirRol } = require('../middleware/auth');
const { esquemas, validar } = require('../validacion');

module.exports = function rutasEstimaciones(db, auth, S, I, correo) {
  const r = express.Router();
  const staff = [auth, exigirRol('admin', 'moderador')];
  const id = (req) => Number(req.params.id);
  // Base de los enlaces: la dirección pública configurada, BASE_URL si está definida; si no, la dirección con la que el moderador abrió el sistema.
  const base = (req) => (correo.baseUrl() || process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

  // Lista: el personal ve todas; el experto solo las que lo incluyen.
  r.get('/estimaciones', auth, (req, res) => {
    const base = `SELECT e.id, e.titulo, e.estado, e.creada, e.esfuerzo_total, p.id AS proyecto_id, p.nombre AS proyecto, m.nombre AS metodo, m.codigo AS metodo_codigo,
        (SELECT numero FROM rondas WHERE estimacion_id = e.id ORDER BY numero DESC LIMIT 1) AS ronda,
        (SELECT estado FROM rondas WHERE estimacion_id = e.id ORDER BY numero DESC LIMIT 1) AS ronda_estado,
        (SELECT COUNT(*) FROM envios v WHERE v.ronda_id = (SELECT id FROM rondas WHERE estimacion_id = e.id ORDER BY numero DESC LIMIT 1) AND v.usuario_id = ?) AS yo_envie
        FROM estimaciones e JOIN proyectos p ON p.id = e.proyecto_id JOIN metodos m ON m.id = e.metodo_id`;
    const filas = S.esStaff(req.user)
      ? db.prepare(`${base} ORDER BY e.creada DESC`).all(req.user.id)
      : db.prepare(`${base} WHERE e.estado <> 'borrador' AND e.id IN (SELECT estimacion_id FROM estimacion_expertos WHERE usuario_id = ?) ORDER BY e.creada DESC`).all(req.user.id, req.user.id);
    res.json(filas);
  });

  r.post('/proyectos/:id/estimaciones', ...staff, (req, res) => {
    const d = validar(esquemas.estimacion, req.body);
    const nuevo = S.crear(id(req), d, d.expertos, req.user);
    res.status(201).json({ id: nuevo });
  });

  r.get('/estimaciones/:id', auth, (req, res) => {
    const d = S.detalle(id(req), req.user);
    if (req.user.rol === 'experto') I.marcarAceptada(id(req), req.user.id);
    res.json(d);
  });

  r.put('/estimaciones/:id/expertos', ...staff, (req, res) => {
    const e = S.cargar(id(req));
    if (e.estado !== 'borrador') S.falla(409, 'Solo se puede cambiar la lista de expertos antes de iniciar.');
    S.asignarExpertos(e.id, (req.body.expertos || []).map(Number));
    I.sincronizar(e.id);
    res.json({ ok: true });
  });
  r.post('/estimaciones/:id/iniciar', ...staff, async (req, res) => {
    S.iniciar(id(req));
    const envios = await I.enviar(id(req), base(req));
    res.json({ ok: true, invitaciones: envios });
  });
  // Invitaciones: agrega correos (usuarios registrados o personas sin cuenta) y envía las pendientes.
  r.get('/estimaciones/:id/invitaciones', ...staff, (req, res) => res.json(I.listar(id(req), base(req))));
  r.post('/estimaciones/:id/invitaciones', ...staff, async (req, res) => {
    const d = validar(esquemas.invitar, req.body);
    S.cargar(id(req));
    d.correos.filter(Boolean).forEach((c) => I.invitarCorreo(id(req), c));
    const envios = await I.enviar(id(req), base(req), { reenviar: d.reenviar });
    res.json({ ok: true, enviados: envios, ...I.listar(id(req), base(req)) });
  });
  r.post('/estimaciones/:id/rondas/cerrar', ...staff, (req, res) => { S.cerrarRonda(id(req), !!req.body.forzar); res.json({ ok: true }); });
  r.post('/estimaciones/:id/rondas/nueva', ...staff, (req, res) => { S.nuevaRonda(id(req)); res.json({ ok: true }); });
  r.post('/estimaciones/:id/finalizar', ...staff, (req, res) => { S.finalizar(id(req)); res.json({ ok: true }); });
  r.delete('/estimaciones/:id', ...staff, (req, res) => {
    const e = S.cargar(id(req));
    if (e.estado !== 'borrador' && req.user.rol !== 'admin') S.falla(403, 'Solo el administrador puede eliminar estimaciones iniciadas.');
    db.prepare('DELETE FROM estimaciones WHERE id = ?').run(e.id);
    res.json({ ok: true });
  });

  // Participación de los expertos
  r.put('/estimaciones/:id/respuestas', auth, exigirRol('experto'), (req, res) => {
    const d = validar(esquemas.respuestas, req.body);
    S.guardarRespuestas(id(req), req.user, d.respuestas);
    res.json({ ok: true });
  });
  r.post('/estimaciones/:id/enviar', auth, exigirRol('experto'), (req, res) => { S.enviar(id(req), req.user); res.json({ ok: true }); });

  r.get('/estimaciones/:id/resultados', auth, (req, res) => res.json(S.resultados(id(req), req.user)));
  r.get('/estimaciones/:id/resultados.csv', auth, (req, res) => {
    res.type('text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="estimacion-${id(req)}.csv"`).send(S.csv(id(req), req.user));
  });
  return r;
};
