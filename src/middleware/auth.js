'use strict';
const jwt = require('jsonwebtoken');

const SECRETO = process.env.JWT_SECRETO || 'cambia-este-secreto-en-produccion';
const COOKIE = 'est_sesion';
const DURACION_HORAS = 8;

function emitir(res, usuario) {
  const token = jwt.sign({ id: usuario.id }, SECRETO, { expiresIn: `${DURACION_HORAS}h` });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SEGURA === '1', maxAge: DURACION_HORAS * 3600 * 1000 });
}

// Devuelve el usuario activo de la cookie de sesión, o null.
function usuarioDe(db, req) {
  try {
    const { id } = jwt.verify(req.cookies[COOKIE] || '', SECRETO);
    return db.prepare('SELECT id, nombre, correo, rol, especialidad FROM usuarios WHERE id = ? AND activo = 1').get(id) || null;
  } catch { return null; }
}

// Carga req.user desde la cookie (o responde 401).
function autenticar(db) {
  return (req, res, next) => {
    const u = usuarioDe(db, req);
    if (!u) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    req.user = u;
    next();
  };
}

const exigirRol = (...roles) => (req, res, next) =>
  roles.includes(req.user.rol) ? next() : res.status(403).json({ error: 'No tienes permiso para esta acción.' });

module.exports = { emitir, autenticar, usuarioDe, exigirRol, COOKIE };
