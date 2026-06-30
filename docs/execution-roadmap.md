# Plan de Ejecucion

Este plan refleja el estado actual del repo y los siguientes pasos mas utiles para cerrar el MVP.

## Estado actual por fase
| Fase | Estado | Hecho | Falta |
| --- | --- | --- | --- |
| Fase 1: Fundacion de datos y eventos | En curso | RabbitMQ, TimescaleDB/PostgreSQL, JSON fallback, retries, circuit breaker, simulador, lectura administrativa del outbox, configuracion efectiva del worker y metricas de idempotencia | Validar volumen y retencion |
| Fase 2: Resiliencia y observabilidad | En curso | `/health`, `/metrics`, request ids, counters, timings y logs estructurados en el camino critico | Trazas distribuidas, alertas y unificacion total de logs secundarios |
| Fase 3: Portal corporativo | Casi completa | Mapa, alertas, salud, metricas, detalle de vehiculo y chat IA | Pulido visual, timeline operativo y refinamiento de UX |
| Fase 4: Desarrollo de agente IA avanzado | En curso | Tool calling, JSON estructurado y zonas criticas deterministicas | Consultas multi-turn, mejor validacion de respuestas y trazabilidad de prompts |
| Fase 5: Mobile offline-first | En curso | Base Expo/React Native, cola SQLite, fallback en memoria, sync por lotes y smoke test | Validacion en dispositivo, permisos GPS/background, reconexion real, Maestro y CI/CD movil |
| Fase 6: Infraestructura y pruebas de caos | En curso | Docker Compose y k6 | CI/CD, IaC y validacion de carga mas formal |

## Prioridad recomendada ahora
1. Cerrar Backend / Events hasta 90% con la cola de `docs/backend-events-workflow.md`.
2. Cerrar el portal corporativo con UX y visual polish verificable.
3. Endurecer observabilidad, logs estructurados y correlacion.
4. Validar Infra / AWS / CI-CD de extremo a extremo.
5. Validar mobile offline-first en dispositivo real.
6. Refinar el agente con trazabilidad mas fuerte.

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
