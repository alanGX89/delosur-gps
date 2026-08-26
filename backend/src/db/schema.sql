CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  plate_number TEXT,
  imei TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_positions (
  id BIGSERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  speed NUMERIC,
  course NUMERIC,
  recorded_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_positions_device_time
  ON device_positions (device_id, recorded_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_positions_device_recorded
  ON device_positions (device_id, recorded_at);

-- Optimización: "online"/"address"/"created_at" nunca se leen de vuelta desde
-- el historial (los contadores de estado del mapa se calculan en vivo desde la
-- API, no desde esta tabla), así que se eliminan para no seguir engordando la
-- fila guardada cada 30s por cada vehículo.
ALTER TABLE device_positions DROP COLUMN IF EXISTS online;
ALTER TABLE device_positions DROP COLUMN IF EXISTS address;
ALTER TABLE device_positions DROP COLUMN IF EXISTS created_at;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  full_name TEXT,
  logo_path TEXT,
  color_primary TEXT NOT NULL DEFAULT '#021C59',
  color_accent TEXT NOT NULL DEFAULT '#E1233A',
  color_secondary TEXT NOT NULL DEFAULT '#0086C8',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migración: reemplaza el viejo flag booleano "active" por un estado con
-- significado propio (activo/bloqueado/suspendido) + una ventana de vigencia
-- opcional (para usuarios programados con fecha de inicio/fin).
ALTER TABLE users DROP COLUMN IF EXISTS active;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'blocked', 'suspended'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;

-- Información adicional de perfil (más completa para administradores y
-- clientes con flota asignada): datos de contacto y notas internas.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS user_devices (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_id)
);

CREATE TABLE IF NOT EXISTS user_audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_username TEXT,
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_user_time
  ON user_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_time
  ON user_audit_log (created_at DESC);
