const q = require('../db/queries');
const config = require('../config');
const { createAlert, resolveAlert } = require('../notify/alert');
const log = require('../logger');

const bombasEncendidas = new Map();

function registrarInicio(device_id, nivel_inicio) {
  bombasEncendidas.set(device_id, {
    ts_inicio: Date.now(),
    nivel_inicio
  });
  log.info('BOMBA', `⚡ ${device_id} ENCENDIDA | nivel: ${nivel_inicio}%`);
}

function registrarFin(device_id) {
  bombasEncendidas.delete(device_id);
  log.info('BOMBA', `○ ${device_id} APAGADA`);

  const activeAlert = q.getActiveAlert.get(device_id, 'bomba_sin_efecto');
  if (activeAlert) {
    log.info('BOMBA', `✓ ${device_id} alerta resuelta al apagar`);
    resolveAlert(device_id, 'bomba_sin_efecto');
  }
}

function handleBombaEstado(device_id, estado) {
  if (estado === 'on') {
    const lastReading = q.getLastReading.get(device_id);
    const nivel = lastReading ? lastReading.nivel_pct : 0;
    registrarInicio(device_id, nivel);
  } else if (estado === 'off') {
    registrarFin(device_id);
  }
}

function check() {
  const now = Date.now();
  const umbralMs = config.rules.bombaSinEfecto.minutosEncendida * 60 * 1000;
  const nivelMinimo = config.rules.bombaSinEfecto.nivelSubioMinimo;

  bombasEncendidas.forEach((data, device_id) => {
    const elapsed = now - data.ts_inicio;

    if (elapsed < umbralMs) return;

    const lastReading = q.getLastReading.get(device_id);
    if (!lastReading) return;

    const subio = lastReading.nivel_pct - data.nivel_inicio;
    const activeAlert = q.getActiveAlert.get(device_id, 'bomba_sin_efecto');

    if (subio < nivelMinimo && !activeAlert) {
      const minutos = Math.floor(elapsed / 60000);
      log.warn('BOMBA', `⚠ ${device_id} sin efecto: ${minutos} min, subió ${subio.toFixed(1)}%`);
      createAlert(
        device_id,
        'bomba_sin_efecto',
        `Bomba encendida ${minutos} min, nivel subió solo ${subio.toFixed(1)}%`
      );
    }

    if (subio >= nivelMinimo && activeAlert) {
      log.info('BOMBA', `✓ ${device_id} nivel subió ${subio.toFixed(1)}%, alerta resuelta`);
      resolveAlert(device_id, 'bomba_sin_efecto');
    }
  });
}

function start() {
  log.info('BOMBA', `Monitor iniciando (umbral: ${config.rules.bombaSinEfecto.minutosEncendida} min, nivel mínimo: ${config.rules.bombaSinEfecto.nivelSubioMinimo}%)`);
  const interval = setInterval(check, 60000);
  return interval;
}

module.exports = { handleBombaEstado, start, check };
