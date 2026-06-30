# Validacion mobile en dispositivo real

Esta guia cierra la brecha de validacion fuerte de GPS/background para la app mobile.

## Objetivo
Verificar que la app:
- solicita permisos foreground y background
- registra el task de GPS
- registra el task de geofence
- captura fixes reales o simulados
- conserva eventos offline
- sincroniza contra el backend cuando vuelve la conexion

## Preparacion
1. Levanta backend y portal:
```powershell
cd D:\Github\Fullstack_Engineer\infra
docker compose up --build
```

2. Confirma backend:
```powershell
Invoke-RestMethod http://localhost:4001/health
```

3. Define la URL del backend para mobile.

Android emulator:
```powershell
$env:EXPO_PUBLIC_API_BASE_URL="http://10.0.2.2:4001"
```

iOS simulator:
```powershell
$env:EXPO_PUBLIC_API_BASE_URL="http://127.0.0.1:4001"
```

Telefono fisico en la misma red:
```powershell
$env:EXPO_PUBLIC_API_BASE_URL="http://TU_IP_LOCAL:4001"
```

## Ejecucion
```powershell
cd D:\Github\Fullstack_Engineer\mobile
npm install
npm run start:dev-client
```

Para probar background real usa una development build, no Expo Go:
```powershell
npm run android:dev-client
```

o:
```powershell
npm run ios:dev-client
```

## Checklist en pantalla
En la seccion `Datos del conductor`, revisar:
- `Readiness`: debe llegar a `ready` para prueba completa
- `Foreground`: `granted`
- `Background perm`: `granted`
- `Task manager`: `Disponible`
- `Background`: `Disponible`
- `Task`: `Registrado`
- `Geofence`: `Activo`

Si `Readiness` queda en `blocked`, revisar la linea `Bloqueos`.
Si queda en `warning`, la app puede funcionar parcialmente, pero la prueba no cuenta como validacion fuerte.

## Flujo de aceptacion
1. Completa conductor, vehiculo y ruta.
2. Pulsa `Guardar conductor`.
3. Pulsa `Iniciar tracking`.
4. Acepta ubicacion en uso.
5. Acepta ubicacion siempre/en segundo plano.
6. Confirma `Readiness = ready`.
7. Mueve la ubicacion simulada del emulador o camina con el dispositivo.
8. Confirma que aparece `Ultimo fix`.
9. Apaga red del dispositivo.
10. Genera fixes o pulsa `Ruta fija`.
11. Confirma eventos pendientes en cola.
12. Reactiva red.
13. Pulsa `Sincronizar`.
14. Confirma pendientes en cero.
15. Revisa backend:
```powershell
Invoke-RestMethod http://localhost:4001/api/telemetry/state
Invoke-RestMethod http://localhost:4001/api/telemetry/admin/ingestion
```

## Criterios de exito
- La pantalla muestra `Readiness = ready`.
- La app conserva eventos sin red.
- La sincronizacion envia eventos al backend.
- El portal web refleja el vehiculo mobile.
- `/api/telemetry/admin/ingestion` aumenta `receivedEvents` y `insertedEvents` o `updatedEvents`.

## Limitaciones actuales
- Background real depende de development build y permisos del sistema operativo.
- En Expo Go la ejecucion background puede no comportarse como en una build real.
- Aun falta automatizar esta prueba con dispositivo/emulador en CI.
