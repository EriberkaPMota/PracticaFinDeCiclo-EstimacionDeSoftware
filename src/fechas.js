'use strict';
// Fecha de hoy (AAAA-MM-DD) en la zona horaria de la aplicación, no en UTC.
// Por defecto America/Santo_Domingo; se puede cambiar con la variable APP_TZ.
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: process.env.APP_TZ || 'America/Santo_Domingo' });
module.exports = { hoy };
