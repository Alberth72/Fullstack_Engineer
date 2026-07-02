# Plan de Ejecucion

Este plan refleja el estado actual del repo y los siguientes pasos mas utiles para cerrar el MVP.

## Estado actual por fase
| Fase | Estado | Hecho | Falta |
| --- | --- | --- | --- |
| Fase 1: Fundacion de datos y eventos | 96% MVP | RabbitMQ, TimescaleDB/PostgreSQL, JSON fallback, retries, circuit breaker, simulador, lectura administrativa del outbox, configuracion efectiva del worker, metricas de idempotencia, politica visible de retencion/compactacion, readiness de hypertable y migracion formal versionada | Ejecutar migracion en ambiente real, validar volumen extendido y caos |
| Fase 2: Resiliencia y observabilidad | 96% MVP | `/health`, `/metrics`, `/diagnostics`, alertas operativas, trazas distribuidas livianas, export OTLP opcional, Collector/Tempo/Grafana local, request ids, counters, timings, logs estructurados, buffer de problemas recientes y logs secundarios unificados en simulador/fallback | Elegir proveedor APM administrado para produccion si se requiere |
| Fase 3: Portal corporativo | Casi completa | Mapa, alertas, salud, metricas, detalle de vehiculo y chat IA | Pulido visual, timeline operativo y refinamiento de UX |
| Fase 4: Desarrollo de agente IA avanzado | En curso | Tool calling, JSON estructurado y zonas criticas deterministicas | Consultas multi-turn, mejor validacion de respuestas y trazabilidad de prompts |
| Fase 5: Mobile offline-first | En curso | Base Expo/React Native, cola SQLite, fallback en memoria, sync por lotes y smoke test | Validacion en dispositivo, permisos GPS/background, reconexion real, Maestro y CI/CD movil |
| Fase 6: Infraestructura y pruebas de caos | En curso | Docker Compose, k6, Terraform AWS y CD backend/frontend hacia ECS/Fargate | Validacion real en cuenta AWS, CD movil y carga mas formal |

## Prioridad recomendada ahora
1. Cerrar el portal corporativo con UX y visual polish verificable.
2. Endurecer observabilidad, logs estructurados y correlacion.
3. Ejecutar y validar Infra / AWS / CI-CD de extremo a extremo en cuenta real.
4. Validar mobile offline-first en dispositivo real.
5. Refinar el agente con trazabilidad mas fuerte.

## Orden sugerido
1. Backend / Events.
2. Portal corporativo.
3. Observabilidad y resiliencia.
4. Infraestructura reproducible y automatizacion.
5. Pruebas de carga y caos.
6. Mobile offline-first en dispositivo real.
7. Agente IA avanzado.

## Nota de alcance
Si el objetivo es una demo mas fuerte y profesional, conviene cerrar primero portal, observabilidad e infraestructura.
Si el objetivo es acercarse a produccion, la siguiente inversion real es validar mobile offline-first en dispositivo real y automatizar su pipeline, despues de mantener la base operativa verificable.
