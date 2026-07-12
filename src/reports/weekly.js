const q = require('../db/queries');
const { generateReport } = require('./generator');
const mailer = require('../notify/mailer');
const log = require('../logger');

async function sendWeeklyReports() {
  const now = Date.now();
  const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

  log.info('REPORT', 'Generando reporte semanal...');

  const devices = q.getAllDevices.all();
  const devicesData = [];

  for (const device of devices) {
    const readings = q.getReadingsByDeviceSince.all(device.id, oneWeekAgo);

    if (readings.length === 0) {
      log.info('REPORT', `Sin datos para ${device.id}, omitiendo`);
      continue;
    }

    devicesData.push({
      deviceId: device.id,
      tipo: device.tipo,
      readings
    });

    log.info('REPORT', `${device.id} (${device.tipo}): ${readings.length} lecturas`);
  }

  if (devicesData.length === 0) {
    log.info('REPORT', 'No hay datos para reportar esta semana');
    return;
  }

  const fecha = new Date().toISOString().split('T')[0];
  const filename = `reporte-granja-${fecha}.html`;
  const html = generateReport(devicesData, oneWeekAgo, now);

  const sent = await mailer.sendWithAttachments(
    `Reporte Semanal Granja - ${new Date().toLocaleDateString('es-AR')}`,
    `Adjunto el reporte semanal con ${devicesData.length} dispositivo(s).`,
    [{ filename, content: html, contentType: 'text/html' }]
  );

  if (sent) {
    log.info('REPORT', `Reporte enviado: ${filename}`);
  } else {
    log.error('REPORT', 'Error enviando reporte semanal');
  }
}

module.exports = { sendWeeklyReports };
