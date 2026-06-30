# Backend / Events workflow

Este documento es la cola operativa para cerrar brechas del equipo Backend / Events sin saltar entre areas.

## Estado del frente
| Area | Cumplimiento anterior | Cumplimiento objetivo corto | Estado |
| --- | --- | --- | --- |
| Backend / eventos / Timescale-RabbitMQ | 82% | 90% | En cierre incremental |

## Brechas priorizadas
| Prioridad | Brecha | Riesgo | Cambio requerido | Archivos principales | Verificacion | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | Visibilidad del outbox | Operacion no puede saber si hay backlog, retries o dead letters sin revisar storage interno | Exponer resumen administrativo del outbox | `backend/src/routes/telemetry.ts`, `backend/src/storage/telemetryOutbox.ts`, `backend/src/storage/db_json.ts`, `backend/src/storage/pg.ts` | `npm run build`, `npm test` en backend | Cerrada |
| P1 | Configuracion efectiva del worker | El tuning por variables de entorno no es auditable en runtime | Exponer intervalo, claim limit, lock timeout y politica de retry/backoff efectiva | `backend/src/events/outboxWorkerConfig.ts`, `backend/src/events/outboxWorker.ts`, `backend/src/routes/telemetry.ts` | Test de ruta/config + build | Cerrada |
| P1 | Idempotencia y duplicados bajo carga | k6 genera duplicados, pero no habia lectura operativa de cuantas escrituras fueron idempotentes | Agregar contador y lectura administrativa de eventos nuevos, actualizados, duplicados y outbox saltado | `backend/src/storage/pg.ts`, `backend/src/storage/db_json.ts`, `backend/src/observability/metrics.ts`, `backend/src/routes/telemetry.ts` | Test unitario + build | Cerrada |
| P2 | Retencion y volumen de telemetria | Timescale usa politica fija y JSON compacta por vehiculo, pero la politica no esta unificada para operacion | Documentar y exponer politica efectiva de retencion/compactacion | `backend/src/storage/pg.ts`, `backend/src/storage/db_json.ts`, docs | Build + docs | Pendiente |
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

## Regla de trabajo
Solo se abre una brecha Backend / Events a la vez. Cada cierre debe incluir codigo, test/build y documentacion cuando cambie el comportamiento observable.

## Evidencia de carga
La primera corrida formal de Iteracion 1 quedo documentada en `docs/load-test-results.md`.

Resultado resumido despues del ajuste del worker:
- 11250 eventos recibidos en 45s.
- 10125 eventos unicos aceptados.
- p95 k6: 89.09 ms.
- outbox final: 0 pending, 0 retry, 0 processing.
- worker final: 10125 claimed, 10125 published, 0 retries y 0 dead letters nuevos.
