'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { autenticar } = require('./middleware/auth');
const crearServicios = require('./servicios');
const rutasAuth = require('./rutas/auth');
const rutasProyectos = require('./rutas/proyectos');
const rutasConfiguracion = require('./rutas/configuracion');
const rutasEstimaciones = require('./rutas/estimaciones');
const rutasCorreo = require('./rutas/correo');
const crearCorreo = require('./correo');
const crearInvitaciones = require('./invitaciones');

function crearApp(db, opciones = {}) {
  const app = express();
  const S = crearServicios(db);
  const correo = opciones.transporte !== undefined ? crearCorreo(db, opciones.transporte) : crearCorreo(db);
  const I = crearInvitaciones(db, S, correo);
  const auth = autenticar(db);

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');   // detrás de ngrok u otro túnel local: usa el protocolo y host reales en los enlaces
  app.use(helmet({
    contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null } },
    strictTransportSecurity: false,
  }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  // Exige JSON en las escrituras: junto con SameSite=Lax evita peticiones forzadas desde otros sitios.
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && req.headers['content-length'] !== '0' && req.body && !req.is('application/json') && Object.keys(req.body).length) {
      return res.status(415).json({ error: 'Se esperaba JSON.' });
    }
    next();
  });

  app.use('/api', rutasAuth(db, I));
  app.use('/api', rutasProyectos(db, auth));
  app.use('/api', rutasConfiguracion(db, auth));
  app.use('/api', rutasCorreo(db, auth, correo));
  app.use('/api', rutasEstimaciones(db, auth, S, I, correo));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

  app.use('/vendor/chart.js', express.static(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist')));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Manejo central de errores
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
    if (err.estado) return res.status(err.estado).json({ error: err.message });
    if (err.code && String(err.code).startsWith('SQLITE_CONSTRAINT')) return res.status(400).json({ error: 'Los datos no cumplen las reglas de la base de datos.' });
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });
  return { app, S, I, correo };
}

module.exports = { crearApp };
