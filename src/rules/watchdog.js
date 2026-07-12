const q = require('../db/queries');
const config = require('../config');
const { createAlert, resolveAlert } = require('../notify/alert');
const log = require('../logger');

let paused = true;

function check() {
  if (paused) return;

  const now = Date.now();
  const devices = q.getAllDevices.all();

  devices.forEach(device => {
    if (!device.last_seen) return;

    const elapsed = now - device.last_seen;
    const offline = elapsed > config.watchdog.offlineThresholdMs;

    const activeAlert = q.getActiveAlert.get(device.id, 'dispositivo_caido');
    const estado = activeAlert ? 'alertado' : 'normal';

    if (estado === 'normal' && offline) {
      const minutos = Math.floor(elapsed / 60000);
      createAlert(
        device.id,
        'dispositivo_caido',
        `${device.tipo} ${device.id} sin reportar hace ${minutos} min`
      );
      log.warn('WATCHDOG', `Alerta: ${device.id} offline (${minutos} min)`);
    }

    if (estado === 'alertado' && !offline) {
      resolveAlert(device.id, 'dispositivo_caido');
      log.info('WATCHDOG', `Resuelta: ${device.id} volvió online`);
    }
  });
}

function start() {
  log.info('WATCHDOG', `Iniciando (cada ${config.watchdog.checkIntervalMs / 1000}s, umbral ${config.watchdog.offlineThresholdMs / 1000}s)`);
  const interval = setInterval(check, config.watchdog.checkIntervalMs);
  return interval;
}

function resume() {
  paused = false;
}

module.exports = { start, check, resume };
