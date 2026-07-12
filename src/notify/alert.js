const q = require('../db/queries');
const mailer = require('./mailer');
const log = require('../logger');

function createAlert(device_id, tipo, mensaje) {
  const existing = q.getActiveAlert.get(device_id, tipo);
  if (existing) return null;

  const now = Date.now();
  q.insertAlert.run(device_id, tipo, mensaje, now);

  const alert = q.getLastAlert.get();
  log.info('ALERT', `🔴 CREADA: ${tipo} - ${device_id}`);
  log.info('ALERT', `   ${mensaje}`);

  mailer.sendAlert(alert).then(sent => {
    if (sent) {
      log.info('MAIL', `✓ Email alerta enviado: ${tipo} - ${device_id}`);
    } else {
      log.warn('MAIL', `✗ Email alerta NO enviado: ${tipo} - ${device_id}`);
    }
  }).catch(err => {
    log.error('MAIL', `Error enviando email alerta: ${err.message}`);
  });

  return alert;
}

function resolveAlert(device_id, tipo) {
  const active = q.getActiveAlert.get(device_id, tipo);
  if (!active) return null;

  q.resolveAlert.run(active.id);
  log.info('ALERT', `🟢 RESUELTA: ${tipo} - ${device_id}`);

  mailer.sendResolution(active).then(sent => {
    if (sent) {
      log.info('MAIL', `✓ Email resolución enviado: ${tipo} - ${device_id}`);
    } else {
      log.warn('MAIL', `✗ Email resolución NO enviado: ${tipo} - ${device_id}`);
    }
  }).catch(err => {
    log.error('MAIL', `Error enviando email resolución: ${err.message}`);
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
        log.info('MAIL', `✓ Recordatorio enviado: ${tipo} - ${alert.device_id} (${horasActiva}hs)`);
      } else {
        log.warn('MAIL', `✗ Recordatorio NO enviado: ${tipo} - ${alert.device_id}`);
      }
    }).catch(err => {
      log.error('MAIL', `Error enviando recordatorio: ${err.message}`);
    });
  });
}

module.exports = { createAlert, resolveAlert, checkReminders };
