# Auditoria de IA

## Objetivo
Registrar decisiones donde el agente IA fue guiado o refactorizado para cumplir estandares operativos.

## Estado actual del agente
- El agente usa mock local cuando no hay `OPENAI_API_KEY` o cuando `AGENT_MOCK=true`.
- El agente responde en JSON estructurado cuando opera sobre LangChain con proveedor OpenAI.
- Las facts operativas salen de tools del backend, no de texto libre.
- Las zonas criticas y la permanencia detenido se calculan de forma deterministica en el backend.
- El backend puede etiquetar la consulta con un `specialist` para usar prompts mas precisos por dominio y stack.
- La ruta real del agente esta montada sobre `langchain` con `createAgent` y tools tipadas.
- Cada hilo de conversacion se identifica con `conversationId` y el backend rehidrata los ultimos turnos antes de responder.
- El backend persiste trazas de agente, tool usada, contexto y respuesta final para auditoria.
- Todas las respuestas del agente pasan por `AgentResponseSchema` antes de persistirse o devolverse al frontend.
- Las trazas se pueden consultar por conversacion con `GET /api/agent/conversations/:conversationId/traces`.
- La retencion de trazas se controla con `AGENT_TRACE_RETENTION_DAYS`, por defecto 30 dias.
- Las conversaciones largas se compactan con un resumen automatico deterministico antes de pasar contexto al agente.
- La configuracion efectiva de auditoria se consulta en `GET /api/agent/admin/config`.

## Hallazgos auditados

1. Respuestas libres eran fragiles para integracion.
- Problema: una respuesta narrativa dificulta parseo, pruebas y consumo por frontend.
- Accion: el prompt del agente exige JSON valido y la ruta real usa LangChain con respuesta estructurada.
- Evidencia: `backend/src/agent/agentClient.ts` y `backend/src/agent/langchainAgent.ts`.
- Resultado: el frontend puede mostrar la respuesta sin heuristicas fragiles.

2. El agente no debe inventar datos de flota.
- Problema: un modelo puede inferir estados que el backend no confirmo.
- Accion: se agregaron tools internas y tool calling para consultar el estado real.
- Evidencia: `backend/src/agent/agentTools.ts` y `backend/src/agent/agentFunctionCaller.ts`.
- Resultado: las consultas operativas salen de `getFleetState`, `getFleetSummary`, `getVehicleDetail`, `getVehicleEvents`, `getStoppedVehicles`, `getCriticalZones`, `getVehiclesInCriticalZones` y `getStoppedVehiclesInCriticalZones`.

3. Las zonas criticas deben ser un read model deterministico.
- Problema: si el modelo calcula geofencing por su cuenta, puede inventar distancias o tiempos.
- Accion: se movio la logica a `backend/src/services/criticalZones.ts` y `backend/src/services/telemetryService.ts`.
- Evidencia: `getVehiclesInCriticalZones()` y `getStoppedVehiclesInCriticalZones()` usan datos reales de telemetria.
- Resultado: el agente solo reporta alertas cuando el backend confirma pertenencia a zona y duracion detenida.

4. Los fallbacks de desarrollo deben ser explicitos.
- Problema: sin infraestructura, el proyecto no debe quedar bloqueado.
- Accion: se implemento fallback en memoria para RabbitMQ, fallback JSON para la base y mock para el agente.
- Evidencia: `backend/src/events/broadcaster.ts`, `backend/src/storage/telemetryRepository.ts`, `backend/src/routes/agent.ts`.
- Resultado: el sistema sigue usable en local incluso si falla la infraestructura.

5. La persistencia operativa sigue siendo auditable.
- Problema: si la IA lee demasiados datos sin trazabilidad, cuesta explicar el resultado.
- Accion: el backend conserva el origen de la informacion en logs, funciones dedicadas y trazas persistidas por turno.
- Evidencia: `backend/src/storage/pg.ts`, `backend/src/storage/db_json.ts`, `backend/src/storage/agentAudit.ts` y `backend/src/services/fleetReadModel.ts`.
- Resultado: las respuestas del agente se pueden rastrear hasta consultas concretas y conversaciones previas.

6. La especializacion por dominio reduce respuestas genericas.
- Problema: un unico prompt amplio no siempre expresa bien la diferencia entre backend, data, frontend e infraestructura.
- Accion: se agregaron subperfiles de agente para `fleet_ops`, `event_backend`, `data_timescale`, `frontend_ops`, `infra_sre` y `mobile_edge`.
- Evidencia: `backend/src/agent/agentProfiles.ts`, `backend/src/routes/agent.ts` y `backend/src/agent/langchainAgent.ts`.
- Resultado: el backend puede reforzar el contexto segun el tipo de pregunta sin romper el contrato JSON.

7. El contrato de respuesta debe validarse fuera del proveedor IA.
- Problema: una respuesta estructurada puede llegar incompleta o con tipos invalidos.
- Accion: se agrego `backend/src/agent/agentResponseSchema.ts` y `buildTrace()` valida todas las respuestas, incluyendo rules, mock, LangChain y fallback.
- Evidencia: `backend/tests/agent/langchainAgent.test.ts`.
- Resultado: una respuesta invalida queda marcada como `agent_response_schema_invalid` y se audita sin romper el endpoint del frontend.

8. Las trazas deben ser consultables sin leer storage interno.
- Problema: persistir auditoria no basta si el operador no puede inspeccionarla por API.
- Accion: se agrego `GET /api/agent/conversations/:conversationId/traces`, con resumen por turno: modo, specialist, intent, tool, tools, mensaje, error, claves de contexto e historial usado.
- Evidencia: `backend/src/routes/agent.ts`, `backend/src/agent/agentConversation.ts`, `backend/src/storage/agentAudit.ts`.
- Resultado: cada conversacion puede revisarse de forma operativa y compacta.

9. Las trazas necesitan retencion y las conversaciones largas necesitan compactacion.
- Problema: conservar trazas indefinidamente aumenta ruido operativo y rehidratar demasiados turnos degrada el contexto.
- Accion: se agrego retencion configurable en `backend/src/storage/db_json.ts` y `backend/src/storage/pg.ts`; tambien se agrego `compactConversationHistory()` para reemplazar turnos antiguos por un resumen automatico cuando el hilo supera el umbral.
- Evidencia: `backend/tests/storage/agentAudit.test.ts` y `backend/tests/agent/agentConversation.test.ts`.
- Resultado: el agente mantiene continuidad con menos contexto y el storage elimina trazas antiguas segun politica.

10. La configuracion efectiva debe ser visible para operacion.
- Problema: si los valores de retencion o compactacion solo viven en variables de entorno, cuesta diagnosticar el comportamiento real del agente.
- Accion: se agrego `backend/src/agent/agentAuditConfig.ts` y `GET /api/agent/admin/config`.
- Evidencia: `backend/src/routes/agent.ts` y `backend/tests/routes/agentRoutes.test.ts`.
- Resultado: operacion puede ver schema, retencion, compactacion y limites efectivos sin inspeccionar el proceso ni exponer secretos.

## Riesgos abiertos
- La politica de retencion ya es visible por API, pero no se puede cambiar en runtime sin reiniciar el proceso.
- El resumen automatico es deterministico y compacto; si el producto requiere resumen semantico mas rico, se puede agregar una fase IA auditada.
- El modo mock sigue siendo util para demo, pero puede ocultar fallas reales si se usa demasiado.

## Decisiones que se mantienen
- El agente debe consultar herramientas internas antes de inventar una respuesta.
- El backend sigue siendo la fuente de verdad para estados operativos.
- RabbitMQ y TimescaleDB siguen siendo el stack objetivo, con fallback local solo para desarrollo.

## Siguientes auditorias utiles
1. Guardar ejemplos de preguntas reales y respuesta esperada para regresion.
2. Evaluar resumen semantico asistido por IA solo si el resumen deterministico queda corto.
3. Definir si la configuracion de auditoria debe poder cambiar en runtime.

## Corpus de regresion
- El conjunto inicial de preguntas y respuestas esperadas vive en `docs/agent-regression-cases.json`.
- La suite que lo valida vive en `backend/tests/agent/agentRegressionCases.test.ts`.
