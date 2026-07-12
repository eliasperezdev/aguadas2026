const q = require('../db/queries');
const aguadaBaja = require('../rules/aguada-baja');
const bombaSinEfecto = require('../rules/bomba-sin-efecto');
const pumpTracker = require('../rules/pump-tracker');
const log = require('../logger');

function handleMessage(parsed, data) {
  const { tipo, device_id, campo } = parsed;
  const ts = Date.now();

  log.info('HANDLER', `${tipo}/${device_id} → ${campo}`);

  q.upsertDevice.run(device_id, tipo, ts);

  if (campo === 'nivel') {
    log.info('PAYLOAD', `Datos recibidos: ${JSON.stringify(data)}`);
    const { distancia_cm, nivel_pct } = data;
    
    const lastReading = q.getLastReading.get(device_id);
    const shouldInsert = !lastReading || 
      Math.abs(lastReading.nivel_pct - nivel_pct) >= 1 ||
      Math.abs(lastReading.distancia_cm - distancia_cm) >= 1;
    
    if (shouldInsert) {
      q.insertReading.run(device_id, ts, distancia_cm, nivel_pct);
      log.info('DB', `✓ Reading: ${device_id} | ${distancia_cm}cm | ${nivel_pct}%`);
    } else {
      log.info('DB', `⊘ Skip duplicado: ${device_id} | ${distancia_cm}cm | ${nivel_pct}%`);
    }

    if (tipo === 'aguada') {
      aguadaBaja.handleNivel(device_id, nivel_pct);
    }
  }

  if (campo === 'bomba/estado') {
    const estado = typeof data === 'string' ? data : data.toString();
    log.info('BOMBA', `${device_id} → ${estado.toUpperCase()}`);
    bombaSinEfecto.handleBombaEstado(device_id, estado);
    pumpTracker.handleBombaEstado(device_id, estado);
  }

  if (campo === 'status') {
    log.info('STATUS', `${device_id} = ${data}`);
  }
}

module.exports = { handleMessage };
