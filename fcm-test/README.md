# Prueba manual de Firebase Cloud Messaging

Coloca la clave de cuenta de servicio de Firebase como
`fcm-test/service-account.json`. Ese archivo está excluido de Git.

Desde PowerShell, en la raíz del monorepo:

```powershell
$env:FCM_TEST_TOKEN = "TOKEN_FCM_DEL_HONOR"
npm --prefix .\fcm-test install
npm --prefix .\fcm-test run send
Remove-Item Env:FCM_TEST_TOKEN
```

El script no imprime ni persiste el token. Firebase devuelve un ID cuando
acepta el envío; la entrega al dispositivo depende de que el token siga vigente,
la app haya solicitado permiso de notificaciones y el Honor tenga Google Play
Services y conexión. El payload Android va con prioridad alta y visibilidad
pública, pero la pantalla bloqueada también depende de los ajustes de
notificaciones del dispositivo.
