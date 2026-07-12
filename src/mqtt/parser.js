const TOPIC_RE = /^granja\/(tanque|aguada)\/([^/]+)\/(.+)$/;

function parse(topic) {
  const m = topic.match(TOPIC_RE);
  if (!m) return null;

  const [, tipo, id, campo] = m;
  const device_id = id;

  return { tipo, device_id, campo };
}

module.exports = { parse };
