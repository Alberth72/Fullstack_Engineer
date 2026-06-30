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

## URLs locales
| Servicio | URL |
| --- | --- |
| Portal frontend | http://localhost:3000 |
| API backend | http://localhost:4001 |
| Health backend | http://localhost:4001/health |
| Metrics backend | http://localhost:4001/metrics |
| API telemetry | http://localhost:4001/api/telemetry/state |
| Chat IA | http://localhost:4001/api/agent/query |
| Worker health | http://localhost:4002/health |
| RabbitMQ Management | http://localhost:15672 |
| PostgreSQL / TimescaleDB | localhost:5432 |

Los tres ultimos servicios solo existen cuando levantas el modo completo con `docker compose -f docker-compose.yml -f docker-compose.full.yml --profile full up --build`.

Credenciales locales por defecto:
- RabbitMQ: `guest / guest`
- PostgreSQL: `fleet / fleet`

## Flujo de prueba sugerido
1. Abre el frontend y verifica que cargue el dashboard.
2. Abre el endpoint de health del backend.
3. Consulta `GET /api/telemetry/state` para ver la flota.
4. Envia un evento o lote de telemetria para observar el outbox y la publicacion.
5. Usa el chat IA con `conversationId` repetido para validar el modo multi-turn.
6. Abre RabbitMQ Management y confirma colas y mensajes.

## Nota de ligereza
Si notas el proyecto pesado en memoria, primero deja apagado el simulador y el worker. En modo liviano no se levantan y el portal sigue funcionando con los datos persistidos en `backend/data/events.json`.

## Nota sobre GitHub
Las workflows de GitHub Actions ya estan en el repo, pero desde esta sesion no dependo de una conexion activa a GitHub. El ecosistema local funciona sin eso; para ejecutar las workflows en la nube hacen falta credenciales y secretos configurados en el repositorio.

## Validacion CI
La workflow `project-ci` valida cuatro frentes:
- backend: tests unitarios/rutas, build e integracion con TimescaleDB y RabbitMQ en Compose
- infra: `docker compose config` para modo liviano y full, mas `terraform fmt -check`
- frontend: tests Vitest y build Next.js
- mobile: typecheck y smoke test offline-first

La validacion de infra en CI no sustituye una prueba local completa con Docker Desktop activo, pero evita que el YAML de Compose o el formato Terraform se rompan sin ser detectados.
