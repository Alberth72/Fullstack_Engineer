# Resultados de carga - Iteracion 1 Backend

Fecha: 2026-06-30

## Objetivo
Validar la ruta critica de ingesta batch con TimescaleDB, RabbitMQ y outbox worker bajo carga local controlada.

## Entorno
- Docker Desktop sobre Linux engine.
- Compose full: backend, worker, TimescaleDB/PostgreSQL, RabbitMQ y frontend.
- Simulador pausado durante las corridas para evitar ruido.
- k6 ejecutado desde contenedor sin montar el workspace; el script se paso por stdin.

## Comando seguro usado para k6
```powershell
Get-Content infra\loadtest\telemetry.k6.js | docker run --rm -i `
  -e API_BASE=http://host.docker.internal:4001/api `
  -e RATE=5 `
  -e DURATION=45s `
  -e BATCH_SIZE=50 `
  -e VEHICLE_COUNT=5000 `
  -e INVALID_RATE=0 `
  -e DUPLICATE_RATE=0.10 `
  grafana/k6 run -
```

## Baseline antes del ajuste
Configuracion efectiva del worker:
- `OUTBOX_CLAIM_LIMIT`: 25
- `OUTBOX_POLL_INTERVAL_MS`: 1000

Resultado k6:
- Batches completados: 226
- Throughput observado: 3.33 req/s
- Checks: 97.34% exitosos
- Fallos HTTP: 2.65% / 6 timeouts
- Latencia promedio: 194.82 ms
- p95: 352.89 ms
- Outbox posterior inmediato: 4590 pending
- Worker: 6009 published, 0 retries, 0 dead letters nuevos

Hallazgo: el backend aceptaba eventos, pero el worker no drenaba al ritmo de entrada. El cuello estaba en publicacion individual y `claimLimit` bajo, no en RabbitMQ ni TimescaleDB caidos.

## Cambio aplicado
- `backend/src/events/outboxWorker.ts`: publica el claim completo como un batch de RabbitMQ y marca los IDs publicados en bloque; si el batch falla, conserva fallback por registro para retry/dead-letter.
- `infra/docker-compose.full.yml`: el perfil full usa tuning para carga:
  - `OUTBOX_CLAIM_LIMIT=${OUTBOX_CLAIM_LIMIT:-250}`
  - `OUTBOX_POLL_INTERVAL_MS=${OUTBOX_POLL_INTERVAL_MS:-500}`
- `backend/src/worker.ts`: `/health` del worker expone la configuracion efectiva de outbox.

## Resultado despues del ajuste
Configuracion efectiva confirmada:
- `OUTBOX_CLAIM_LIMIT`: 250
- `OUTBOX_POLL_INTERVAL_MS`: 500

Resultado k6:
- Batches completados: 226
- Eventos recibidos: 11250
- Eventos unicos aceptados: 10125
- Duplicados en batch: 1125
- Throughput observado: 4.42 req/s
- Checks: 99.55% exitosos
- Fallos HTTP: 0.44% / 1 timeout
- Latencia promedio: 50.79 ms
- p95: 89.09 ms
- Outbox posterior: 0 pending, 0 retry, 0 processing
- Worker: 10125 claimed, 10125 published, 0 retries, 0 dead letters nuevos

## Verificacion ejecutada
```powershell
cd backend
npm.cmd test -- tests/events/outboxWorker.test.ts
npm.cmd run build
```

```powershell
docker compose -f infra/docker-compose.yml -f infra/docker-compose.full.yml --profile full config
```

## Hallazgos pendientes
1. La corrida aun tuvo 1 timeout desde k6 hacia `host.docker.internal`; falta repetir con k6 instalado localmente o dentro de la misma red Docker para distinguir red de host vs backend.
2. Existen 123 dead letters historicos por `broker_unavailable`; no son nuevos de esta corrida, pero conviene limpiar o separar datos para futuras mediciones.
3. Postgres registro que `telemetry_events` no pudo convertirse en hypertable porque ya tenia datos. Esto apunta a migraciones/volumen inicial como siguiente mejora antes de produccion.
4. El Dockerfile local usa `npm run dev`; para pruebas de performance mas realistas conviene correr imagen buildada con `npm run build` + `npm start`.

## Criterio actual
La base backend/eventos queda mejor defendible para MVP: la ruta batch procesa mas de 10k eventos aceptados en una corrida corta, RabbitMQ y TimescaleDB permanecen saludables, y el outbox drena sin backlog ni retries nuevos con tuning del perfil full.
