-- Esquema de la base de datos del Estimador de Software UCE (SQLite).
-- Modelo normalizado: la definición del proyecto es independiente del método de estimación.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,
  correo        TEXT NOT NULL UNIQUE,
  clave_hash    TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('admin','moderador','experto')),
  especialidad  TEXT NOT NULL DEFAULT '',
  activo        INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS configuracion (
  clave     TEXT PRIMARY KEY,
  etiqueta  TEXT NOT NULL,
  valor     REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS metodos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo       TEXT NOT NULL UNIQUE CHECK (codigo IN ('tres_puntos','delphi')),
  nombre       TEXT NOT NULL,
  descripcion  TEXT NOT NULL DEFAULT '',
  activo       INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1))
);

CREATE TABLE IF NOT EXISTS parametros_metodo (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  metodo_id  INTEGER NOT NULL REFERENCES metodos(id) ON DELETE CASCADE,
  clave      TEXT NOT NULL,
  etiqueta   TEXT NOT NULL,
  ayuda      TEXT NOT NULL DEFAULT '',
  valor      REAL NOT NULL,
  minimo     REAL NOT NULL DEFAULT 0,
  maximo     REAL NOT NULL DEFAULT 1000000,
  UNIQUE (metodo_id, clave)
);

CREATE TABLE IF NOT EXISTS proyectos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre           TEXT NOT NULL,
  descripcion      TEXT NOT NULL DEFAULT '',
  problema         TEXT NOT NULL DEFAULT '',
  cliente          TEXT NOT NULL DEFAULT '',
  fecha_registro   TEXT NOT NULL DEFAULT (date('now')),
  fecha_requerida  TEXT NOT NULL,
  estado           TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','archivado')),
  creado_por       INTEGER NOT NULL REFERENCES usuarios(id),
  creado           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS modulos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id  INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  descripcion  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS requisitos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id  INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  modulo_id    INTEGER REFERENCES modulos(id) ON DELETE SET NULL,
  codigo       TEXT NOT NULL,
  tipo         TEXT NOT NULL DEFAULT 'funcional' CHECK (tipo IN ('funcional','no_funcional')),
  descripcion  TEXT NOT NULL,
  prioridad    TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('alta','media','baja')),
  UNIQUE (proyecto_id, codigo)
);

CREATE TABLE IF NOT EXISTS actividades (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id  INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  modulo_id    INTEGER REFERENCES modulos(id) ON DELETE SET NULL,
  nombre       TEXT NOT NULL,
  descripcion  TEXT NOT NULL DEFAULT '',
  orden        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS estimaciones (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id         INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  metodo_id           INTEGER NOT NULL REFERENCES metodos(id),
  titulo              TEXT NOT NULL,
  motivo              TEXT NOT NULL DEFAULT '',
  unidad              TEXT NOT NULL DEFAULT 'horas' CHECK (unidad IN ('horas','dias')),
  tarifa              REAL NOT NULL DEFAULT 0,
  personas            INTEGER NOT NULL DEFAULT 1,
  horas_semana        REAL NOT NULL DEFAULT 1,
  indirectos          REAL NOT NULL DEFAULT 0,
  plazo_semanas       REAL NOT NULL DEFAULT 1,
  max_rondas          INTEGER NOT NULL DEFAULT 1,
  umbral_dispersion   REAL NOT NULL DEFAULT 15,
  ocultar_valores     INTEGER NOT NULL DEFAULT 1 CHECK (ocultar_valores IN (0,1)),
  estado              TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','en_curso','cerrada')),
  moderador_id        INTEGER NOT NULL REFERENCES usuarios(id),
  creada              TEXT NOT NULL DEFAULT (datetime('now')),
  iniciada            TEXT,
  cerrada             TEXT,
  esfuerzo_total      REAL,
  sigma_total         REAL
);

CREATE TABLE IF NOT EXISTS estimacion_expertos (
  estimacion_id  INTEGER NOT NULL REFERENCES estimaciones(id) ON DELETE CASCADE,
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id),
  invitado       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (estimacion_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS rondas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  estimacion_id  INTEGER NOT NULL REFERENCES estimaciones(id) ON DELETE CASCADE,
  numero         INTEGER NOT NULL,
  estado         TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada')),
  abierta        TEXT NOT NULL DEFAULT (datetime('now')),
  cerrada        TEXT,
  UNIQUE (estimacion_id, numero)
);

CREATE TABLE IF NOT EXISTS envios (
  ronda_id    INTEGER NOT NULL REFERENCES rondas(id) ON DELETE CASCADE,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  enviado     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (ronda_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS respuestas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ronda_id      INTEGER NOT NULL REFERENCES rondas(id) ON DELETE CASCADE,
  actividad_id  INTEGER NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
  optimista     REAL CHECK (optimista IS NULL OR optimista >= 0),
  probable      REAL CHECK (probable IS NULL OR probable >= 0),
  pesimista     REAL CHECK (pesimista IS NULL OR pesimista >= 0),
  valor         REAL CHECK (valor IS NULL OR valor >= 0),
  comentario    TEXT NOT NULL DEFAULT '',
  UNIQUE (ronda_id, actividad_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS resultados (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  estimacion_id  INTEGER NOT NULL REFERENCES estimaciones(id) ON DELETE CASCADE,
  actividad_id   INTEGER NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  optimista      REAL,
  probable       REAL,
  pesimista      REAL,
  esperado       REAL NOT NULL,
  sigma          REAL,
  n_expertos     INTEGER NOT NULL,
  UNIQUE (estimacion_id, actividad_id)
);

CREATE INDEX IF NOT EXISTS ix_actividades_proyecto  ON actividades(proyecto_id);
CREATE INDEX IF NOT EXISTS ix_requisitos_proyecto   ON requisitos(proyecto_id);
CREATE INDEX IF NOT EXISTS ix_estimaciones_proyecto ON estimaciones(proyecto_id);
CREATE INDEX IF NOT EXISTS ix_respuestas_ronda      ON respuestas(ronda_id);

-- Invitaciones a participar: a un experto ya registrado (usuario_id) o a un correo todavía sin cuenta (token de registro).
CREATE TABLE IF NOT EXISTS invitaciones (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  estimacion_id  INTEGER NOT NULL REFERENCES estimaciones(id) ON DELETE CASCADE,
  usuario_id     INTEGER REFERENCES usuarios(id),
  correo         TEXT NOT NULL,
  token          TEXT UNIQUE,
  estado         TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviada','aceptada')),
  creada         TEXT NOT NULL DEFAULT (datetime('now')),
  enviada        TEXT,
  aceptada       TEXT,
  UNIQUE (estimacion_id, correo)
);

-- Bandeja de salida: todo correo generado por el sistema queda registrado (aunque no haya servidor de correo configurado).
CREATE TABLE IF NOT EXISTS correos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  estimacion_id  INTEGER REFERENCES estimaciones(id) ON DELETE CASCADE,
  para           TEXT NOT NULL,
  asunto         TEXT NOT NULL,
  texto          TEXT NOT NULL,
  estado         TEXT NOT NULL CHECK (estado IN ('simulado','enviado','error')),
  error          TEXT NOT NULL DEFAULT '',
  creado         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Configuración del correo saliente (una sola fila). La contraseña se guarda cifrada.
CREATE TABLE IF NOT EXISTS ajustes_correo (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  host       TEXT NOT NULL DEFAULT '',
  puerto     INTEGER NOT NULL DEFAULT 587,
  seguro     INTEGER NOT NULL DEFAULT 0 CHECK (seguro IN (0,1)),
  usuario    TEXT NOT NULL DEFAULT '',
  clave      TEXT NOT NULL DEFAULT '',
  remitente  TEXT NOT NULL DEFAULT '',
  base_url   TEXT NOT NULL DEFAULT ''
);
