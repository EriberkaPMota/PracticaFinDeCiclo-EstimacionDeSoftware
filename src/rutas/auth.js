'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { emitir, autenticar, usuarioDe, exigirRol, COOKIE } = require('../middleware/auth');
const { esquemas, validar } = require('../validacion');

module.exports = function rutasAuth(db, I) {
  const r = express.Router();
  const intentos = new Map(); // limitador sencillo: 8 intentos fallidos por correo cada 10 minutos
  const VENTANA = 10 * 60 * 1000, MAX = 8;
  const hash = (clave) => bcrypt.hashSync(clave, 10);

  r.post('/auth/login', (req, res) => {
    const { correo, clave } = validar(esquemas.login, req.body);
    const reg = intentos.get(correo) || { n: 0, desde: Date.now() };
    if (Date.now() - reg.desde > VENTANA) { reg.n = 0; reg.desde = Date.now(); }
    if (reg.n >= MAX) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
    const u = db.prepare('SELECT * FROM usuarios WHERE correo = ? AND activo = 1').get(correo);
    if (!u || !bcrypt.compareSync(clave, u.clave_hash)) {
      reg.n += 1; intentos.set(correo, reg);
      return res.status(401).json({ error: 'Correo o clave incorrectos.' });
    }
    intentos.delete(correo);
    emitir(res, u);
    res.json({ id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol });
  });

  // ---- registro público: crea siempre un usuario con rol de experto ----
  const registros = new Map();
  r.post('/auth/registro', (req, res) => {
    const reg = registros.get(req.ip) || { n: 0, desde: Date.now() };
    if (Date.now() - reg.desde > VENTANA) { reg.n = 0; reg.desde = Date.now(); }
    if (reg.n >= 10) return res.status(429).json({ error: 'Demasiados registros desde este equipo. Espera unos minutos.' });
    const d = validar(esquemas.registro, req.body);
    const inv = d.token ? I.porToken(d.token) : null;
    if (d.token) {
      if (!inv || inv.estado === 'aceptada') return res.status(400).json({ error: 'La invitación no es válida o ya fue usada.' });
      if (inv.correo !== d.correo) return res.status(400).json({ error: 'El correo debe ser el mismo al que se envió la invitación.' });
      if (inv.estimacion_estado === 'cerrada') return res.status(409).json({ error: 'La estimación de esta invitación ya está cerrada.' });
    }
    if (db.prepare('SELECT 1 FROM usuarios WHERE correo = ?').get(d.correo)) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo. Inicia sesión.' });
    reg.n += 1; registros.set(req.ip, reg);
    const id = db.transaction(() => {
      const nuevo = db.prepare("INSERT INTO usuarios (nombre, correo, clave_hash, rol, especialidad) VALUES (?, ?, ?, 'experto', ?)")
        .run(d.nombre, d.correo, hash(d.clave), d.especialidad).lastInsertRowid;
      if (inv) {
        db.prepare('INSERT OR IGNORE INTO estimacion_expertos (estimacion_id, usuario_id) VALUES (?, ?)').run(inv.estimacion_id, nuevo);
        db.prepare("UPDATE invitaciones SET usuario_id = ?, estado = 'aceptada', aceptada = datetime('now') WHERE id = ?").run(nuevo, inv.id);
      }
      return nuevo;
    })();
    emitir(res, { id });
    res.status(201).json({ id, nombre: d.nombre, correo: d.correo, rol: 'experto', estimacion_id: inv ? inv.estimacion_id : null });
  });
  // Datos mínimos de una invitación para precargar el formulario de registro.
  r.get('/auth/invitacion/:token', (req, res) => {
    const inv = /^[0-9a-f]{48}$/.test(req.params.token) ? I.porToken(req.params.token) : null;
    if (!inv || inv.estado === 'aceptada') return res.status(404).json({ error: 'La invitación no es válida o ya fue usada.' });
    res.json({ correo: inv.correo, proyecto: inv.proyecto, titulo: inv.titulo });
  });

  r.post('/auth/logout', (req, res) => { res.clearCookie(COOKIE); res.json({ ok: true }); });

  const auth = autenticar(db);
  // Sin sesión responde 200 con null (así el navegador no registra un error al abrir la página).
  r.get('/auth/yo', (req, res) => res.json(usuarioDe(db, req)));

  // ---- cada usuario cambia su propia clave (la que le puso el administrador u otra) ----
  const cambios = new Map();
  r.put('/auth/clave', auth, (req, res) => {
    const reg = cambios.get(req.user.id) || { n: 0, desde: Date.now() };
    if (Date.now() - reg.desde > VENTANA) { reg.n = 0; reg.desde = Date.now(); }
    if (reg.n >= MAX) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
    const d = validar(esquemas.cambioClave, req.body);
    const u = db.prepare('SELECT clave_hash FROM usuarios WHERE id = ?').get(req.user.id);
    if (!u || !bcrypt.compareSync(d.actual, u.clave_hash)) {
      reg.n += 1; cambios.set(req.user.id, reg);
      return res.status(400).json({ error: 'La clave actual no es correcta.' });
    }
    if (d.actual === d.nueva) return res.status(400).json({ error: 'La clave nueva debe ser distinta de la actual.' });
    db.prepare('UPDATE usuarios SET clave_hash = ? WHERE id = ?').run(hash(d.nueva), req.user.id);
    cambios.delete(req.user.id);
    res.json({ ok: true });
  });

  // ---- usuarios (solo administrador) ----
  r.get('/usuarios', auth, exigirRol('admin'), (req, res) => {
    res.json(db.prepare('SELECT id, nombre, correo, rol, especialidad, activo, creado FROM usuarios ORDER BY rol, nombre').all());
  });
  r.post('/usuarios', auth, exigirRol('admin'), (req, res) => {
    const d = validar(esquemas.usuario, req.body);
    if (!d.clave) return res.status(400).json({ error: 'La clave es obligatoria al crear un usuario.' });
    if (db.prepare('SELECT 1 FROM usuarios WHERE correo = ?').get(d.correo)) return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
    const info = db.prepare('INSERT INTO usuarios (nombre, correo, clave_hash, rol, especialidad, activo) VALUES (?, ?, ?, ?, ?, ?)')
      .run(d.nombre, d.correo, hash(d.clave), d.rol, d.especialidad, d.activo ? 1 : 0);
    res.status(201).json({ id: info.lastInsertRowid });
  });
  r.put('/usuarios/:id', auth, exigirRol('admin'), (req, res) => {
    const id = Number(req.params.id);
    const d = validar(esquemas.usuario, req.body);
    const actual = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    if (!actual) return res.status(404).json({ error: 'El usuario no existe.' });
    if (id === req.user.id && (!d.activo || d.rol !== 'admin')) return res.status(400).json({ error: 'No puedes desactivarte ni quitarte el rol de administrador.' });
    const otro = db.prepare('SELECT 1 FROM usuarios WHERE correo = ? AND id <> ?').get(d.correo, id);
    if (otro) return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
    db.prepare('UPDATE usuarios SET nombre = ?, correo = ?, rol = ?, especialidad = ?, activo = ?, clave_hash = ? WHERE id = ?')
      .run(d.nombre, d.correo, d.rol, d.especialidad, d.activo ? 1 : 0, d.clave ? hash(d.clave) : actual.clave_hash, id);
    res.json({ ok: true });
  });
  // Lista de expertos activos para seleccionar en una estimación.
  r.get('/expertos', auth, exigirRol('admin', 'moderador'), (req, res) => {
    res.json(db.prepare("SELECT id, nombre, correo, especialidad FROM usuarios WHERE rol = 'experto' AND activo = 1 ORDER BY nombre").all());
  });
  return r;
};
