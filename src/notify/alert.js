const q = require('../db/queries');
const mailer = require('./mailer');
const log = require('../logger');

function createAlert(device_id, tipo, mensaje) {
  const existing = q.getActiveAlert.get(device_id, tipo);
  if (existing) return null;

  const now = Date.now();
  q.insertAlert.run(device_id, tipo, mensaje, now);

  const alert = q.getLastAlert.get();
  log.info('ALERT', `Creada: ${tipo} - ${device_id} - ${mensaje}`);

  mailer.sendAlert(alert).catch(err => {
    log.error('ALERT', 'Error enviando mail:', err.message);
  });

  return alert;
}

function resolveAlert(device_id, tipo) {
  const active = q.getActiveAlert.get(device_id, tipo);
  if (!active) return null;

  q.resolveAlert.run(active.id);
  log.info('ALERT', `Resuelta: ${tipo} - ${device_id}`);

  mailer.sendResolution(active).catch(err => {
    log.error('ALERT', 'Error enviando mail de resolución:', err.message);
  });

  return active;
}

function checkReminders(tipo, cooldownMs) {
  const now = Date.now();
  const activeAlerts = q.getActiveAlertsByTipo.all(tipo);

  activeAlerts.forEach(alert => {
    const horasActiva = Math.floor((now - alert.ts) / 3600000);

    if (alert.ultima_notificacion) {
      const elapsed = now - alert.ultima_notificacion;
      if (elapsed < cooldownMs) return;
    }

    mailer.sendReminder(alert, horasActiva).then(sent => {
      if (sent) {
        q.updateAlertNotification.run(now, alert.id);
        log.info('ALERT', `Recordatorio enviado: ${tipo} - ${alert.device_id} (${horasActiva}hs activa)`);
      }
    }).catch(err => {
      log.error('ALERT', 'Error enviando recordatorio:', err.message);
    });
  });
}

module.exports = { createAlert, resolveAlert, checkReminders };
