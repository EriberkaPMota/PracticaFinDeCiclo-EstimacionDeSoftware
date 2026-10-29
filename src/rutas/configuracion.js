'use strict';
const express = require('express');
const { exigirRol } = require('../middleware/auth');

module.exports = function rutasConfiguracion(db, auth) {
  const r = express.Router();
  const err = (estado, error) => { const e = new Error(error); e.estado = estado; return e; };

  r.get('/metodos', auth, (req, res) => {
    const metodos = db.prepare('SELECT * FROM metodos ORDER BY id').all();
    const params = db.prepare('SELECT * FROM parametros_metodo ORDER BY id').all();
    res.json(metodos.map((m) => ({ ...m, activo: !!m.activo, parametros: params.filter((p) => p.metodo_id === m.id) })));
  });

  // Solo el administrador configura los métodos: activar/desactivar y valores por defecto de cada parámetro.
  r.put('/metodos/:id', auth, exigirRol('admin'), (req, res) => {
    const m = db.prepare('SELECT * FROM metodos WHERE id = ?').get(req.params.id);
    if (!m) throw err(404, 'El método no existe.');
    const activo = req.body.activo ? 1 : 0;
    if (!activo && db.prepare('SELECT COUNT(*) c FROM metodos WHERE activo = 1 AND id <> ?').get(m.id).c === 0) throw err(400, 'Debe quedar al menos un método activo.');
    const upd = db.prepare('UPDATE parametros_metodo SET valor = ? WHERE metodo_id = ? AND clave = ?');
    db.transaction(() => {
      db.prepare('UPDATE metodos SET activo = ? WHERE id = ?').run(activo, m.id);
      for (const [clave, valor] of Object.entries(req.body.parametros || {})) {
        const p = db.prepare('SELECT * FROM parametros_metodo WHERE metodo_id = ? AND clave = ?').get(m.id, clave);
        if (!p) throw err(400, `El parámetro ${clave} no existe.`);
        const v = Number(valor);
        if (!Number.isFinite(v) || v < p.minimo || v > p.maximo) throw err(400, `${p.etiqueta}: el valor debe estar entre ${p.minimo} y ${p.maximo}.`);
        upd.run(v, m.id, clave);
      }
    })();
    res.json({ ok: true });
  });

  r.get('/configuracion', auth, (req, res) => res.json(db.prepare('SELECT clave, etiqueta, valor FROM configuracion ORDER BY rowid').all()));
  r.put('/configuracion', auth, exigirRol('admin'), (req, res) => {
    const upd = db.prepare('UPDATE configuracion SET valor = ? WHERE clave = ?');
    db.transaction(() => {
      for (const [clave, valor] of Object.entries(req.body || {})) {
        const v = Number(valor);
        if (!Number.isFinite(v) || v < 0) throw err(400, 'Los valores deben ser números mayores o iguales que cero.');
        if (!upd.run(v, clave).changes) throw err(400, `La opción ${clave} no existe.`);
      }
    })();
    res.json({ ok: true });
  });
  return r;
};
