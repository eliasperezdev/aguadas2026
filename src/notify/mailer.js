const nodemailer = require('nodemailer');
const config = require('../config');
const log = require('../logger');

let transporter;

async function init() {
  if (config.notify.smtp.user && config.notify.smtp.pass) {
    transporter = nodemailer.createTransport({
      host: config.notify.smtp.host,
      port: config.notify.smtp.port,
      secure: config.notify.smtp.secure,
      auth: {
        user: config.notify.smtp.user,
        pass: config.notify.smtp.pass
      }
    });
    log.info('MAIL', 'Transporter configurado con SMTP real');
  } else {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    log.info('MAIL', 'Transporter de prueba (Ethereal):', testAccount.user);
  }
}

async function send(subject, text, html) {
  if (!transporter) {
    log.warn('MAIL', 'Transporter no inicializado');
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: config.notify.from,
      to: config.notify.to,
      subject,
      text,
      html
    });

    log.info('MAIL', `Enviado: ${subject}`);

    if (info.messageId && info.messageId.includes('ethereal')) {
      log.info('MAIL', 'Preview URL:', nodemailer.getTestMessageUrl(info));
    }

    return true;
  } catch (err) {
    log.error('MAIL', 'Error enviando:', err.message);
    return false;
  }
}

async function sendAlert(alert) {
  return send(
    `[ALERTA] ${alert.tipo} - ${alert.device_id}`,
    `${alert.mensaje}\n\nDevice: ${alert.device_id}\nTipo: ${alert.tipo}\nTimestamp: ${new Date(alert.ts).toISOString()}`,
    `<p><strong>${alert.mensaje}</strong></p><p>Device: ${alert.device_id}<br>Tipo: ${alert.tipo}<br>Timestamp: ${new Date(alert.ts).toISOString()}</p>`
  );
}

async function sendResolution(alert) {
  return send(
    `[RESUELTO] ${alert.tipo} - ${alert.device_id}`,
    `Alerta resuelta: ${alert.mensaje}\n\nDevice: ${alert.device_id}\nTipo: ${alert.tipo}`,
    `<p><strong>Alerta resuelta:</strong> ${alert.mensaje}</p><p>Device: ${alert.device_id}<br>Tipo: ${alert.tipo}</p>`
  );
}

async function sendReminder(alert, horasActiva) {
  return send(
    `[RECORDATORIO] ${alert.tipo} - ${alert.device_id} (${horasActiva}hs activa)`,
    `La alerta sigue activa tras ${horasActiva}hs:\n${alert.mensaje}\n\nDevice: ${alert.device_id}\nTipo: ${alert.tipo}\nDesde: ${new Date(alert.ts).toISOString()}`,
    `<p><strong>La alerta sigue activa tras ${horasActiva}hs:</strong></p><p>${alert.mensaje}</p><p>Device: ${alert.device_id}<br>Tipo: ${alert.tipo}<br>Desde: ${new Date(alert.ts).toISOString()}</p>`
  );
}

async function sendWithAttachments(subject, text, attachments) {
  if (!transporter) {
    log.warn('MAIL', 'Transporter no inicializado');
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: config.notify.from,
      to: config.notify.to,
      subject,
      text,
      attachments: attachments.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType
      }))
    });

    log.info('MAIL', `Enviado con adjuntos: ${subject} (${attachments.length} archivo(s))`);

    if (info.messageId && info.messageId.includes('ethereal')) {
      log.info('MAIL', 'Preview URL:', nodemailer.getTestMessageUrl(info));
    }

    return true;
  } catch (err) {
    log.error('MAIL', 'Error enviando con adjuntos:', err.message);
    return false;
  }
}

module.exports = { init, sendAlert, sendResolution, sendReminder, sendWithAttachments };
