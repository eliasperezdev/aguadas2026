CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('tanque', 'aguada')),
  nombre TEXT,
  ubicacion TEXT,
  last_seen INTEGER,
  rssi INTEGER,
  reconnects INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  distancia_cm REAL,
  nivel_pct REAL,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX IF NOT EXISTS idx_readings_device_ts ON readings(device_id, ts);

CREATE TABLE IF NOT EXISTS pump_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  ts_inicio INTEGER NOT NULL,
  ts_fin INTEGER,
  nivel_inicio REAL,
  nivel_fin REAL,
  duracion_s INTEGER,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  mensaje TEXT,
  ts INTEGER NOT NULL,
  resuelto INTEGER DEFAULT 0,
  ultima_notificacion INTEGER,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX IF NOT EXISTS idx_alerts_device_tipo ON alerts(device_id, tipo, resuelto);
