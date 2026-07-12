const db = require('./init');

const upsertDevice = db.prepare(`
  INSERT INTO devices (id, tipo, last_seen)
  VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    tipo = excluded.tipo,
    last_seen = excluded.last_seen
`);

const insertReading = db.prepare(`
  INSERT INTO readings (device_id, ts, distancia_cm, nivel_pct)
  VALUES (?, ?, ?, ?)
`);

const insertPumpEvent = db.prepare(`
  INSERT INTO pump_events (device_id, ts_inicio, ts_fin, nivel_inicio, nivel_fin, duracion_s)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const getOpenPumpEvent = db.prepare(`
  SELECT * FROM pump_events
  WHERE device_id = ? AND ts_fin IS NULL
  ORDER BY ts_inicio DESC LIMIT 1
`);

const closePumpEvent = db.prepare(`
  UPDATE pump_events SET ts_fin = ?, nivel_fin = ?, duracion_s = ?
  WHERE id = ?
`);

const insertAlert = db.prepare(`
  INSERT INTO alerts (device_id, tipo, mensaje, ts)
  VALUES (?, ?, ?, ?)
`);

const getActiveAlert = db.prepare(`
  SELECT * FROM alerts
  WHERE device_id = ? AND tipo = ? AND resuelto = 0
  ORDER BY ts DESC LIMIT 1
`);

const resolveAlert = db.prepare(`
  UPDATE alerts SET resuelto = 1 WHERE id = ?
`);

const updateAlertNotification = db.prepare(`
  UPDATE alerts SET ultima_notificacion = ? WHERE id = ?
`);

const getLastReading = db.prepare(`
  SELECT * FROM readings
  WHERE device_id = ?
  ORDER BY ts DESC LIMIT 1
`);

const getDevice = db.prepare(`
  SELECT * FROM devices WHERE id = ?
`);

const getLastAlert = db.prepare(`
  SELECT * FROM alerts ORDER BY id DESC LIMIT 1
`);

const getAllDevices = db.prepare(`
  SELECT * FROM devices
`);

const getActiveAlertsByTipo = db.prepare(`
  SELECT * FROM alerts
  WHERE tipo = ? AND resuelto = 0
  ORDER BY ts ASC
`);

const getReadingsByDeviceSince = db.prepare(`
  SELECT device_id, ts, distancia_cm, nivel_pct
  FROM readings
  WHERE device_id = ? AND ts >= ?
  ORDER BY ts ASC
`);

const getReadingsSince = db.prepare(`
  SELECT device_id, ts, distancia_cm, nivel_pct
  FROM readings
  WHERE ts >= ?
  ORDER BY device_id, ts ASC
`);

module.exports = {
  upsertDevice,
  insertReading,
  insertPumpEvent,
  getOpenPumpEvent,
  closePumpEvent,
  insertAlert,
  getActiveAlert,
  resolveAlert,
  updateAlertNotification,
  getLastReading,
  getDevice,
  getLastAlert,
  getAllDevices,
  getActiveAlertsByTipo,
  getReadingsByDeviceSince,
  getReadingsSince
};
