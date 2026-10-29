'use strict';
const express = require('express');
const { exigirRol } = require('../middleware/auth');
const { esquemas, validar } = require('../validacion');
const { hoy } = require('../fechas');

module.exports = function rutasProyectos(db, auth) {
  const r = express.Router();
  const staff = [auth, exigirRol('admin', 'moderador')];
  const err = (estado, error) => { const e = new Error(error); e.estado = estado; return e; };
  const existe = (id) => { const p = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(id); if (!p) throw err(404, 'El proyecto no existe.'); return p; };
  const congelado = (proyectoId) => !!db.prepare("SELECT 1 FROM estimaciones WHERE proyecto_id = ? AND estado IN ('en_curso','cerrada')").get(proyectoId);

  r.get('/proyectos', ...staff, (req, res) => {
    const filas = db.prepare(`SELECT p.*, u.nombre AS creado_por_nombre,
        (SELECT COUNT(*) FROM requisitos WHERE proyecto_id = p.id) AS n_requisitos,
        (SELECT COUNT(*) FROM modulos WHERE proyecto_id = p.id) AS n_modulos,
        (SELECT COUNT(*) FROM actividades WHERE proyecto_id = p.id) AS n_actividades
        FROM proyectos p JOIN usuarios u ON u.id = p.creado_por ORDER BY p.estado, p.creado DESC`).all();
    const est = db.prepare(`SELECT e.id, e.proyecto_id, e.titulo, e.estado, e.esfuerzo_total, m.codigo AS metodo_codigo, m.nombre AS metodo
                            FROM estimaciones e JOIN metodos m ON m.id = e.metodo_id ORDER BY e.creada`).all();
    res.json(filas.map((p) => ({ ...p, estimaciones: est.filter((e) => e.proyecto_id === p.id) })));
  });

  r.post('/proyectos', ...staff, (req, res) => {
    const d = validar(esquemas.proyecto, req.body);
    const info = db.prepare('INSERT INTO proyectos (nombre, descripcion, problema, cliente, fecha_registro, fecha_requerida, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(d.nombre, d.descripcion, d.problema, d.cliente, d.fecha_registro || hoy(), d.fecha_requerida, req.user.id);
    res.status(201).json({ id: info.lastInsertRowid });
  });

  r.get('/proyectos/:id', ...staff, (req, res) => {
    const p = existe(req.params.id);
    const id = p.id;
    res.json({
      ...p,
      modulos: db.prepare('SELECT * FROM modulos WHERE proyecto_id = ? ORDER BY id').all(id),
      requisitos: db.prepare('SELECT * FROM requisitos WHERE proyecto_id = ? ORDER BY codigo').all(id),
      actividades: db.prepare('SELECT * FROM actividades WHERE proyecto_id = ? ORDER BY orden, id').all(id),
      estimaciones: db.prepare(`SELECT e.id, e.titulo, e.estado, e.creada, e.cerrada, e.esfuerzo_total, e.sigma_total, e.unidad, e.plazo_semanas, m.codigo AS metodo_codigo, m.nombre AS metodo,
          u.nombre AS moderador,
          (SELECT group_concat(x.nombre, ', ') FROM estimacion_expertos ee JOIN usuarios x ON x.id = ee.usuario_id WHERE ee.estimacion_id = e.id) AS expertos
          FROM estimaciones e JOIN metodos m ON m.id = e.metodo_id JOIN usuarios u ON u.id = e.moderador_id WHERE e.proyecto_id = ? ORDER BY e.creada DESC`).all(id),
      congelado: congelado(id),
    });
  });

  r.put('/proyectos/:id', ...staff, (req, res) => {
    const p = existe(req.params.id);
    const d = validar(esquemas.proyecto, req.body);
    const estado = req.body.estado === 'archivado' ? 'archivado' : 'activo';
    db.prepare('UPDATE proyectos SET nombre = ?, descripcion = ?, problema = ?, cliente = ?, fecha_requerida = ?, estado = ? WHERE id = ?')
      .run(d.nombre, d.descripcion, d.problema, d.cliente, d.fecha_requerida, estado, p.id);
    res.json({ ok: true });
  });

  r.delete('/proyectos/:id', ...staff, (req, res) => {
    const p = existe(req.params.id);
    if (db.prepare('SELECT 1 FROM estimaciones WHERE proyecto_id = ?').get(p.id)) throw err(409, 'El proyecto tiene estimaciones; archívalo en lugar de eliminarlo.');
    db.prepare('DELETE FROM proyectos WHERE id = ?').run(p.id);
    res.json({ ok: true });
  });

  // ---- módulos, requisitos y actividades (definición del problema) ----
  const moduloValido = (proyectoId, moduloId) => {
    if (moduloId == null) return null;
    if (!db.prepare('SELECT 1 FROM modulos WHERE id = ? AND proyecto_id = ?').get(moduloId, proyectoId)) throw err(400, 'El módulo no pertenece al proyecto.');
    return moduloId;
  };
  const hijo = (ruta, tabla, esquema, insertar, actualizar, { bloquea = false } = {}) => {
    r.post(`/proyectos/:id/${ruta}`, ...staff, (req, res) => {
      const p = existe(req.params.id);
      if (bloquea && congelado(p.id)) throw err(409, 'El proyecto ya tiene estimaciones iniciadas; no se pueden agregar ni quitar actividades.');
      const d = validar(esquema, req.body);
      try { res.status(201).json({ id: insertar(p.id, d) }); }
      catch (e) { if (/UNIQUE/.test(e.message)) throw err(409, 'Ya existe un registro con ese código en este proyecto.'); throw e; }
    });
    r.put(`/${ruta}/:id`, ...staff, (req, res) => {
      const fila = db.prepare(`SELECT * FROM ${tabla} WHERE id = ?`).get(req.params.id);
      if (!fila) throw err(404, 'No existe.');
      const d = validar(esquema, req.body);
      try { actualizar(fila, d); } catch (e) { if (/UNIQUE/.test(e.message)) throw err(409, 'Ya existe un registro con ese código en este proyecto.'); throw e; }
      res.json({ ok: true });
    });
    r.delete(`/${ruta}/:id`, ...staff, (req, res) => {
      const fila = db.prepare(`SELECT * FROM ${tabla} WHERE id = ?`).get(req.params.id);
      if (!fila) throw err(404, 'No existe.');
      if (bloquea && congelado(fila.proyecto_id)) throw err(409, 'El proyecto ya tiene estimaciones iniciadas; no se pueden quitar actividades.');
      db.prepare(`DELETE FROM ${tabla} WHERE id = ?`).run(fila.id);
      res.json({ ok: true });
    });
  };
  hijo('modulos', 'modulos', esquemas.modulo,
    (pid, d) => db.prepare('INSERT INTO modulos (proyecto_id, nombre, descripcion) VALUES (?, ?, ?)').run(pid, d.nombre, d.descripcion).lastInsertRowid,
    (f, d) => db.prepare('UPDATE modulos SET nombre = ?, descripcion = ? WHERE id = ?').run(d.nombre, d.descripcion, f.id));
  hijo('requisitos', 'requisitos', esquemas.requisito,
    (pid, d) => db.prepare('INSERT INTO requisitos (proyecto_id, modulo_id, codigo, tipo, descripcion, prioridad) VALUES (?, ?, ?, ?, ?, ?)')
      .run(pid, moduloValido(pid, d.modulo_id), d.codigo, d.tipo, d.descripcion, d.prioridad).lastInsertRowid,
    (f, d) => db.prepare('UPDATE requisitos SET modulo_id = ?, codigo = ?, tipo = ?, descripcion = ?, prioridad = ? WHERE id = ?')
      .run(moduloValido(f.proyecto_id, d.modulo_id), d.codigo, d.tipo, d.descripcion, d.prioridad, f.id));
  hijo('actividades', 'actividades', esquemas.actividad,
    (pid, d) => db.prepare('INSERT INTO actividades (proyecto_id, modulo_id, nombre, descripcion, orden) VALUES (?, ?, ?, ?, ?)')
      .run(pid, moduloValido(pid, d.modulo_id), d.nombre, d.descripcion, d.orden ?? (db.prepare('SELECT COALESCE(MAX(orden),0)+1 n FROM actividades WHERE proyecto_id = ?').get(pid).n)).lastInsertRowid,
    (f, d) => db.prepare('UPDATE actividades SET modulo_id = ?, nombre = ?, descripcion = ?, orden = ? WHERE id = ?')
      .run(moduloValido(f.proyecto_id, d.modulo_id), d.nombre, d.descripcion, d.orden ?? f.orden, f.id),
    { bloquea: true });
  return r;
};
