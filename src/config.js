require('dotenv').config();

module.exports = {
  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    username: process.env.MQTT_USER || '',
    password: process.env.MQTT_PASS || '',
    topics: [
      'granja/tanque/+/nivel',
      'granja/tanque/+/bomba/estado',
      'granja/aguada/+/nivel',
      'granja/+/+/status'
    ]
  },

  db: {
    path: process.env.DB_PATH || './data/granja.sqlite'
  },

  watchdog: {
    checkIntervalMs: parseInt(process.env.WATCHDOG_CHECK_INTERVAL_MS) || 120000,
    offlineThresholdMs: parseInt(process.env.WATCHDOG_OFFLINE_THRESHOLD_MS) || 300000,
    reminderCooldownMs: parseInt(process.env.WATCHDOG_REMINDER_COOLDOWN_MS) || 21600000
  },

  rules: {
    bombaSinEfecto: {
      minutosEncendida: parseInt(process.env.BOMBA_MINUTOS_ENCENDIDA) || 10,
      nivelSubioMinimo: parseInt(process.env.BOMBA_NIVEL_SUBIO_MINIMO) || 2,
      reminderCooldownMs: parseInt(process.env.BOMBA_REMINDER_COOLDOWN_MS) || 10800000
    },
    aguadaBaja: {
      nivelPctMinimo: parseInt(process.env.AGUADA_NIVEL_PCT_MINIMO) || 20,
      nivelPctRecuperacion: parseInt(process.env.AGUADA_NIVEL_PCT_RECUPERACION) || 35,
      reminderCooldownMs: parseInt(process.env.AGUADA_REMINDER_COOLDOWN_MS) || 86400000
    }
  },

  notify: {
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    },
    from: process.env.NOTIFY_FROM || 'granja@alertas.com',
    to: process.env.NOTIFY_TO || 'elias@example.com'
  },

  reports: {
    weeklySchedule: process.env.REPORT_WEEKLY_SCHEDULE || '0 8 * * 1'
  }
};
