'use strict';
const express = require('express');
const { exigirRol } = require('../middleware/auth');
const { z } = require('zod');
const { validar } = require('../validacion');

const esquema = z.object({
  host: z.string().trim().max(120), puerto: z.number().int().min(1).max(65535), seguro: z.boolean(),
  usuario: z.string().trim().max(120), clave: z.string().max(200).optional().default(''), remitente: z.string().trim().max(160).default(''),
  base_url: z.string().trim().max(200).regex(/^(https?:\/\/[^\s]+)?$/, 'La dirección pública debe empezar con http:// o https://').default(''),
});

module.exports = function rutasCorreo(db, auth, correo) {
  const r = express.Router();
  r.get('/correo/config', auth, exigirRol('admin', 'moderador'), (req, res) => res.json(correo.ver()));
  r.put('/correo/config', auth, exigirRol('admin'), (req, res) => { correo.guardar(validar(esquema, req.body)); res.json(correo.ver()); });
  r.post('/correo/prueba', auth, exigirRol('admin'), async (req, res) => {
    const para = String(req.body.para || req.user.correo).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) return res.status(400).json({ error: 'Escribe un correo válido para la prueba.' });
    const r1 = await correo.probar(para);
    res.json({ estado: r1.estado, error: r1.error || '', para });
  });
  return r;
};
