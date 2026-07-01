# Seguridad MVP

## Objetivo
Reducir la superficie de ataque del MVP sin volver pesada la demo local.

Esta iteracion aplica controles simples alineados con buenas practicas de OWASP API Security: origenes explicitos, proteccion de endpoints operativos, limite basico de tasa y headers defensivos.

## Controles implementados

### CORS configurable
Variable:
- `CORS_ALLOWED_ORIGINS`

Comportamiento:
- Si no se define, el backend mantiene `Access-Control-Allow-Origin: *` para desarrollo local.
- Si se define con una lista separada por comas, solo esos origenes son aceptados.
- Ejemplo:
```bash
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://portal.example.com
```

### Token administrativo
Variable:
- `ADMIN_API_TOKEN`

Cuando se define, estos endpoints requieren `Authorization: Bearer <token>` o `X-Admin-Token: <token>`:
- `GET /metrics`
- `GET /api/telemetry/admin/outbox`
- `GET /api/telemetry/admin/outbox/config`
- `GET /api/telemetry/admin/ingestion`
- `GET /api/telemetry/admin/retention`
- `GET /api/agent/admin/config`
- `GET /api/agent/conversations/:conversationId/traces`
- `POST /internal/outbox/notify` en el worker

El backend tambien reenvia `ADMIN_API_TOKEN` al worker cuando notifica el outbox.

### Rate limit basico
Variables:
- `RATE_LIMIT_MAX_REQUESTS`
- `RATE_LIMIT_WINDOW_MS`

Defaults:
- `RATE_LIMIT_MAX_REQUESTS=600`
- `RATE_LIMIT_WINDOW_MS=60000`

Para desactivar temporalmente:
```bash
RATE_LIMIT_MAX_REQUESTS=0
```

### Headers defensivos
El backend aplica:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Cache-Control: no-store`

## Tradeoff
Los defaults siguen favoreciendo desarrollo local. Para una demo compartida o ambiente publicado, se debe definir al menos:
```bash
CORS_ALLOWED_ORIGINS=https://<dominio-del-portal>
ADMIN_API_TOKEN=<token-largo-y-aleatorio>
```

## Validacion
```bash
cd backend
npm.cmd test -- tests/events/outboxNotifier.test.ts tests/events/workerRoutes.test.ts tests/routes/systemRoutes.test.ts tests/routes/telemetryRoutes.test.ts tests/routes/agentRoutes.test.ts
npm.cmd run build
```

Casos cubiertos:
- origen permitido y origen rechazado
- metricas protegidas por token
- rutas admin de telemetria protegidas por token
- trazas auditables del agente protegidas por token
- notificador backend -> worker con `X-Admin-Token`
- worker rechazando `/internal/outbox/notify` sin token
- rate limit devolviendo `429`
