'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const RUTA = process.env.DB_PATH || path.join(__dirname, '..', '..', 'datos', 'estimador.db');

function abrir(ruta = RUTA) {
  if (ruta !== ':memory:') fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const db = new Database(ruta);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  // Migración: bases creadas con una versión anterior no tienen la columna "motivo".
  const cols = db.prepare('PRAGMA table_info(estimaciones)').all().map((c) => c.name);
  if (!cols.includes('motivo')) db.exec("ALTER TABLE estimaciones ADD COLUMN motivo TEXT NOT NULL DEFAULT ''");
  return db;
}

module.exports = { abrir, RUTA };
