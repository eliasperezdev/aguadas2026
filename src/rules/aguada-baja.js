const q = require('../db/queries');
const config = require('../config');
const { createAlert, resolveAlert } = require('../notify/alert');
const log = require('../logger');

function handleNivel(device_id, nivel_pct) {
  const umbralMin = config.rules.aguadaBaja.nivelPctMinimo;
  const umbralRec = config.rules.aguadaBaja.nivelPctRecuperacion;

  const activeAlert = q.getActiveAlert.get(device_id, 'aguada_baja');
  const estado = activeAlert ? 'alertado' : 'normal';

  if (estado === 'normal' && nivel_pct < umbralMin) {
    log.warn('AGUADA', `⚠ ${device_id} nivel bajo: ${nivel_pct.toFixed(1)}% (mín: ${umbralMin}%)`);
    createAlert(
      device_id,
      'aguada_baja',
      `Aguada ${device_id} en ${nivel_pct.toFixed(1)}% (mínimo: ${umbralMin}%). Posible falla de reposición: revisar flotante, cañería y nivel del tanque.`
    );
  }

  if (estado === 'alertado' && nivel_pct >= umbralRec) {
    log.info('AGUADA', `✓ ${device_id} nivel recuperado: ${nivel_pct.toFixed(1)}%`);
    resolveAlert(device_id, 'aguada_baja');
  }
}

module.exports = { handleNivel };
