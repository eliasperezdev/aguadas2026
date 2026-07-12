function ts() {
  return new Date().toISOString();
}

function log(prefix, ...args) {
  console.log(`[${ts()}] [${prefix}]`, ...args);
}

function info(prefix, ...args) {
  console.log(`[${ts()}] [${prefix}]`, ...args);
}

function warn(prefix, ...args) {
  console.warn(`[${ts()}] [${prefix}]`, ...args);
}

function error(prefix, ...args) {
  console.error(`[${ts()}] [${prefix}]`, ...args);
}

module.exports = { log, info, warn, error };
