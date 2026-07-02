# Backend / Events workflow

Este documento es la cola operativa para cerrar brechas del equipo Backend / Events sin saltar entre areas.

## Estado del frente
| Area | Cumplimiento anterior | Cumplimiento objetivo corto | Estado |
| --- | --- | --- | --- |
| Backend / eventos / Timescale-RabbitMQ | 82% | 90% | 90% cerrado para MVP |

## Brechas priorizadas
| Prioridad | Brecha | Riesgo | Cambio requerido | Archivos principales | Verificacion | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | Visibilidad del outbox | Operacion no puede saber si hay backlog, retries o dead letters sin revisar storage interno | Exponer resumen administrativo del outbox | `backend/src/routes/telemetry.ts`, `backend/src/storage/telemetryOutbox.ts`, `backend/src/storage/db_json.ts`, `backend/src/storage/pg.ts` | `npm run build`, `npm test` en backend | Cerrada |
| P1 | Configuracion efectiva del worker | El tuning por variables de entorno no es auditable en runtime | Exponer intervalo, claim limit, lock timeout y politica de retry/backoff efectiva | `backend/src/events/outboxWorkerConfig.ts`, `backend/src/events/outboxWorker.ts`, `backend/src/routes/telemetry.ts` | Test de ruta/config + build | Cerrada |
| P1 | Idempotencia y duplicados bajo carga | k6 genera duplicados, pero no habia lectura operativa de cuantas escrituras fueron idempotentes | Agregar contador y lectura administrativa de eventos nuevos, actualizados, duplicados y outbox saltado | `backend/src/storage/pg.ts`, `backend/src/storage/db_json.ts`, `backend/src/observability/metrics.ts`, `backend/src/routes/telemetry.ts` | Test unitario + build | Cerrada |
| P2 | Retencion y volumen de telemetria | Timescale usa politica fija y JSON compacta por vehiculo, pero la politica no esta unificada para operacion | Documentar y exponer politica efectiva de retencion/compactacion | `backend/src/storage/pg.ts`, `backend/src/storage/db_json.ts`, docs | Build + docs | Cerrada |
| P2 | Limpieza de dead letters historicos | Operacion acumula eventos irrecuperables del outbox y solo puede inspeccionarlos, no cerrarlos | Agregar endpoint admin con dry-run por defecto para podar dead letters por antiguedad | `backend/src/routes/telemetry.ts`, `backend/src/storage/telemetryOutbox.ts`, `backend/src/storage/db_json.ts`, `backend/src/storage/pg.ts`, docs | Test de ruta + build | Cerrada |
| P2 | Readiness de hypertable Timescale | El bootstrap hace `create_hypertable` best-effort y podia fallar sin visibilidad operativa | Exponer estado de extension Timescale, hypertable activo, primary key y bloqueadores de migracion | `backend/src/storage/pg.ts`, `backend/src/storage/telemetrySchemaReadiness.ts`, `backend/src/routes/telemetry.ts`, docs | Test de ruta/storage + build | Cerrada como observabilidad previa a migracion |
| P1 | Migracion formal Timescale id/timestamp | `PRIMARY KEY (id)` bloquea hypertables porque Timescale exige incluir la columna temporal en indices unicos | Versionar SQL de migracion, crear tabla de idempotencia por `id`, mover `telemetry_events` a primary key `(id, timestamp)` y adaptar writes | `backend/migrations/001_timescale_hypertable_event_ids.sql`, `backend/src/storage/pg.ts`, docs | Build + tests backend; integracion full cuando haya stack | Cerrada en codigo, pendiente ejecucion en ambiente real |
| P2 | Validacion de carga formal | Existe k6, pero no habia resultado ni criterio de aceptacion guardado | Agregar runbook de carga con umbrales, comandos y formato de reporte | `infra/loadtest/telemetry.k6.js`, docs | `docker compose config` + ejecucion k6 cuando haya stack | Parcial: primera evidencia en `docs/load-test-results.md` |

## Endpoint cerrado
`GET /api/telemetry/admin/outbox` devuelve:
- storage efectivo usado para el resumen
- conteos por estado: `pending`, `processing`, `retry`, `published`, `dead`
- cantidad lista para publicar
- cantidad bloqueada por backoff o lock
- proximo intento
- ultimo publicado
- muestras compactas de errores sin exponer payload completo

`GET /api/telemetry/admin/outbox/config` devuelve:
- `pollIntervalMs`
- `claimLimit`
- `lockTimeoutMs`
- politica de retry interno de publicacion
- politica de backoff exponencial entre intentos
- defaults aplicados para comparar configuracion efectiva contra valores base

`GET /api/telemetry/admin/ingestion` devuelve:
- eventos recibidos
- eventos unicos aceptados despues de normalizacion
- eventos insertados
- eventos actualizados por idempotencia
- duplicados detectados dentro del batch
- entradas de outbox creadas
- entradas de outbox saltadas porque ya existian
- total de escrituras idempotentes observadas

`GET /api/telemetry/admin/retention` devuelve:
- storage activo: `postgres` o `json`
- tabla y columna temporal usadas por TimescaleDB/PostgreSQL
- modo de hypertable aplicado en bootstrap de schema
- retencion efectiva de Timescale en dias, configurable con `TELEMETRY_RETENTION_DAYS`
- politica de compactacion JSON por vehiculo, configurable con `JSON_STORAGE_MAX_EVENTS_PER_VEHICLE`
- nota de fallback: si Postgres no esta disponible, aplica la politica JSON

`GET /api/telemetry/admin/storage/readiness` devuelve:
- storage activo: `postgres`, `json` o `json_fallback`
- si Postgres esta configurado y conectado
- si la extension TimescaleDB esta instalada
- si `telemetry_events` existe y esta activa como hypertable
- si `telemetry_event_ingest_ids` existe para conservar idempotencia por `id`
- columnas de primary key detectadas
- bloqueadores de migracion como `timescaledb_extension_missing`, `primary_key_without_time_column` o `telemetry_events_not_hypertable`
- recomendacion operativa para ejecutar o preparar la migracion formal

`backend/migrations/001_timescale_hypertable_event_ids.sql`:
- crea `telemetry_event_ingest_ids` como tabla de idempotencia
- backfillea ids existentes desde `telemetry_events`
- cambia primary key de `telemetry_events` desde `id` hacia `(id, timestamp)`
- ejecuta `create_hypertable(..., migrate_data => TRUE)`
- reinstala indice operacional por vehiculo/timestamp y politica de retencion

`POST /api/telemetry/admin/outbox/dead-letters/prune` devuelve:
- storage efectivo usado para la operacion
- `dryRun` aplicado, por defecto `true`
- ventana `olderThanDays`, por defecto 14 dias
- `cutoffAt` usado para comparar dead letters historicos
- cantidad `matched`, `deleted` y `retained`
- fallback JSON si Postgres no esta disponible

## Regla de trabajo
Solo se abre una brecha Backend / Events a la vez. Cada cierre debe incluir codigo, test/build y documentacion cuando cambie el comportamiento observable.

## Estado 90% MVP
El frente Backend / Events queda en 90% para MVP porque ya tiene:
- ingesta HTTP batch/event orientada a eventos
- persistencia principal PostgreSQL/TimescaleDB con fallback JSON
- outbox persistente con worker independiente, retries, backoff y dead letters
- lectura administrativa de backlog, worker config, idempotencia, retencion/compactacion, limpieza controlada de dead letters historicos, readiness de hypertable y migracion formal versionada
- primera evidencia formal de carga con RabbitMQ y TimescaleDB

Lo que queda fuera del cierre backend es hardening de produccion: ejecucion de la migracion en ambiente real, carga de mayor duracion y pruebas de caos.

## Evidencia de carga
La primera corrida formal de Iteracion 1 quedo documentada en `docs/load-test-results.md`.

Resultado resumido despues del ajuste del worker:
- 11250 eventos recibidos en 45s.
- 10125 eventos unicos aceptados.
- p95 k6: 89.09 ms.
- outbox final: 0 pending, 0 retry, 0 processing.
- worker final: 10125 claimed, 10125 published, 0 retries y 0 dead letters nuevos.
