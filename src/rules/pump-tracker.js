const q = require('../db/queries');
const log = require('../logger');

function handleBombaEstado(device_id, estado) {
  const now = Date.now();

  if (estado === 'on') {
    const lastReading = q.getLastReading.get(device_id);
    const nivel = lastReading ? lastReading.nivel_pct : null;

    q.insertPumpEvent.run(device_id, now, null, nivel, null, null);
    log.info('PUMP', `${device_id} ciclo iniciado, nivel: ${nivel}%`);
  }

  if (estado === 'off') {
    const openEvent = q.getOpenPumpEvent.get(device_id);
    if (!openEvent) {
      log.warn('PUMP', `${device_id} apagada sin evento abierto`);
      return;
    }

    const lastReading = q.getLastReading.get(device_id);
    const nivel = lastReading ? lastReading.nivel_pct : null;
    const duracion = Math.floor((now - openEvent.ts_inicio) / 1000);

    q.closePumpEvent.run(now, nivel, duracion, openEvent.id);
    log.info('PUMP', `${device_id} ciclo cerrado: ${duracion}s, nivel ${openEvent.nivel_inicio}% → ${nivel}%`);
  }
}

module.exports = { handleBombaEstado };
