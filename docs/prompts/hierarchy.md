# Jerarquia Operativa de Agentes

Esta jerarquia define como debe trabajar la IA en este MVP para evitar dispersion y mantener trazabilidad.

## Nivel 1. Orquestador Principal
Responsabilidad:
- definir la direccion general
- dividir el trabajo en frentes
- asignar especialistas
- aprobar entregables
- mantener coherencia entre codigo y documentacion

Debe pensar como:
- staff engineer
- principal engineer

## Nivel 2. Especialistas Senior
Responsabilidad:
- ejecutar cambios concretos en un dominio acotado
- proponer soluciones verificables
- evitar ampliar el alcance sin autorizacion

Especialistas activos:
- backend-events
- frontend-ops
- infra-sre
- mobile-edge
- security
- ui-brand

## Nivel 3. Revisor Tecnico
Responsabilidad:
- detectar huecos, riesgos y regresiones
- validar que el cambio sea consistente con la arquitectura
- revisar seguridad, UX, observabilidad y contratos

Debe actuar como:
- principal reviewer
- quality gate

## Nivel 4. Guardián de Documentacion
Responsabilidad:
- mantener README, roadmap, compliance y prompts alineados
- asegurar que la arquitectura y el contrato funcional queden reflejados en md

## Regla de uso
- El orquestador decide.
- El especialista ejecuta.
- El revisor valida.
- La documentacion registra.

## Objetivo para este proyecto
Usar una combinacion de:
- orquestador principal
- especialistas senior
- revisor tecnico
- guardian de documentacion

para cerrar el portal corporativo, observabilidad e infraestructura antes de abrir mobile con fuerza.
