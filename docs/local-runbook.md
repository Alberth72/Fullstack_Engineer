# Runbook local del ecosistema

Este documento resume como levantar y probar el stack completo en la maquina local.

## Arranque
1. Asegura Docker Desktop activo.
2. Desde la raiz del repo ejecuta el modo liviano:
```bash
cd infra
docker compose up --build
```
3. Espera a que backend y frontend terminen de inicializar.

## Modos
### Modo liviano recomendado
Levanta solo:
- backend
- frontend

Este modo usa fallback JSON y broker en memoria cuando no se configuran Postgres ni RabbitMQ. Es el camino mas rapido para ver el portal y probar el chat IA sin cargar servicios extras.

### Modo completo
Si necesitas validar persistencia real en PostgreSQL/TimescaleDB, RabbitMQ, worker y simulador:
```bash
cd infra
docker compose -f docker-compose.yml -f docker-compose.full.yml --profile full up --build
```

Este modo conecta el backend con TimescaleDB y RabbitMQ, habilita el worker y deja el simulador en 5 vehiculos para recuperar la demo operativa mas parecida a la anterior.
El arranque full ahora espera salud real de Postgres y RabbitMQ antes de levantar backend, worker y simulador, y el broker reintenta conexion si Rabbit tarda en quedar disponible.

### Modo full con observabilidad visual
Si necesitas ver trazas historicas y spans en Grafana:
```bash
cd infra
docker compose -f docker-compose.yml -f docker-compose.full.yml -f docker-compose.observability.yml --profile full --profile observability up --build
```

Este modo agrega OpenTelemetry Collector, Grafana Tempo y Grafana. El backend y el worker exportan trazas OTLP hacia `otel-collector:4318` solo en este override.

## URLs locales
| Servicio | URL |
| --- | --- |
| Portal frontend | http://localhost:3000 |
| API backend | http://localhost:4001 |
| Health backend | http://localhost:4001/health |
| Metrics backend | http://localhost:4001/metrics |
| Diagnostics backend | http://localhost:4001/diagnostics |
| API telemetry | http://localhost:4001/api/telemetry/state |
| Chat IA | http://localhost:4001/api/agent/query |
| Worker health | http://localhost:4002/health |
| RabbitMQ Management | http://localhost:15672 |
| PostgreSQL / TimescaleDB | localhost:5432 |
| Grafana traces | http://localhost:3001 |
| Tempo API | http://localhost:3200 |
| OpenTelemetry Collector OTLP HTTP | http://localhost:4318 |

RabbitMQ, PostgreSQL, worker y simulador solo existen cuando levantas el modo completo. Grafana, Tempo y Collector solo existen cuando agregas `docker-compose.observability.yml` y el perfil `observability`.

Credenciales locales por defecto:
- RabbitMQ: `guest / guest`
- PostgreSQL: `fleet / fleet`

## Flujo de prueba sugerido
1. Abre el frontend y verifica que cargue el dashboard.
2. Abre el endpoint de health del backend.
3. Consulta `/diagnostics` con token admin si esta configurado para ver health, metricas, alertas operativas y problemas recientes.
4. Consulta `GET /api/telemetry/state` para ver la flota.
5. Envia un evento o lote de telemetria para observar el outbox y la publicacion.
6. Usa el chat IA con `conversationId` repetido para validar el modo multi-turn.
7. Abre RabbitMQ Management y confirma colas y mensajes.

## Diagnostico operacional
`GET /diagnostics` resume health, metricas, alertas operativas, contadores de error y ultimos logs `warn`/`error` del proceso. Si `ADMIN_API_TOKEN` esta configurado, requiere `Authorization: Bearer <token>` o `X-Admin-Token`.

```bash
curl http://localhost:4001/diagnostics
```

Con token:

```bash
curl http://localhost:4001/diagnostics -H "X-Admin-Token: <token>"
```

El worker tambien expone `GET /diagnostics` en `http://localhost:4002/diagnostics` cuando corre el modo full.
Los logs del backend, worker, simulador y fallback JSON salen como JSON estructurado a stdout/stderr. Los `warn` y `error` recientes quedan visibles en `/diagnostics`.

La respuesta incluye:
- `attentionRequired`: `true` cuando existe al menos una alerta.
- `alertSummary`: conteo total y por severidad.
- `alerts`: lista accionable con `severity`, `code`, `source`, `message`, `count` y contexto opcional.

Las alertas actuales se derivan de dependencias configuradas no conectadas, errores de ingesta/publicacion, dead letters del outbox, circuit breaker del notificador, reintentos, errores del agente y logs recientes `warn`/`error`.

## Trazas distribuidas
El backend y el worker aceptan `traceparent`, `X-Trace-Id`, `X-Span-Id` y `X-Request-Id`. Si no llegan, generan una traza local y devuelven estos headers en la respuesta:

```bash
curl http://localhost:4001/health -H "traceparent: 00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01" -i
```

La traza se propaga por API, capa de aplicacion, outbox, notificacion HTTP al worker, publicacion RabbitMQ y broadcast WebSocket. En PostgreSQL el outbox guarda la metadata en `telemetry_outbox.trace_context`; en fallback JSON queda en `backend/data/outbox.json`.

Cuando `OTEL_EXPORTER_OTLP_ENDPOINT` o `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` esta configurado, backend y worker inician OpenTelemetry SDK para Node.js y exportan spans al Collector. En el modo observability local:
- Backend usa `OTEL_SERVICE_NAME=fleet-backend`.
- Worker usa `OTEL_SERVICE_NAME=fleet-outbox-worker`.
- Collector recibe OTLP HTTP en `4318` y OTLP gRPC en `4317`.
- Tempo conserva trazas locales por 24 horas.
- Grafana queda disponible en `http://localhost:3001` con datasource Tempo preconfigurado.

La migracion versionada para esta columna vive en:

```text
backend/migrations/002_outbox_trace_context.sql
```

## Operacion del outbox
Consulta el estado operativo del outbox:

```bash
curl http://localhost:4001/api/telemetry/admin/outbox
```

Simula la limpieza de dead letters historicos. Este modo no elimina registros:

```bash
curl -X POST http://localhost:4001/api/telemetry/admin/outbox/dead-letters/prune \
  -H "Content-Type: application/json" \
  -d "{\"olderThanDays\":14}"
```

Para ejecutar la limpieza real, envia `dryRun: false`. Si `ADMIN_API_TOKEN` esta configurado, agrega `X-Admin-Token`.

```bash
curl -X POST http://localhost:4001/api/telemetry/admin/outbox/dead-letters/prune \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <token>" \
  -d "{\"olderThanDays\":14,\"dryRun\":false}"
```

Consulta readiness de TimescaleDB e hypertable antes de una migracion formal:

```bash
curl http://localhost:4001/api/telemetry/admin/storage/readiness
```

Si `ADMIN_API_TOKEN` esta configurado, agrega `X-Admin-Token`. Revisa `migrationBlockers` antes de depender de retencion Timescale o comportamiento real de hypertable.

La migracion formal esta versionada en:

```text
backend/migrations/001_timescale_hypertable_event_ids.sql
```

Estrategia:
- `telemetry_events` queda como hypertable con primary key `(id, timestamp)`.
- `telemetry_event_ingest_ids` conserva idempotencia por `id`.
- El SQL usa `migrate_data => TRUE` para datos existentes.

Ejecutala solo contra un stack full con backup o datos descartables de prueba. Despues vuelve a consultar readiness y confirma que `migrationBlockers` este vacio.

## Nota de ligereza
Si notas el proyecto pesado en memoria, primero deja apagado el simulador y el worker. En modo liviano no se levantan y el portal sigue funcionando con los datos persistidos en `backend/data/events.json`.

## Nota sobre GitHub
Las workflows de GitHub Actions ya estan en el repo, pero desde esta sesion no dependo de una conexion activa a GitHub. El ecosistema local funciona sin eso; para ejecutar las workflows en la nube hacen falta credenciales y secretos configurados en el repositorio.

## Validacion CI
La workflow `project-ci` valida cuatro frentes:
- backend: tests unitarios/rutas, build e integracion con TimescaleDB y RabbitMQ en Compose
- infra: `docker compose config` para modo liviano, full y observability, mas `terraform fmt -check`
- frontend: tests Vitest y build Next.js
- mobile: typecheck y smoke test offline-first

La validacion de infra en CI no sustituye una prueba local completa con Docker Desktop activo, pero evita que el YAML de Compose o el formato Terraform se rompan sin ser detectados.

## Errores comunes de arranque

### PowerShell bloquea `npm.ps1`

En este entorno Windows, PowerShell puede resolver `npm` hacia `npm.ps1` y bloquearlo por politica de ejecucion. El sintoma tipico es:

```text
No se puede cargar el archivo ...\npm.ps1 porque la ejecucion de scripts esta deshabilitada en este sistema.
```

Usa `npm.cmd` para verificaciones locales:

```bash
cd backend
npm.cmd test
npm.cmd run build
```

Aplica igual para frontend y mobile:

```bash
cd frontend
npm.cmd test
npm.cmd run build
```

Esto evita el wrapper de PowerShell sin cambiar la politica global del sistema.
