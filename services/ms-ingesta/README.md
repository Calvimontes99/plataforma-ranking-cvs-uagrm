# ms-ingesta

Servicio NestJS de recepción y gestión documental de CVs con arquitectura hexagonal. Los adaptadores de entrada REST, gRPC y RabbitMQ invocan casos de uso de aplicación; los puertos de salida separan MongoDB, IA y publicación de eventos.

## Desarrollo

Desde este directorio:

```shell
npm ci
npm run build
npm test
npm run start:dev
```

Copiar `.env.example` a `.env` y ajustar conexiones. La API HTTP usa `POST /api/v1/ingestion/cvs`, `/api/v1/ingestion/cvs/upload` y `/api/v1/ingestion/whatsapp`; cada solicitud requiere `Idempotency-Key` en formato UUIDv4. El payload JSON permite un objeto CV flexible (`resume`) y metadatos de candidato, vacante y canal.

## Push móvil y eventos en tiempo real

- `POST /api/v1/notifications/register-token` registra o actualiza un token FCM (`token`, `platform` y `userId` opcional). La app móvil se registra al iniciar y vuelve a registrar el token si Firebase lo rota.
- `GET /api/v1/notifications/events` entrega eventos SSE para cambios de vacante/ranking y CVs recibidos. El ERP usa estos eventos para volver a consultar sus vistas GraphQL.
- El consumidor RabbitMQ escucha el exchange `recruitment.events` y mantiene una cola durable `notifications.events`; consume los outbox de vacantes, ranking y `cv.ingested`.
- Configura `FIREBASE_SERVICE_ACCOUNT_JSON` con el JSON de servicio de Firebase Admin en el entorno del contenedor, o usa Google Application Default Credentials. No guardes credenciales en el repositorio. Sin credenciales, SSE sigue activo y FCM queda deshabilitado con un aviso en logs.

La entrega de RabbitMQ y FCM es asíncrona y puede repetirse si hay reintentos; los consumidores del evento deben tolerar duplicados.

El servicio expone el catálogo MCP HTTP en `GET /mcp/resources` y `GET /mcp/tools`, lectura de CV en `/mcp/resources/cvs/:id`, y ejecución de `buscar_candidatos_historicos_afines` por `/mcp/execute` (también disponible en `/mcp/tools/buscar_candidatos_historicos_afines`). Health está en `/health`, e `IngestionService` gRPC en el puerto 9091. La indisponibilidad de `ai-node` activa extracción local de texto JSON y registra una advertencia en el documento/outbox.

El consumidor SAGA escucha `ingesta.saga.commands`; los comandos admitidos son `SagaStep2BlockDossier` y `SagaStep2CompensateDossier`. El poller publica eventos de `outbox_events` en el exchange `recruitment.events`. MongoDB debe operar como replica set (Compose configura un replica set local de un nodo) para habilitar transacciones del outbox y la SAGA. Los uploads se limitan a 10 MiB para que el binario codificado en base64 permanezca bajo el límite BSON de 16 MiB.
