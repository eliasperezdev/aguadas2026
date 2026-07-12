function generateReport(devicesData, fechaInicio, fechaFin) {
  const sections = devicesData.map(({ deviceId, tipo, readings }) => {
    const datos = readings.map(r => ({
      ts: r.ts,
      nivel_pct: r.nivel_pct,
      distancia_cm: r.distancia_cm,
      fecha: new Date(r.ts).toLocaleString('es-AR')
    }));

    const minNivel = Math.min(...datos.map(d => d.nivel_pct));
    const maxNivel = Math.max(...datos.map(d => d.nivel_pct));
    const avgNivel = (datos.reduce((sum, d) => sum + d.nivel_pct, 0) / datos.length).toFixed(1);
    const label = tipo === 'tanque' ? 'Tanque' : 'Aguada';
    const color = tipo === 'tanque' ? '#e67e22' : '#3498db';
    const colorBg = tipo === 'tanque' ? 'rgba(230, 126, 34, 0.1)' : 'rgba(52, 152, 219, 0.1)';
    const canvasId = `chart-${deviceId}`;

    return {
      deviceId,
      label,
      datos,
      stats: { minNivel, maxNivel, avgNivel, count: datos.length },
      color,
      colorBg,
      canvasId
    };
  });

  const statsHtml = sections.map(s => `
    <div class="device-section">
      <h2>${s.label} ${s.deviceId}</h2>
      <div class="stats">
        <div class="stat-card">
          <div class="stat-label">Nivel Mínimo</div>
          <div class="stat-value">${s.stats.minNivel.toFixed(1)}<span class="stat-unit">%</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Nivel Máximo</div>
          <div class="stat-value">${s.stats.maxNivel.toFixed(1)}<span class="stat-unit">%</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Nivel Promedio</div>
          <div class="stat-value">${s.stats.avgNivel}<span class="stat-unit">%</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Lecturas</div>
          <div class="stat-value">${s.stats.count}</div>
        </div>
      </div>
      <div class="chart-container">
        <canvas id="${s.canvasId}"></canvas>
      </div>
    </div>
  `).join('\n');

  const scripts = sections.map(s => `
    (function() {
      var datos = ${JSON.stringify(s.datos)};
      var ctx = document.getElementById('${s.canvasId}').getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: datos.map(function(d) { return d.fecha; }),
          datasets: [{
            label: '${s.label} ${s.deviceId} - Nivel (%)',
            data: datos.map(function(d) { return d.nivel_pct; }),
            borderColor: '${s.color}',
            backgroundColor: '${s.colorBg}',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 2,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              mode: 'index',
              intersect: false,
              callbacks: {
                label: function(context) {
                  return 'Nivel: ' + context.parsed.y.toFixed(1) + '%';
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              title: { display: true, text: 'Nivel (%)' },
              ticks: { callback: function(v) { return v + '%'; } }
            },
            x: {
              title: { display: true, text: 'Fecha y Hora' },
              ticks: { maxRotation: 45, minRotation: 45 }
            }
          },
          interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
      });
    })();
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte Semanal Granja - ${new Date(fechaInicio).toLocaleDateString('es-AR')}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f5f5f5;
      padding: 20px;
      color: #333;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      padding: 30px;
    }
    h1 { color: #2c3e50; margin-bottom: 10px; font-size: 28px; }
    h2 { color: #34495e; margin-bottom: 20px; font-size: 22px; padding-bottom: 10px; border-bottom: 2px solid #ecf0f1; }
    .subtitle { color: #7f8c8d; margin-bottom: 30px; font-size: 14px; }
    .device-section { margin-bottom: 50px; }
    .device-section:last-child { margin-bottom: 0; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 25px;
    }
    .stat-card { background: #ecf0f1; padding: 15px; border-radius: 6px; text-align: center; }
    .stat-label { font-size: 11px; color: #7f8c8d; text-transform: uppercase; margin-bottom: 6px; }
    .stat-value { font-size: 28px; font-weight: bold; color: #2c3e50; }
    .stat-unit { font-size: 14px; color: #7f8c8d; }
    .chart-container { position: relative; height: 350px; margin-bottom: 20px; }
    .footer {
      text-align: center; color: #95a5a6; font-size: 12px;
      margin-top: 40px; padding-top: 20px; border-top: 1px solid #ecf0f1;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Reporte Semanal Granja</h1>
    <p class="subtitle">
      Período: ${new Date(fechaInicio).toLocaleDateString('es-AR')} - ${new Date(fechaFin).toLocaleDateString('es-AR')}
      | Generado: ${new Date().toLocaleString('es-AR')}
    </p>

    ${statsHtml}

    <div class="footer">
      Sistema de Monitoreo de Granja | Reporte generado automáticamente
    </div>
  </div>

  <script>
    ${scripts}
  </script>
</body>
</html>`;
}

module.exports = { generateReport };
