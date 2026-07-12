require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function run() {
  const mailer = require('../src/notify/mailer');
  const { sendWeeklyReports } = require('../src/reports/weekly');

  console.log('=== Demo: Reporte semanal (trigger manual) ===\n');

  await mailer.init();
  await sendWeeklyReports();

  console.log('\n=== Listo. Revisá tu mail. ===');
  process.exit(0);
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
