# Telemetria y Portal Corporativo

MVP para monitoreo de flotas con ingesta de telemetria, agente IA, dashboard operacional y stack reproducible.

## Estado actual
- Backend Node.js + TypeScript con Express, WebSocket, health y metrics, y una capa de aplicacion para telemetria.
- Broker RabbitMQ con fallback en memoria para desarrollo local y worker de outbox independiente en Compose.
- Persistencia principal en TimescaleDB/PostgreSQL con fallback JSON local.
- Ingesta de telemetria con soporte de lote para pruebas de carga mayores.
- Agente IA tool-enabled sobre LangChain con modo mock cuando no hay API key.
- Suite de pruebas con Vitest, Supertest e integracion real contra Docker Compose.
- Frontend Next.js con mapa, alertas, metricas, detalle de vehiculo y chat IA.
- Infra local con Docker Compose, prueba de carga k6 y base Terraform para AWS.
- Mobile offline-first: base Expo/React Native con cola SQLite, fallback en memoria, demo route y sync por lotes.

## Stack tecnologico
- Backend: Node.js 18+, TypeScript, Express, ws, amqplib, pg, axios, OpenAI SDK, uuid.
- Testing: Vitest, Supertest, Vitest UI y pruebas de integracion con TimescaleDB y RabbitMQ.
- Frontend: Next.js 13.4, React 18, react-leaflet, leaflet, TypeScript.
- Datos: TimescaleDB sobre PostgreSQL, con fallback JSON local.
- Mensajeria: RabbitMQ.
- Observabilidad: `/health`, `/metrics`, request ids, counters y timings.
- Infra: Docker Compose, k6, Terraform para AWS.
- Mobile: Expo/React Native offline-first con TypeScript, SQLite, cola local y sync batch contra el backend.

## Arquitectura rapida
- `POST /api/telemetry/event` persiste eventos y los encola en un outbox persistente.
- `GET /api/telemetry/state` y `GET /api/telemetry/summary` alimentan el dashboard.
- `GET /api/telemetry/critical-zones/stopped` expone alertas operativas.
- `POST /api/agent/query` clasifica la intencion primero, responde por reglas los conteos simples y usa LangChain solo para consultas mas complejas; devuelve `reply` en lenguaje natural y `conversationId` sigue siendo interno.
- Un worker independiente publica el outbox en RabbitMQ y el WebSocket `/ws` empuja los eventos al frontend.

## Como correr en local

### Opcion recomendada: Docker Compose liviano
```bash
cd infra
docker compose up --build
```

Servicios principales:
- backend en `http://localhost:4001`
- frontend en `http://localhost:3000`

Ese arranque usa fallback JSON y broker en memoria, por lo que evita levantar Postgres, RabbitMQ, worker y simulador. Es la ruta mas liviana para ver el portal y el chat IA.

### Opcion completa
```bash
cd infra
docker compose -f docker-compose.yml -f docker-compose.full.yml --profile full up --build
```

Con `full` se levantan PostgreSQL / TimescaleDB, RabbitMQ, worker y simulador, y el backend ya queda apuntando a esos servicios. El simulador arranca con 5 vehiculos para mantener la demo mas cercana al flujo de antes.

Para una guia de prueba completa con URLs y flujo de verificacion, revisa [docs/local-runbook.md](/D:/Github/Fullstack_Engineer/docs/local-runbook.md).

### Opcion manual
Backend:
```bash
cd backend
npm install
npm run dev
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

## Variables de entorno utiles
- `DATABASE_URL`
- `RABBITMQ_URL`
- `OPENAI_API_KEY`
- `AGENT_MOCK`
- `BROKER_QUEUE_NAME`
- `NEXT_PUBLIC_API_BASE`
- `NEXT_PUBLIC_WS_URL`
- `TELEMETRY_SIM_VEHICLES`
- `TELEMETRY_SIM_INTERVAL_MS`
- `TELEMETRY_SIM_BATCH_SIZE`
- `TELEMETRY_INSERT_CHUNK_SIZE`
- `JSON_BODY_LIMIT`
- `CORS_ALLOWED_ORIGINS`
- `ADMIN_API_TOKEN`
- `RATE_LIMIT_MAX_REQUESTS`
- `RATE_LIMIT_WINDOW_MS`
- `FLEET_OFFLINE_THRESHOLD_MS`
- `AGENT_TRACE_RETENTION_DAYS`
- `AGENT_CONVERSATION_SUMMARY_THRESHOLD`
- `AGENT_CONVERSATION_RECENT_TURNS`
- `MODE`
- `VEHICLE_COUNT`
- `BATCH_SIZE`
- `RATE`
- `DURATION`
- `INVALID_RATE`
- `DUPLICATE_RATE`
- `INTEGRATION_TIMEOUT_MS`

## Endpoints principales
| Metodo | Endpoint | Proposito |
| --- | --- | --- |
| `POST` | `/api/telemetry/event` | Registrar un evento de telemetria |
| `POST` | `/api/telemetry/events/batch` | Registrar un lote de eventos de telemetria |
| `GET` | `/api/telemetry/state` | Obtener el estado actual de la flota |
| `GET` | `/api/telemetry/summary` | Obtener el resumen agregado de la flota |
| `GET` | `/api/telemetry/vehicle/:id/events` | Ver el historial de eventos de un vehiculo |
| `GET` | `/api/telemetry/vehicle/:id/detail` | Ver el detalle derivado de un vehiculo |
| `GET` | `/api/telemetry/critical-zones` | Ver el catalogo de zonas criticas |
| `GET` | `/api/telemetry/critical-zones/vehicles` | Ver vehiculos dentro de zonas criticas |
| `GET` | `/api/telemetry/critical-zones/stopped` | Ver vehiculos detenidos en zonas criticas |
| `GET` | `/api/telemetry/admin/outbox` | Ver backlog, retries y dead letters del outbox |
| `GET` | `/api/telemetry/admin/outbox/config` | Ver configuracion efectiva del worker de outbox |
| `GET` | `/api/telemetry/admin/ingestion` | Ver eventos recibidos, nuevos, actualizados y duplicados |
| `POST` | `/api/agent/query` | Consultar al agente IA y obtener una respuesta natural |
| `GET` | `/api/agent/conversations/:conversationId/traces` | Consultar trazas auditables de una conversacion IA |
| `GET` | `/api/agent/admin/config` | Ver configuracion efectiva de auditoria IA |
| `GET` | `/health` | Ver estado de salud del backend |
| `GET` | `/metrics` | Ver metricas basicas del backend |

## Pruebas
- `cd backend && npm test` ejecuta los tests unitarios una sola vez.
- `cd backend && npm run test:watch` deja Vitest en modo observacion.
- `cd backend && npm run test:ui` abre el explorador visual de Vitest.
- `cd backend && npm run test:integration` ejecuta pruebas reales contra TimescaleDB y RabbitMQ en Docker Compose.
- `cd frontend && npm test && npm run build` valida el portal Next.js.
- `cd mobile && npm run typecheck && npm test` valida la base offline-first, incluyendo fallo de red y reintento.
- La validacion mobile en dispositivo real esta documentada en [docs/mobile-device-validation.md](/D:/Github/Fullstack_Engineer/docs/mobile-device-validation.md).

Vitest ejecuta la suite y Supertest se usa para golpear la app Express directamente, sin levantar el puerto real.
La suite de integracion valida persistencia, publicacion en RabbitMQ y rutas HTTP usando servicios reales de Compose.
La workflow `project-ci` ejecuta backend, infra, frontend y mobile en GitHub Actions.

Si usas VS Code, instala la extension de Vitest y abre la vista `Testing`. Ahi veras los archivos, suites y casos ejecutados en forma de arbol, con ejecucion individual por test.

## Flujo funcional
1. Un evento de telemetria entra por HTTP.
2. El backend lo normaliza y lo persiste en TimescaleDB o en JSON local si la base no responde.
3. El evento o lote se registra en un outbox persistente.
4. Un worker independiente lo publica de forma asincrona en RabbitMQ con reintentos.
5. El consumidor de WebSocket difunde los eventos al frontend.
6. El frontend refresca el mapa, las alertas y el resumen operacional.
7. El agente IA usa un router de intencion, responde por reglas los conteos simples y consulta tools internas para consultas mas complejas.
8. Si el cliente reusa `conversationId`, el backend rehidrata el contexto anterior y persiste la nueva traza.

## Flujo actualizado
1. Un evento de telemetria entra por HTTP.
2. El backend lo normaliza y lo persiste en TimescaleDB o en JSON local si la base no responde.
3. El evento queda registrado en un outbox persistente.
4. El API notifica al worker por HTTP con circuit breaker; si falla, el outbox sigue garantizando durabilidad.
5. El worker reclama el outbox y publica de forma asincrona hacia RabbitMQ con reintentos.
6. El evento tambien se difunde por WebSocket desde un consumidor dedicado.
7. El frontend refresca el mapa, las alertas y el resumen operacional.
8. El agente IA consulta tools internas para responder con datos reales de la flota y genera `reply` para la interfaz.
9. El backend persiste la traza del turno, el tool usado y la respuesta para auditoria.

## Seguridad MVP
- CORS es configurable con `CORS_ALLOWED_ORIGINS`.
- Si `ADMIN_API_TOKEN` esta definido, metricas, endpoints admin, trazas auditables del agente y el notify interno del worker exigen token.
- El backend aplica rate limit basico con `RATE_LIMIT_MAX_REQUESTS` y `RATE_LIMIT_WINDOW_MS`.

La postura completa esta en [docs/security-mvp.md](/D:/Github/Fullstack_Engineer/docs/security-mvp.md).

## Pendientes del MVP
- Completar mobile offline-first con captura GPS real en background, permisos, pruebas en dispositivo y CI/CD movil.
- CI/CD para frontend y mobile. El backend ya tiene pruebas unitarias, rutas, build e integracion real automatizadas.
- Validacion de carga y resiliencia con mas volumen real sobre TimescaleDB y RabbitMQ, incluyendo escenarios con lote.
- Observabilidad mas completa con logs estructurados y trazas.
- Cierre incremental de Backend / Events documentado en `docs/backend-events-workflow.md`.

## Estructura del repo
- `backend/` - API, agente IA, persistencia y broker.
- `frontend/` - dashboard operacional en Next.js.
- `infra/` - Docker Compose, prueba de carga y Terraform para AWS.
- `docs/` - arquitectura, roadmap, auditoria de IA y matriz de cumplimiento.
- `mobile/` - app Expo/React Native offline-first con cola local y sincronizacion por lotes.
