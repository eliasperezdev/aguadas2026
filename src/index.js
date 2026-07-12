const db = require('./db/init');
const { createClient } = require('./mqtt/client');
const mailer = require('./notify/mailer');
const { checkReminders } = require('./notify/alert');
const { sendWeeklyReports } = require('./reports/weekly');
const config = require('./config');
const watchdog = require('./rules/watchdog');
const bombaSinEfecto = require('./rules/bomba-sin-efecto');
const log = require('./logger');
const cron = require('node-cron');

async function main() {
  console.log("Hola mundo")
  log.info('SERVER', '=== Servidor Granja ===');

  await mailer.init();

  const mqttClient = createClient();

  const watchdogInterval = watchdog.start();
  const bombaInterval = bombaSinEfecto.start();

  const gracePeriodMs = 2 * 60 * 1000;
  const graceTimeout = setTimeout(() => {
    log.info('WATCHDOG', 'Grace period finalizado, monitoreo activo');
    watchdog.resume();
  }, gracePeriodMs);
  log.info('WATCHDOG', `Grace period de ${gracePeriodMs / 1000}s antes de alertar dispositivos caídos`);

  const reminderIntervalMs = 60 * 60 * 1000;
  const reminderInterval = setInterval(() => {
    checkReminders('aguada_baja', config.rules.aguadaBaja.reminderCooldownMs);
    checkReminders('bomba_sin_efecto', config.rules.bombaSinEfecto.reminderCooldownMs);
    checkReminders('dispositivo_caido', config.watchdog.reminderCooldownMs);
  }, reminderIntervalMs);

  const reportSchedule = config.reports.weeklySchedule || '0 8 * * 1';
  cron.schedule(reportSchedule, async () => {
    log.info('CRON', 'Ejecutando reportes semanales...');
    try {
      await sendWeeklyReports();
    } catch (err) {
      log.error('CRON', 'Error en reportes semanales:', err.message);
    }
  });
  log.info('CRON', `Reportes semanales programados: ${reportSchedule}`);

  function shutdown() {
    log.info('SERVER', 'Cerrando...');
    clearTimeout(graceTimeout);
    clearInterval(watchdogInterval);
    clearInterval(bombaInterval);
    clearInterval(reminderInterval);
    mqttClient.end();
    db.close();
    log.info('SERVER', 'Adiós');
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  log.error('SERVER', 'Error fatal:', err);
  process.exit(1);
});
