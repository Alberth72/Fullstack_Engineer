# Matriz de Cumplimiento

Evaluacion del estado actual del proyecto frente a los requisitos definidos.

## Resumen ejecutivo
- El MVP ya cubre ingesta, persistencia, agente IA, dashboard, mapa, alertas y observabilidad operativa basica.
- Los mayores huecos son completar mobile en dispositivo real y cerrar el despliegue AWS end-to-end.
- RabbitMQ administrado, TimescaleDB y la pipeline de ECR ya forman parte del stack real, con fallback local solo para desarrollo.

## Matriz

| Area | Requisito | Estado actual | Evidencia | Brecha | Accion recomendada |
| --- | --- | --- | --- | --- | --- |
| A. Ingesta orientada a eventos | Stream asincrono con broker RabbitMQ | Cumple | `backend/src/events/broadcaster.ts`, `backend/src/events/outboxNotifier.ts`, `backend/src/events/outboxWorker.ts`, `backend/src/events/outboxWorkerConfig.ts`, `backend/src/events/telemetryConsumers.ts`, `backend/src/worker.ts`, `backend/src/routes/telemetry.ts`, `infra/docker-compose.yml` | El fallback en memoria sigue existiendo para desarrollo, pero no bloquea el flujo real; el outbox ya expone backlog, retries, dead letters, configuracion efectiva del worker e idempotencia por API administrativa | Observar latencia del notificador y comportamiento del worker bajo carga |
| A. Ingesta orientada a eventos | Persistencia especializada para telemetria temporal | Cumple | `backend/src/storage/pg.ts`, `backend/src/storage/db_json.ts`, `backend/src/storage/telemetryOutbox.ts`, `backend/src/storage/telemetryWriteStats.ts`, `backend/src/storage/telemetryRetentionPolicy.ts` | La escritura ya mide insertados, actualizados y duplicados; retencion Timescale y compactacion JSON son configurables y visibles por API administrativa; falta validar carga de mayor duracion | Ejecutar pruebas de volumen mas largas y revisar migracion de hypertable con datos preexistentes |
| A. Ingesta orientada a eventos | Resiliencia con circuit breaker y retries | Cumple | `backend/src/utils/resilience.ts`, `backend/src/storage/pg.ts`, `backend/src/events/broadcaster.ts`, `backend/src/events/outboxNotifier.ts`, `backend/src/events/outboxWorker.ts` | La politica puede endurecerse mas bajo carga extrema | Observar rate de reintentos y dead-letter con carga real |
| B. Desarrollo de agente IA | Agente operativo integrado en backend | Cumple | `backend/src/routes/agent.ts`, `backend/src/agent/agentClient.ts`, `backend/src/agent/langchainAgent.ts`, `backend/src/storage/agentAudit.ts`, `backend/src/agent/agentConversation.ts`, `backend/src/agent/agentAuditConfig.ts` | Las trazas ya son consultables, tienen retencion configurable, configuracion visible por API y conversaciones largas compactadas; falta decidir si la politica debe cambiar en runtime | Definir si la configuracion de auditoria debe administrarse dinamicamente fuera de variables de entorno |
| B. Desarrollo de agente IA | Responder con datos reales y JSON estructurado | Cumple | `backend/src/agent/agentClient.ts`, `backend/src/agent/agentFunctionCaller.ts`, `backend/src/agent/agentResponseSchema.ts` | El contrato ya se valida antes de responder, pero faltan politicas de versionado del schema | Versionar el schema si otros clientes empiezan a consumirlo directamente |
| B. Desarrollo de agente IA | Zonas criticas y detenidos prolongados | Cumple | `backend/src/services/criticalZones.ts`, `backend/src/services/telemetryService.ts` | El catalogo es fijo y aun no editable desde UI | Hacer el catalogo configurable cuando el MVP lo justifique |
| C. Portal corporativo | Dashboard reactivo con WebSocket o streaming | Cumple parcial | `frontend/src/components/FleetDashboard.tsx`, `backend/src/index.ts` | Todavia existe polling como respaldo | Reducir polling y depender mas del canal en tiempo real |
| C. Portal corporativo | Mostrar mapa, alertas y chat IA | Cumple | `frontend/src/components/FleetMap.tsx`, `frontend/src/components/FleetDashboard.tsx` | La UX aun puede pulirse | Mejorar densidad visual y jerarquia de alertas |
| C. Portal corporativo | Salud del sistema y metricas | Cumple parcial alto | `backend/src/index.ts`, `backend/src/worker.ts`, `backend/src/observability/metrics.ts`, `backend/src/observability/logger.ts`, `backend/src/observability/diagnostics.ts` | Aun faltan trazas distribuidas y alertas operativas | Completar trazabilidad y agregar alertas si la demo requiere mas observabilidad |
| D. Ecosistema movil | App offline-first con persistencia local | Cumple parcial | `mobile/src/storage/sqliteOfflineQueue.ts`, `mobile/src/services/telemetrySyncService.ts`, `mobile/src/ui/SyncStatusScreen.tsx`, `mobile/src/domain/trackingReadiness.ts`, `docs/mobile-device-validation.md` | La app ya muestra readiness de permisos/background GPS para prueba real; falta ejecutar y registrar evidencia en dispositivo fisico o emulador con development build | Probar en Android/iOS con Expo dev client y guardar evidencia de la corrida |
| D. Ecosistema movil | Sincronizar en bloque al reconectar | Cumple parcial | `mobile/src/services/telemetrySyncService.ts`, `mobile/src/adapters/httpTelemetryTransport.ts`, `mobile/scripts/smoke.mjs` | Falta reconexion real con cambios de red y manejo UX de errores prolongados | Agregar prueba en dispositivo/emulador y criterios de reintento visibles |
| D. Ecosistema movil | CI/CD movil | Cumple parcial | `.github/workflows/ci.yml`, `mobile/package.json`, `mobile/scripts/smoke.mjs` | Hay typecheck y smoke en CI, pero falta build movil y despliegue con Fastlane/EAS | Agregar build de development client y flujo Maestro en un job dedicado |
| E. Infra, caos y testing | Script de carga con errores y duplicados | Cumple | `infra/loadtest/telemetry.k6.js` | Falta validar resultados y capacidad real | Ejecutar la prueba con mas volumen y registrar hallazgos |
| E. Infra, caos y testing | Docker Compose reproducible e IaC | Cumple | `infra/docker-compose.yml`, `infra/docker-compose.full.yml`, `infra/terraform-bootstrap/`, `infra/terraform/broker.tf`, `infra/terraform/`, `backend/Dockerfile.ecs`, `.github/workflows/ci.yml`, `.github/workflows/bootstrap-terraform-state.yml`, `.github/workflows/ecr-publish.yml`, `.github/workflows/deploy-terraform.yml` | CI valida Compose light/full y formato Terraform, pero falta ejecutar el apply real en AWS con credenciales y validar el broker administrado en una cuenta real | Mantener la pipeline de ECR y conectar el despliegue con Terraform cuando se abra la cuenta objetivo |

## Observaciones
1. La ruta critica funcional ya existe: ingesta, persistencia, broker, worker independiente, WebSocket, dashboard y agente IA.
2. Las mejoras con mayor impacto ahora son validar mobile en dispositivo real, trazabilidad operativa y automatizacion de despliegues.
3. El stack objetivo ya esta alineado con RabbitMQ administrado, TimescaleDB y una pipeline de ECR, y el agente ya opera sobre LangChain con trazas persistidas.
4. La carga y caos ya tienen un generador k6 alineado al requisito, y Terraform quedo como base formal de IaC con bootstrap de state backend y broker en AWS.

## Prioridad sugerida
1. Validacion mobile en dispositivo real y CI/CD movil.
2. Observabilidad y resiliencia.
3. Validacion de carga extendida sobre TimescaleDB y RabbitMQ.
4. Ejecutar despliegue AWS end-to-end con credenciales reales.
5. Refinamiento del agente IA con versionado formal de schema y posible administracion runtime de auditoria.
