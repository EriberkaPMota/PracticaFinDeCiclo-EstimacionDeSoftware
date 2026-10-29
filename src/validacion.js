'use strict';
const { z } = require('zod');

const texto = (max, min = 0) => z.string().trim().min(min).max(max);
const num = z.number().finite();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD.');

const esquemas = {
  login: z.object({ correo: z.string().trim().toLowerCase().email(), clave: z.string().min(1).max(100) }),
  usuario: z.object({
    nombre: texto(80, 2), correo: z.string().trim().toLowerCase().email(), clave: z.string().min(8, 'La clave debe tener al menos 8 caracteres.').max(100).optional(),
    rol: z.enum(['admin', 'moderador', 'experto']), especialidad: texto(80).default(''), activo: z.boolean().default(true),
  }),
  cambioClave: z.object({ actual: z.string().min(1).max(100), nueva: z.string().min(8, 'La clave nueva debe tener al menos 8 caracteres.').max(100) }),
  proyecto: z.object({
    nombre: texto(100, 3), descripcion: texto(1000).default(''), problema: texto(2000).default(''), cliente: texto(100).default(''),
    fecha_requerida: fecha, fecha_registro: fecha.optional(),
  }),
  registro: z.object({
    nombre: texto(80, 2), correo: z.string().trim().toLowerCase().email(), clave: z.string().min(8, 'La clave debe tener al menos 8 caracteres.').max(100),
    especialidad: texto(80).default(''), token: z.string().regex(/^[0-9a-f]{48}$/).optional(),
  }),
  invitar: z.object({ correos: z.array(z.string().trim().toLowerCase().max(120)).max(30).default([]), reenviar: z.boolean().default(false) }),
  modulo: z.object({ nombre: texto(100, 2), descripcion: texto(500).default('') }),
  requisito: z.object({
    codigo: texto(20, 1), tipo: z.enum(['funcional', 'no_funcional']), descripcion: texto(500, 5), prioridad: z.enum(['alta', 'media', 'baja']).default('media'),
    modulo_id: z.number().int().nullable().optional(),
  }),
  actividad: z.object({ nombre: texto(120, 2), descripcion: texto(500).default(''), modulo_id: z.number().int().nullable().optional(), orden: z.number().int().min(0).optional() }),
  estimacion: z.object({
    metodo_id: z.number().int(), titulo: texto(120, 3), motivo: texto(1000).default(''), unidad: z.enum(['horas', 'dias']).default('horas'),
    tarifa: num.min(0), personas: z.number().int().min(1).max(500), horas_semana: num.min(1).max(168), indirectos: num.min(0), plazo_semanas: num.gt(0).max(520),
    max_rondas: z.number().int().min(1).max(10).optional(), umbral_dispersion: num.min(0).max(1000).optional(), ocultar_valores: z.number().int().min(0).max(1).optional(),
    expertos: z.array(z.number().int()).default([]),
  }),
  respuestas: z.object({
    respuestas: z.array(z.object({
      actividad_id: z.number().int(), optimista: num.nullable().optional(), probable: num.nullable().optional(), pesimista: num.nullable().optional(),
      valor: num.nullable().optional(), comentario: texto(300).optional(),
    })).max(500),
  }),
};

function validar(esquema, datos) {
  const r = esquema.safeParse(datos);
  if (r.success) return r.data;
  const msg = r.error.issues.map((i) => `${i.path.join('.') || 'datos'}: ${i.message}`).join('; ');
  const e = new Error(msg); e.estado = 400; throw e;
}

module.exports = { esquemas, validar };
