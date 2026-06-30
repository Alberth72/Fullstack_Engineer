# Mobile Driver App

Base de la app del conductor para captura offline-first de coordenadas.

## Stack acordado
- React Native
- TypeScript
- Persistencia local: SQLite como primera base
- CI/CD: GitHub Actions + Fastlane

## Objetivo funcional
- Capturar coordenadas y velocidad del conductor
- Capturar GPS real con Expo Location mientras la app esta activa
- Persistir eventos localmente cuando no haya red
- Sincronizar por lotes al reconectar
- Evitar duplicados con `eventId`
- Exponer estado de sincronizacion en pantalla

## Contratos de datos
- `eventId`
- `vehicle_id`
- `latitude`
- `longitude`
- `speed`
- `status`
- `timestamp`
- `syncStatus`

## Prioridad de construccion
1. Estructura base de la app
2. Modelo local de eventos
3. Cola offline
4. Persistencia SQLite
5. Sync por lotes
6. Estado de sync visible
7. Automatizacion de despliegue

## Estructura inicial
- `App.tsx`: entrada principal de Expo con la pantalla de sync
- `src/background/locationTask.ts`: task global que captura y encola fixes en background
- `src/background/geofenceTask.ts`: task global que convierte entradas/salidas de zona en eventos
- `src/contracts/telemetry.ts`: tipos compartidos con backend
- `src/domain/eventFactory.ts`: creacion y normalizacion de eventos
- `src/domain/demoTelemetry.ts`: eventos de prueba para la demo
- `src/hooks/useBackgroundDriverTracking.ts`: control de inicio/parada y permisos
- `src/storage/offlineQueue.ts`: contratos de la cola y reglas de merge
- `src/storage/geofenceZones.ts`: zonas operativas para demo y validacion
- `src/storage/inMemoryOfflineQueue.ts`: store base para pruebas y arranque
- `src/storage/sqliteDriverContext.ts`: perfil del conductor persistido en SQLite
- `src/storage/sqliteOfflineQueue.ts`: adaptador SQLite real con Expo SQLite
- `src/adapters/httpTelemetryTransport.ts`: puente HTTP hacia el backend
- `src/app/createMobileEnvironment.ts`: orquestacion del entorno mobile
- `src/services/telemetrySyncService.ts`: orquestacion de cola y sincronizacion
- `src/ui/SyncStatusScreen.tsx`: pantalla minima para estado de sync
- `src/index.ts`: exportaciones publicas del modulo movil

## Arranque
- `npm install`
- `npm run start:dev-client`
- `npm run android:dev-client` o `npm run ios:dev-client` para probar background real
- `npm test` para validar la ruta demo, la cola offline, fallo de red, reintento y sincronizacion por lotes
- `npm run test:maestro` para correr el flujo Maestro contra una build de desarrollo instalada

## Flujo end-to-end
1. Levanta el backend y el portal local como ya lo venimos usando.
2. Ejecuta `npm run start:dev-client` en `mobile/`.
3. Abre la build de desarrollo en un emulador o dispositivo fisico.
4. Completa conductor, vehiculo y ruta.
5. Pulsa `Iniciar tracking`.
6. Pulsa `Ruta fija` para inyectar una secuencia completa de GPS, arranque, parada y geofence sin mover el emulador.
7. Si quieres validar manualmente, mueve la ubicacion simulada para generar fixes y cruces de geofence.
8. Pulsa `Sincronizar` y valida que la cola baje y que el backend responda saludable.

## Validacion fuerte en dispositivo
- Guia operativa: `docs/mobile-device-validation.md`
- La pantalla muestra `Readiness`, permisos foreground/background, disponibilidad de TaskManager, background GPS, task GPS y task geofence.
- La prueba fuerte cuenta como valida cuando `Readiness = ready`, hay fixes capturados, eventos offline en cola y sincronizacion exitosa contra el backend.

## Importante para background
- El tracking en segundo plano requiere un development build de Expo.
- Si usas Expo Go, el task de background puede no ejecutarse como en el dispositivo real.

## Maestro
- Flujo principal: `maestro/flows/mobile-smoke.yaml`
- `appId`: `com.fullstackengineer.fleetdriver`
- El flujo cubre perfil del conductor, tracking, ruta demo y sincronizacion
- Antes de correrlo, instala una development build con ese identificador en el emulador o dispositivo
- Ejecucion: `npm run test:maestro`

## Integracion con backend
- `POST /api/telemetry/event`
- `POST /api/telemetry/events/batch`
- `GET /health`

## Comportamiento automatico
- Cada fix GPS se convierte en un evento de telemetria y se encola localmente.
- La pantalla muestra permiso GPS, tracking, geofences, ultimo fix, cola y resumen de lotes.
- El perfil del conductor se guarda en SQLite para que el task de background use el vehiculo correcto.
- Los eventos de geofence entran en la misma cola local con `status` operativo.

## Nota tecnica
Este scaffold usa Expo + SQLite de Expo para acelerar la base del MVP. Si prefieres una app bare React Native, la misma capa de dominio y sincronizacion puede reutilizarse con otro adaptador SQLite.

## Nota operativa
La app debe permanecer aislada del portal web y compartir solo contratos de datos y reglas de sincronizacion.
