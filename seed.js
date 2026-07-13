
require('dotenv').config();
const q = require('./src/db/queries');
const db = require('./src/db/init');
 
const MINUTE = 60000;
const HOUR = 3600000;
const DAY = 86400000;
 
function noise(amplitude) {
  return (Math.random() - 0.5) * 2 * amplitude;
}
 
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
 
function round1(val) {
  return Math.round(val * 10) / 10;
}
 
// ---------------------------------------------------------------
// AGUADA (A1)
// Modelo real: se carga por GRAVEDAD desde el tanque, con un
// flotante que corta la carga cuando llega arriba. Mientras el
// flotante funciona y el tanque tiene agua, el nivel se mantiene
// casi siempre lleno y estable (el flotante compensa el consumo
// de los animales solo). NO depende de la lluvia.
//
// El nivel baja de forma sostenida SOLO cuando falla la reposición:
// el flotante se traba, se tapa la cañería, o el tanque de arriba
// se queda sin presión/agua. Acá simulamos un único evento así
// durante la semana, para poder mostrar la alerta disparando y
// después recuperándose.
// ---------------------------------------------------------------
function seedAguada() {
  const STEP_MIN = 20;
  const now = Date.now();
  const inicioSemana = now - 7 * DAY;
  let ts = inicioSemana;
  let nivel = 90; // arranca casi llena, es el estado normal
  const readings = [];
 
  const dtHoras = STEP_MIN / 60;
 
  const NIVEL_OBJETIVO = 90;   // el flotante intenta mantenerla cerca de acá
  const NIVEL_CIERRE = 95;     // el flotante corta la carga acá (tope físico)
  const REPOSICION_POR_HORA = 15; // qué tan rápido repone el flotante cuando está abierto
 
  // Ventana de falla: no hay reposición (flotante trabado / tanque bajo /
  // cañería tapada — para la simulación da igual la causa exacta).
  // Arranca en el día 2 y dura ~3.5 días, dejando tramos normales
  // antes y después para que se note el contraste en el gráfico.
  const falla = {
    inicio: inicioSemana + 2 * DAY,
    fin: inicioSemana + 2 * DAY + 84 * HOUR,
  };
 
  while (ts < now) {
    const hora = new Date(ts).getHours();
    const esDeDia = hora >= 6 && hora <= 20;
    const enFalla = ts >= falla.inicio && ts < falla.fin;
 
    // Consumo de los animales: siempre presente, un poco más de día.
    const consumoPorHora = esDeDia ? 1.2 : 0.4;
    nivel -= consumoPorHora * dtHoras + noise(0.05);
 
    // El flotante repone SOLO si no estamos en la ventana de falla.
    if (!enFalla && nivel < NIVEL_OBJETIVO) {
      nivel += REPOSICION_POR_HORA * dtHoras;
    }
 
    nivel = clamp(nivel, 0, NIVEL_CIERRE);
 
    const distancia = 25 + (100 - nivel) * 1.4;
    readings.push({
      device_id: 'A1',
      ts,
      distancia_cm: round1(distancia),
      nivel_pct: round1(nivel),
    });
 
    ts += STEP_MIN * MINUTE;
  }
 
  return readings;
}
 
// ---------------------------------------------------------------
// TANQUE (T1)
// Mismo principio: dt fijo, tasas por hora. La bomba llena rápido
// (tasa alta), el consumo varía según hora pico / noche.
// ---------------------------------------------------------------
function seedTanque() {
  const STEP_MIN = 10;
  const now = Date.now();
  let ts = now - 7 * DAY;
  let nivel = 65;
  let bombaOn = false;
  const readings = [];
 
  const dtHoras = STEP_MIN / 60;
 
  while (ts < now) {
    const hora = new Date(ts).getHours();
    const esHoraPico = (hora >= 7 && hora <= 9) || (hora >= 18 && hora <= 20);
    const esDeNoche = hora >= 23 || hora <= 5;
 
    if (!bombaOn && nivel <= 32) bombaOn = true;
    if (bombaOn && nivel >= 88) bombaOn = false;
 
    if (bombaOn) {
      nivel += 40 * dtHoras + noise(1); // llena ~40%/hora
    } else {
      const consumoPorHora = esHoraPico ? 3 : (esDeNoche ? 0.5 : 1.5);
      nivel -= consumoPorHora * dtHoras + noise(0.2);
    }
 
    nivel = clamp(nivel, 28, 92);
 
    const distancia = 15 + (100 - nivel) * 0.75;
    readings.push({
      device_id: 'T1',
      ts,
      distancia_cm: round1(distancia),
      nivel_pct: round1(nivel),
      bomba: bombaOn ? 'on' : 'off',
    });
 
    ts += STEP_MIN * MINUTE;
  }
 
  return readings;
}
 
function run() {
  console.log('=== Seed de datos realistas ===\n');
 
  const deleteReadings = db.prepare('DELETE FROM readings WHERE device_id IN (?, ?)');
  const deletePumpEvents = db.prepare('DELETE FROM pump_events WHERE device_id IN (?, ?)');
  const deleteAlerts = db.prepare('DELETE FROM alerts WHERE device_id IN (?, ?)');
  const deleteDevices = db.prepare('DELETE FROM devices WHERE id IN (?, ?)');

  deleteReadings.run('A1', 'T1');
  deletePumpEvents.run('A1', 'T1');
  deleteAlerts.run('A1', 'T1');
  deleteDevices.run('A1', 'T1');
  console.log('Datos anteriores limpiados\n');
 
  const now = Date.now();
  q.upsertDevice.run('A1', 'aguada', now);
  q.upsertDevice.run('T1', 'tanque', now);
 
  const readingsA1 = seedAguada();
  const readingsT1 = seedTanque();
 
  const insertMany = db.transaction((readings) => {
    for (const r of readings) {
      q.insertReading.run(r.device_id, r.ts, r.distancia_cm, r.nivel_pct);
    }
  });
 
  insertMany(readingsA1);
  insertMany(readingsT1);
 
  console.log(`A1 (aguada): ${readingsA1.length} lecturas`);
  console.log(`   Período: ${new Date(readingsA1[0].ts).toLocaleString('es-AR')} -> ${new Date(readingsA1[readingsA1.length - 1].ts).toLocaleString('es-AR')}`);
  console.log(`   Nivel: ${Math.min(...readingsA1.map(r => r.nivel_pct)).toFixed(1)}% - ${Math.max(...readingsA1.map(r => r.nivel_pct)).toFixed(1)}%`);
  console.log(`   Eventos: 1 falla de reposición (~día 2 a 5.5, sin flotante/carga)`);
 
  console.log(`\nT1 (tanque): ${readingsT1.length} lecturas`);
  console.log(`   Período: ${new Date(readingsT1[0].ts).toLocaleString('es-AR')} -> ${new Date(readingsT1[readingsT1.length - 1].ts).toLocaleString('es-AR')}`);
  console.log(`   Nivel: ${Math.min(...readingsT1.map(r => r.nivel_pct)).toFixed(1)}% - ${Math.max(...readingsT1.map(r => r.nivel_pct)).toFixed(1)}%`);
  console.log(`   Histéresis: 32% - 88%`);
 
  console.log(`\nTotal: ${readingsA1.length + readingsT1.length} lecturas`);
  console.log('\n=== Seed completado ===');
 
  db.close();
}
 
run();