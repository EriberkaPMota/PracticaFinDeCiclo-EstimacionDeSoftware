'use strict';
// Envío de correos. La configuración SMTP se guarda en la base de datos (pantalla Configuración) o, si no hay,
// se toma de las variables SMTP_*. Sin ninguna de las dos, los correos quedan guardados como "simulado".
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const SECRETO = () => process.env.JWT_SECRETO || 'cambia-este-secreto-en-produccion';
const llave = () => crypto.createHash('sha256').update('correo:' + SECRETO()).digest();

function cifrar(txt) {
  if (!txt) return '';
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', llave(), iv);
  const datos = Buffer.concat([c.update(txt, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString('base64')).join('.');
}
function descifrar(txt) {
  if (!txt) return '';
  try {
    const [iv, tag, datos] = txt.split('.').map((x) => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', llave(), iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(datos), d.final()]).toString('utf8');
  } catch { return ''; }
}

// Traduce los errores de nodemailer a mensajes entendibles.
function explicar(e) {
  const m = String((e && e.message) || e);
  if (e && (e.code === 'EAUTH' || /Invalid login|Username and Password not accepted|535|534|Application-specific/i.test(m)))
    return 'El servidor rechazó el usuario o la contraseña. Con Gmail debes usar una «contraseña de aplicación» de 16 letras (no tu contraseña normal) y tener activada la verificación en dos pasos.';
  if (e && ['ECONNECTION', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ESOCKET', 'EDNS'].includes(e.code))
    return 'No se pudo conectar con el servidor de correo. Revisa el servidor, el puerto (587 o 465 con SSL) y tu conexión a internet.';
  if (e && e.code === 'EENVELOPE') return 'La dirección del destinatario no es válida.';
  return m.slice(0, 250);
}

module.exports = function crearCorreo(db, transporteFijo, env = process.env) {
  let cache = { clave: null, t: null };

  function config() {
    const a = db.prepare('SELECT * FROM ajustes_correo WHERE id = 1').get();
    if (a && a.host) return { host: a.host, puerto: a.puerto, seguro: !!a.seguro, usuario: a.usuario, clave: descifrar(a.clave), remitente: a.remitente, origen: 'base' };
    if (env.SMTP_HOST) return { host: env.SMTP_HOST, puerto: Number(env.SMTP_PORT || 587), seguro: env.SMTP_SECURE === '1', usuario: env.SMTP_USER || '', clave: env.SMTP_PASS || '', remitente: env.SMTP_FROM || '', origen: 'env' };
    return null;
  }
  function transporte() {
    if (transporteFijo !== undefined) return transporteFijo;
    const c = config();
    if (!c) return null;
    const k = JSON.stringify(c);
    if (cache.clave !== k) {
      cache = { clave: k, t: nodemailer.createTransport({
        host: c.host, port: c.puerto, secure: c.seguro, auth: c.usuario ? { user: c.usuario, pass: c.clave } : undefined,
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
      }) };
    }
    return cache.t;
  }
  const modo = () => (transporte() ? 'smtp' : 'simulado');
  const remitente = () => { const c = config(); return (c && (c.remitente || c.usuario)) || env.SMTP_FROM || 'estimador@localhost'; };

  async function enviar({ estimacionId = null, para, asunto, texto, html }) {
    const t = transporte();
    const id = db.prepare('INSERT INTO correos (estimacion_id, para, asunto, texto, estado) VALUES (?, ?, ?, ?, ?)')
      .run(estimacionId, para, asunto, texto, t ? 'error' : 'simulado').lastInsertRowid;
    if (!t) return { id, estado: 'simulado' };
    try {
      await t.sendMail({ from: remitente(), to: para, subject: asunto, text: texto, html });
      db.prepare("UPDATE correos SET estado = 'enviado', error = '' WHERE id = ?").run(id);
      return { id, estado: 'enviado' };
    } catch (e) {
      const msg = explicar(e);
      db.prepare("UPDATE correos SET estado = 'error', error = ? WHERE id = ?").run(msg, id);
      return { id, estado: 'error', error: msg };
    }
  }

  // ---- ajustes que edita el administrador ----
  function ver() {
    const a = db.prepare('SELECT * FROM ajustes_correo WHERE id = 1').get() || { host: '', puerto: 587, seguro: 0, usuario: '', clave: '', remitente: '', base_url: '' };
    const c = config();
    return { host: a.host, puerto: a.puerto, seguro: !!a.seguro, usuario: a.usuario, remitente: a.remitente, base_url: a.base_url, tiene_clave: !!a.clave,
      activo: !!c, origen: c ? c.origen : 'ninguno' };
  }
  function guardar(d) {
    const a = db.prepare('SELECT clave FROM ajustes_correo WHERE id = 1').get();
    const clave = d.clave ? cifrar(d.clave.replace(/\s+/g, '')) : (a ? a.clave : '');
    db.prepare(`INSERT INTO ajustes_correo (id, host, puerto, seguro, usuario, clave, remitente, base_url) VALUES (1, @host, @puerto, @seguro, @usuario, @clave, @remitente, @base_url)
      ON CONFLICT (id) DO UPDATE SET host = @host, puerto = @puerto, seguro = @seguro, usuario = @usuario, clave = @clave, remitente = @remitente, base_url = @base_url`)
      .run({ host: d.host, puerto: d.puerto, seguro: d.seguro ? 1 : 0, usuario: d.usuario, clave, remitente: d.remitente, base_url: d.base_url.replace(/\/+$/, '') });
  }
  const baseUrl = () => { const a = db.prepare('SELECT base_url FROM ajustes_correo WHERE id = 1').get(); return (a && a.base_url) || ''; };

  async function probar(para) {
    if (!transporte()) return { estado: 'simulado', error: 'Todavía no hay un servidor de correo configurado.' };
    return enviar({ para, asunto: 'Prueba de correo del Estimador UCE', texto: 'Si recibes este mensaje, el correo del Estimador UCE está bien configurado y las invitaciones llegarán a los expertos.',
      html: '<p>Si recibes este mensaje, el correo del <b>Estimador UCE</b> está bien configurado y las invitaciones llegarán a los expertos.</p>' });
  }
  return { enviar, modo, ver, guardar, probar, baseUrl };
};
module.exports.explicar = explicar;
