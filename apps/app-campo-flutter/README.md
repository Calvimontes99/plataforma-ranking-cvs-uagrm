# App móvil de captura en campo

Aplicación Flutter offline-first para capturar candidatos y sincronizarlos con
`ms-ingesta` a través del API Gateway.

## Ejecución

Desde esta carpeta:

```powershell
flutter pub get
flutter run
```

El emulador Android usa `http://10.0.2.2:8080` por defecto. Para un dispositivo
físico conectado por ADB, configura el gateway con:

```powershell
adb reverse tcp:8080 tcp:8080
flutter run --dart-define=GATEWAY_URL=http://127.0.0.1:8080
```

## Flujo offline-first

- Las capturas se guardan en SQLite en `captures`.
- Cada captura recibe un UUIDv4 de idempotencia al guardarse.
- `Sincronizar pendientes` procesa hasta 50 registros secuencialmente.
- Se envían `X-Idempotency-Key` e `Idempotency-Key` con el mismo UUIDv4 para
  compatibilidad con el gateway y la versión actual de `ms-ingesta`.
- Un registro solo se elimina de SQLite cuando la API responde HTTP 200 o 201.
- Las respuestas de error y los fallos de red dejan el registro pendiente para
  un nuevo intento.

La URL puede cambiarse sin editar código:

```powershell
flutter run --dart-define=GATEWAY_URL=http://192.168.1.50:8080
```
