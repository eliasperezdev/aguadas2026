const mqtt = require('mqtt');
const config = require('../config');
const { parse } = require('./parser');
const { handleMessage } = require('./handler');
const log = require('../logger');

function createClient() {
  const client = mqtt.connect(config.mqtt.brokerUrl, {
    clientId: `granja-server-${Date.now()}`,
    clean: true,
    reconnectPeriod: 5000,
    username: config.mqtt.username,
    password: config.mqtt.password
  });

  client.on('connect', () => {
    log.info('MQTT', 'Conectado a', config.mqtt.brokerUrl);
    config.mqtt.topics.forEach(topic => {
      client.subscribe(topic, (err) => {
        if (err) log.error('MQTT', 'Error suscribiendo a', topic, err);
        else log.info('MQTT', 'Suscrito a', topic);
      });
    });
  });

  client.on('message', (topic, payload) => {
    const raw = payload.toString();
    log.info('MQTT', `← ${topic} = ${raw}`);

    const parsed = parse(topic);
    if (!parsed) {
      log.warn('MQTT', 'Topic no reconocido:', topic);
      return;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }

    handleMessage(parsed, data);
  });

  client.on('error', (err) => {
    log.error('MQTT', 'Error:', err.message);
  });

  client.on('offline', () => {
    log.warn('MQTT', 'Cliente offline');
  });

  client.on('reconnect', () => {
    log.info('MQTT', 'Reconectando...');
  });

  return client;
}

module.exports = { createClient };
