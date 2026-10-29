'use strict';
require('dotenv').config();   // lee el archivo .env si existe
const { abrir, RUTA } = require('./src/db/conexion');
const { sembrar } = require('./src/db/semilla');
const { crearApp } = require('./src/app');

const db = abrir();
sembrar(db);
const { app } = crearApp(db);
const PUERTO = Number(process.env.PORT) || 3000;
app.listen(PUERTO, '0.0.0.0', () => {
  console.log(`Estimador de Software UCE en http://localhost:${PUERTO}`);
  console.log(`Base de datos: ${RUTA}`);
});
