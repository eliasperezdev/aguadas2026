# Proyecto: Monitoreo de tanque y aguadas (granja)

## Resumen

Sistema de control y monitoreo para una granja/campo:

- Un **tanque elevado** con control automático de bomba (independiente, cerrado, no depende de nada externo).
- Una o más **aguadas** (hoy: una sola por practicidad, el diseño debe soportar varias) que se alimentan por **gravedad desde el tanque**, reguladas por un **flotante** que mantiene el nivel casi siempre lleno. Solo se monitorean para estadísticas y alertas — no controlan nada. Un nivel bajo sostenido en la aguada indica una **falla de reposición** (flotante trabado, cañería tapada, o tanque sin agua/presión suficiente), no un problema meteorológico.
- Un **ESP32** con dos sensores ultrasónicos (tanque + aguada) y un relay (bomba) publica por MQTT.
- Un **Raspberry Pi** corre Mosquitto (broker) y un servidor en **Node.js** que escucha, guarda en **SQLite** y manda alertas por **nodemailer**.

Filosofía: el control de la bomba nunca debe depender del servidor ni de la red — toda la lógica de histéresis vive en el ESP32. El servidor es solo para estadísticas, alertas y visibilidad. Si el server o el wifi se caen, la bomba sigue funcionando sola.

## Estado actual

Ya resuelto y probado en simulación (Wokwi):
- Firmware del ESP32 (`sketch.ino`) con lectura de ambos sensores, lógica de histéresis de bomba, deadband + heartbeat, LWT.
- `diagram.json` funcionando en Wokwi con la placa `board-esp32-devkit-c-v4`.

Servidor Node (implementado y funcionando):
- Conexión MQTT con suscripciones wildcards.
- Persistencia en SQLite (4 tablas: devices, readings, pump_events, alerts).
- Watchdog de liveness (detecta dispositivos caídos).
- Motor de reglas básico (aguada baja, bomba sin efecto, dispositivo caído).
- Notificación por mail con nodemailer + cooldown.
- Logs estructurados con timestamps ISO.
- Configuración por variables de entorno (.env).

Pendiente (refactor de lógica de alertas):
- Migrar de lógica level-triggered a edge-triggered con histéresis de dos umbrales (ver sección "Lógica de alertas").
- Agregar cooldown de recordatorio para alertas que persisten varios días.

## Hardware

- **Placa**: ESP32 DevKit-C v4 (simulado en Wokwi como `board-esp32-devkit-c-v4`).
- **Sensor 1 (tanque)**: HC-SR04 — TRIG en GPIO25, ECHO en GPIO26.
- **Sensor 2 (aguada)**: HC-SR04 — TRIG en GPIO27, ECHO en GPIO14.
- **Relay (bomba)**: IN en GPIO33.

Nota Wokwi: en esta placa los pines se referencian por número de GPIO puro (`esp:25`, no `esp:D25`). El D1 mini (ESP8266, descartado, ya no se usa) sí usaba prefijo `D`.

## Lógica del firmware (ya implementada)

### Bomba (tanque) — histéresis
- Prende la bomba si `nivel_pct <= NIVEL_MIN_PCT` (30%).
- Apaga la bomba si `nivel_pct >= NIVEL_MAX_PCT` (90%).
- Entre esos dos valores no hace nada (evita flapping).
- Esta lógica corre siempre, en cada ciclo de lectura, sin importar si se publica o no por MQTT.

### Filtro de publicación (deadband + heartbeat)
Para no saturar de datos ruidosos del sensor ultrasónico:
- Se publica si la distancia cambió más que un umbral (`UMBRAL_CM_TANQUE = 1.5`, `UMBRAL_CM_AGUADA = 2.0`) respecto a la última lectura publicada.
- Se publica igual (heartbeat) si pasó `HEARTBEAT_MS` (hoy 60s para pruebas; en producción debería ser más largo, ej. 15-60 min) desde la última publicación, aunque no haya cambio — esto evita huecos ambiguos en el histórico.
- El estado "última lectura publicada" se guarda en RAM (variables globales), no hay necesidad de persistencia en el ESP.

### Liveness / detección de caídas (importante, decisión de diseño)
El problema: si el nivel no cambia, el ESP no publica nada (por el deadband), y eso genera un hueco ambiguo entre "no cambió nada" y "el dispositivo murió". Se resuelve con **dos mecanismos combinados, no uno solo**:

1. **LWT (Last Will and Testament) de MQTT**: al conectar, el ESP registra un mensaje `"offline"` retenido en su topic de `status`, que el **broker** publica automáticamente si detecta que la conexión se cortó (vía keepalive TCP), sin que el ESP tenga que hacer nada. Esto ya está en el firmware.
2. **Watchdog en el servidor**: el server mantiene un `last_seen` por device_id, actualizado con CUALQUIER mensaje entrante (no solo nivel). Un job periódico (cada 2-5 min) chequea si `ahora - last_seen` supera un umbral, y dispara alerta igual aunque el LWT no haya llegado a tiempo o se haya perdido. Esto es una tarea pendiente del servidor, no del firmware.

**Nota sobre timestamps**: el firmware pone `millis()` en el payload, que solo sirve para medir duraciones dentro de la sesión del ESP (se resetea en cada reinicio). El servidor debe usar su propio `Date.now()` al recibir el mensaje como timestamp real — no confiar en el `ts` del payload para saber "cuándo" pasó algo en términos absolutos.

## Contrato MQTT

Broker: Mosquitto corriendo en el Raspberry Pi.

```
granja/tanque/<id>/nivel         → JSON: { distancia_cm, nivel_pct, bomba, ts }
granja/tanque/<id>/bomba/estado  → "on" | "off"  (retained)
granja/tanque/<id>/status        → "online" | "offline"  (retained, LWT)

granja/aguada/<id>/nivel         → JSON: { distancia_cm, nivel_pct, ts }
granja/aguada/<id>/status        → "online" | "offline"  (retained, LWT)
```

- `<id>` hoy es `T1` (tanque) y `A1` (aguada), pero el diseño debe soportar múltiples aguadas (`A1`, `A2`, ...) sin cambios estructurales — usar wildcards (`granja/aguada/+/nivel`) en las suscripciones del server, nunca hardcodear el id.
- Los topics `bomba/estado` y `status` son `retained` para que el server conozca el último estado sin tener que esperar el próximo evento.

## Responsabilidades del servidor Node

1. **Listener MQTT**: suscribirse a `granja/tanque/+/nivel`, `granja/tanque/+/bomba/estado`, `granja/aguada/+/nivel`, `granja/+/+/status`.
2. **Deduplicación en RAM**: `Map<device_id, {nivel, ts}>` con la última lectura *guardada* (no confundir con el deadband del firmware — esta capa es independiente y opcional, podría no hacer falta si el firmware ya filtra bien; a decidir/discutir al implementar).
3. **Persistencia SQLite** (ver esquema abajo).
4. **Watchdog de liveness**: job periódico que compara `last_seen` de cada device contra un umbral y genera alertas de "dispositivo caído".
5. **Motor de reglas / anomalías** (ver sección "Lógica de alertas"):
   - Bomba encendida mucho tiempo sin que el nivel suba → posible fuga en cañería o bomba defectuosa.
   - Nivel de aguada bajo mínimo → posible falla de reposición (flotante trabado, cañería tapada, o tanque sin agua).
   - Dispositivo sin reportar (ver watchdog).
6. **Notificador por mail (nodemailer)**: con lógica edge-triggered + cooldown de recordatorio (ver sección "Lógica de alertas").
7. (Opcional, más adelante) Endpoint HTTP simple para ver estado actual / gráficos.

## Lógica de alertas (edge-triggered, no level-triggered)

Las alertas NO se disparan evaluando "¿está en mal estado?" en cada mensaje entrante, porque eso mandaría un mail por cada lectura mientras la condición persista. En cambio, se dispara SOLO en el momento en que cambia el estado (cruce de umbral), comparando contra el estado anterior guardado.

Cada alerta monitoreada (ej: "aguada baja") tiene un estado por device_id: `'normal'` | `'alertado'`. Ese estado se puede derivar de la tabla `alerts`: si existe una fila para ese device_id + tipo con `resuelto = 0`, el estado es `'alertado'`; si no existe o está resuelta, es `'normal'`.

### Flujo

1. Llega una lectura de nivel.
2. Se compara el estado guardado (normal/alertado) contra el nuevo nivel.
3. Si estado=`'normal'` Y nivel cruza hacia abajo del umbral mínimo → INSERT en `alerts` (resuelto=0) + enviar mail de alerta + pasar a estado `'alertado'`.
4. Si estado=`'alertado'` Y nivel cruza hacia arriba del umbral de recuperación → UPDATE `alerts` (resuelto=1) + enviar mail opcional de "se resolvió" + pasar a estado `'normal'`.
5. Si no hay cruce (se mantiene en el mismo estado), no se manda nada, salvo que aplique el cooldown de recordatorio (ver abajo).

### Histéresis con dos umbrales (evita flapping)

Igual que la lógica de la bomba, usar DOS umbrales distintos para bajar y para recuperar, nunca el mismo valor para ambos casos. Ejemplo para aguada:
- `NIVEL_MIN_AGUADA` (dispara alerta): 20%
- `NIVEL_RECUPERACION_AGUADA` (marca resuelto): 35%

Mientras el nivel esté entre ambos valores, no cambia de estado. Estos umbrales van en la config del server (no hardcodeados), uno por tipo de alerta.

### Umbrales por tipo de alerta

| Alerta | Umbral de disparo | Umbral de recuperación |
|--------|-------------------|----------------------|
| Aguada baja (falla de reposición) | `nivel_pct < 20%` | `nivel_pct >= 35%` |
| Bomba sin efecto | bomba ON por X min sin que nivel suba Y% | bomba OFF o nivel subió >= Y% |
| Dispositivo caído | `last_seen` > umbral offline | llega cualquier mensaje del device |

### Cooldown = recordatorio, no mecanismo principal

El cooldown ya NO es lo que evita el spam (eso lo resuelve el edge-triggered). Ahora es un recordatorio opcional: si el estado sigue en `'alertado'` y pasaron más de X horas desde `ultima_notificacion`, mandar un mail tipo "sigue el problema, van N días" y actualizar `ultima_notificacion`. Sin este recordatorio, una alerta que dura varios días solo generaría 2 mails (el de inicio y el de resolución), lo cual está bien pero puede no ser suficiente para casos críticos como el tanque.

Valores de partida a usar en el código (dejar como constantes fácilmente ajustables):
- **Aguada baja**: cooldown de recordatorio 24hs
- **Bomba sin efecto (tanque)**: cooldown de recordatorio 2-4hs (más crítico)
- **Dispositivo caído**: avisar al detectar, recordatorio cada 6-12hs si sigue caído

### Patrón común

Todas las alertas del sistema siguen el mismo patrón: **edge-triggered + histéresis de dos umbrales + cooldown de recordatorio**. No solo la de aguada baja.

### Posible mejora futura: cruce de datos tanque-aguada (V2)

La regla de "aguada baja" actualmente dispara una alerta genérica de falla de reposición. En una V2 se podría cruzar el nivel del tanque con el de la aguada para dar un diagnóstico más específico:

- **Aguada baja Y tanque también bajo** → la causa probable es que el tanque no tiene agua/presión suficiente para alimentar la aguada. El mensaje podría sugerir revisar primero el tanque.
- **Aguada baja pero tanque lleno** → la causa probable es una falla mecánica: flotante trabado o cañería tapada entre el tanque y la aguada. El mensaje podría sugerir revisar el flotante y la cañería.

Esto requiere que la regla de aguada consulte el último reading del tanque al momento de generar la alerta. No implementar ahora — la lógica actual es suficiente para detectar el problema, el cruce de datos solo mejora el diagnóstico.

## Entrega de estadísticas (reporte semanal)

Decisión: NO se construye un dashboard ni un servidor HTTP expuesto. El Raspberry Pi NO acepta conexiones entrantes de internet (solo puede salir), así que cualquier opción basada en un link que el usuario abra desde afuera queda descartada de entrada.

En cambio, el cron semanal genera un reporte en **HTML autocontenido** y lo manda como **adjunto** en el mismo mail (no como link, no como imagen embebida en el cuerpo del mail).

### Flujo

1. Job cron (semanal) hace query a SQLite (tabla `readings`) para traer los datos de la semana de cada aguada/tanque.
2. Arma un string HTML completo (con template literals de JS, sin motor de templates) que incluye:
   - Los datos de la semana embebidos como JSON inline (ej: `const datos = {...}`)
   - Un `<canvas>` y un `<script>` que usa **Chart.js cargado desde CDN** (`https://cdn.jsdelivr.net/npm/chart.js`) para dibujar un gráfico de línea con los niveles a lo largo de la semana.
3. Ese HTML se pasa a nodemailer como `attachments` (no como `html` del cuerpo del mail), con filename tipo `reporte-aguada-<id>-<fecha>.html`.
4. El usuario abre el adjunto desde su cliente de mail, se abre en su navegador local, y ahí sí se ejecuta el JS y se ve el gráfico interactivo. El Pi no necesita servir nada ni exponer ningún puerto — todo el trabajo de renderizado ocurre en el navegador del usuario, no en el servidor.

### Importante

- Esto NO es un dashboard. No hay servidor sirviendo HTML, no hay estado persistente de sesión, no hay autenticación. Es un archivo estático generado una vez y enviado.
- El HTML depende de internet en el momento en que el usuario lo ABRE (para bajar Chart.js del CDN). Si en el futuro se detecta que esto es un problema (usuarios sin señal al momento de abrir el reporte), la alternativa es embeber Chart.js completo dentro del HTML en vez de cargarlo por CDN (aumenta el tamaño del adjunto en ~200KB, pero lo hace funcionar offline). No implementar esto todavía, solo dejarlo anotado como alternativa futura.
- Se evaluó usar un VPS externo (ya disponible, con dominio propio) para hostear un reporte con link permanente y siempre actualizado, pero se descartó por ahora: agrega infraestructura (servidor web, certificado HTTPS, mecanismo de subida Pi→VPS) que no es necesaria para cumplir el requerimiento actual (reporte semanal por mail). Queda como posible mejora futura si se quisiera un dashboard con datos en tiempo real.

## Esquema de base de datos (SQLite) — borrador

```sql
devices (
  id TEXT PRIMARY KEY,       -- 'T1', 'A1', etc.
  tipo TEXT,                 -- 'tanque' | 'aguada'
  nombre TEXT,
  ubicacion TEXT,
  last_seen INTEGER,         -- epoch ms, actualizado con cualquier mensaje
  rssi INTEGER,              -- opcional, a futuro
  reconnects INTEGER         -- opcional, a futuro
)

readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT,
  ts INTEGER,                -- epoch ms puesto por el SERVER, no por el ESP
  distancia_cm REAL,
  nivel_pct REAL
)

pump_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_inicio INTEGER,
  ts_fin INTEGER,
  nivel_inicio REAL,
  nivel_fin REAL,
  duracion_s INTEGER
)

alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT,
  tipo TEXT,                 -- 'bomba_sin_efecto' | 'aguada_baja' | 'dispositivo_caido' | ...
  mensaje TEXT,
  ts INTEGER,
  resuelto INTEGER DEFAULT 0,
  ultima_notificacion INTEGER  -- para el cooldown de mails
)
```

Pendiente de decidir al implementar: estrategia de purga/agregación de `readings` a largo plazo (promediar por hora/día y purgar detalle crudo después de N días), para que la tabla no crezca sin control.

## Stack

- **Firmware**: Arduino framework sobre ESP32 (`WiFi.h`, `PubSubClient`).
- **Simulación**: Wokwi (`sketch.ino` + `diagram.json`).
- **Broker**: Mosquitto en Raspberry Pi.
- **Server**: Node.js puro. Sin framework web (Express/Fastify) para el core — no hace falta, el listener MQTT no recibe requests HTTP, es solo lógica de negocio sobre el cliente `mqtt`. Si en el futuro se agrega un dashboard/API HTTP, usar **Fastify** (más liviano en CPU/memoria que Express, mejor para correr en Raspberry Pi junto con Mosquitto) — no antes de que haga falta.
- **Cliente MQTT**: librería `mqtt` (npm).
- **DB**: SQLite con `better-sqlite3` directo, **sin ORM**. Razones: el esquema es chico (4 tablas), la API síncrona de `better-sqlite3` es en realidad mejor para el modelo de un solo escritor de SQLite, y evita una capa de abstracción innecesaria para este tamaño de proyecto. Si en algún momento el código de queries se vuelve repetitivo o difícil de mantener, evaluar sumar **Drizzle ORM** encima (usa el mismo `better-sqlite3` por debajo, migración sería incremental, no una reescritura).
- **Mail**: nodemailer.

## Convenciones / decisiones ya tomadas (no reabrir sin razón)

- La lógica de la bomba vive únicamente en el firmware. El server nunca decide si la bomba prende o apaga.
- Todo lo relacionado a aguadas debe diseñarse pensando en N aguadas, aunque hoy exista una sola.
- Usar wildcards MQTT (`+`) en las suscripciones, nunca ids hardcodeados.
- Timestamps "de verdad" los pone el server al recibir el mensaje, no el ESP.
- Las alertas son edge-triggered (se disparan en el cruce de umbral, no evaluando estado en cada mensaje). El cooldown es solo para recordatorios de alertas que persisten, no para evitar spam. Ver sección "Lógica de alertas".
- Sin ORM y sin framework web por ahora (ver sección Stack) — no agregar Express/Fastify/Drizzle/Prisma "por las dudas"; solo si surge una necesidad concreta que lo justifique.

## Testing y demo del reporte semanal

El reporte semanal necesita una semana de datos históricos, que no se pueden generar esperando tiempo real. Estrategia:

- El schedule del cron NO está hardcodeado en el código — se lee de la variable de entorno `REPORT_WEEKLY_SCHEDULE` (formato cron estándar, ej: `0 8 * * 1` = lunes 8am). Esto permite cambiar la frecuencia sin tocar código, tanto en producción como para pruebas (ej: setearlo a `*/2 * * * *` para que dispare cada 2 min durante una demo).
- Existe un script de seed (`seed.js`) que inserta datos falsos pero realistas directamente en SQLite (sin pasar por MQTT), simulando una semana de lecturas. Para la aguada: nivel casi siempre estable cerca del tope (flotante funcionando), con un evento de falla de reposición de ~3.5 días donde el nivel baja gradualmente hasta disparar la alerta y luego se recupera. Para el tanque: ciclos de histéresis de bomba con consumo variable según hora del día.
- Existe una forma de forzar la generación del reporte manualmente sin esperar al cron, llamando directo a la función que arma y manda el reporte (la misma función que usa el cron, no una duplicada), vía `npm run demo:reporte`.
- Flujo recomendado para demo: correr el seed ANTES de la demo (no en vivo), después configurar un schedule corto en el .env y dejar que el cron dispare solo durante la demo (para mostrar que el mecanismo automático funciona sin manipular el reloj del sistema), con el trigger manual como plan B por si el timing no coincide en el momento.

## Próximo paso

Implementar el sistema de reportes semanales:

1. Crear el módulo de generación de reportes HTML con Chart.js desde CDN.
2. Agregar queries para obtener readings de la última semana.
3. Integrar cron semanal en index.js con node-cron.
4. Crear seed.js con datos de prueba realistas.
5. Agregar scripts npm para seed y demo manual.
