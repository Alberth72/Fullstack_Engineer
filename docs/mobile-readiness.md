# Readiness Mobile

Este documento resume el estado actual de la app del conductor y lo que falta para abrirla a pruebas reales en dispositivo.

## Decision de stack
- Framework: React Native
- Lenguaje: TypeScript
- Persistencia local: SQLite como primera opcion
- CI/CD: GitHub Actions + Fastlane

## Por que este stack
- Es suficiente para una app offline-first de captura de coordenadas.
- Reduce complejidad frente a un stack local mas pesado.
- Encaja con el MVP actual y con el contrato de backend ya existente.

## Contrato minimo de la app
- Captura GPS del conductor: base tecnica creada con checklist de permisos/background, pendiente evidencia en dispositivo.
- Guarda eventos localmente cuando no hay red: implementado con SQLite y fallback en memoria.
- Reintenta sincronizacion en bloque al reconectar: implementado a nivel de servicio y smoke test.
- Evita duplicados con un identificador estable: implementado por `eventId`.
- Muestra estado de sincronizacion en la UI: implementado en pantalla base.
- Muestra readiness de tracking real: implementado con foreground permission, background permission, TaskManager, background GPS, task GPS, geofence y backend.

## Contrato de datos sugerido
- `eventId`
- `vehicle_id`
- `latitude`
- `longitude`
- `speed`
- `status`
- `timestamp`
- `syncStatus`

## Backend que ya sirve de base
- `POST /api/telemetry/event`
- `POST /api/telemetry/events/batch`
- `GET /api/telemetry/state`
- `GET /api/telemetry/summary`
- `GET /health`

## Estado verificado
- `npm run typecheck` pasa.
- `npm test` pasa y valida ruta demo, readiness GPS, cola offline, fallo de red, reintento y sync por lotes.
- La app usa Expo/React Native, TypeScript, SQLite y transporte HTTP contra `POST /api/telemetry/events/batch`.
- La guia para validar en dispositivo real vive en `docs/mobile-device-validation.md`.

## Siguiente sprint mobile recomendado
1. Ejecutar y registrar evidencia de permisos/captura GPS en Android/iOS con Expo dev client.
2. Validar reconexion real y estados de error prolongado en dispositivo/emulador.
3. Agregar pruebas Maestro contra una build de desarrollo.
4. Automatizar o semiautomatizar el flujo de `docs/mobile-device-validation.md`.
5. Agregar CI/CD inicial para typecheck, smoke y build movil.
