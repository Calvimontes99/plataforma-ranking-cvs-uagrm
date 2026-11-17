# App móvil de captura en campo

Aplicación Flutter offline-first para capturar candidatos y sincronizarlos con
`ms-ingesta` a través del API Gateway.

## Ejecución

Desde esta carpeta:

```powershell
flutter pub get
flutter run
```

## Notificaciones push (Android / FCM)

La app solicita permiso de notificaciones (incluido Android 13+), obtiene el
token de la instalación y escucha mensajes en primer plano, segundo plano y al
abrirse desde una notificación. Para habilitarlo en un proyecto real:

1. Crea/selecciona un proyecto en Firebase Console y registra una app Android
   cuyo package name sea `com.example.app_campo` (el `applicationId` actual).
2. Instala/inicia sesión con Firebase CLI y FlutterFire CLI, y desde esta
   carpeta ejecuta `flutterfire configure`. Selecciona Android. Esto genera la
   configuración Firebase y aplica los ajustes Android requeridos.
3. Confirma que `android/app/google-services.json` está disponible localmente,
   luego ejecuta `flutter pub get` y reconstruye la app. No subas ese archivo
   si la política del proyecto lo excluye.
4. Para probar en un Honor Magic 8 Lite, instala la app desde un build de
   depuración y acepta el permiso de notificaciones. El dispositivo debe tener
   los servicios de Google Play activos para recibir FCM.

`PushNotificationService.instance.getToken()` expone el token FCM actual y
`onTokenRefresh` informa cuando cambia. La app registra y actualiza el token en
`POST /api/v1/notifications/register-token` al iniciar, porque actualmente no
tiene una pantalla de autenticación móvil. Envía `{ "token": "...", "platform": "android" }`.

Los mensajes de tipo `notification` los muestra Android automáticamente cuando
la app está en background/cerrada. En foreground se muestran como notificación
local. Los mensajes data-only se convierten en notificación local en foreground
y background. Para n8n se recomienda enviar `notification.title` y
`notification.body`, junto con `data.type` (por ejemplo `sync_completed` o
`priority_vacancy`) y el identificador relacionado. Al tocar el aviso, el tipo
de payload queda disponible en el handler para conectar navegación por ruta.

El emulador Android usa `http://10.0.2.2:8080` por defecto. Para un dispositivo
físico conectado por ADB, configura el gateway con:

```powershell
adb reverse tcp:8080 tcp:8080
flutter run --dart-define=GATEWAY_URL=http://127.0.0.1:8080
```

## Flujo offline-first

- Las capturas se guardan en SQLite en `captures`.
- Fotos de cámara y adjuntos PDF/DOCX se copian al almacenamiento privado de la app antes de registrar la captura; un CV por captura se envía al endpoint multipart de ingesta.
- `LocalCandidateAgent` muestra una preevaluación offline según completitud, puntaje local de CV (≥50%) y entrevista (≥60%). Es orientativa y no sustituye la evaluación del servidor.
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
