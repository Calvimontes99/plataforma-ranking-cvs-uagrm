# ms-ranking

Servicio Laravel 11 / PHP 8.3 con Clean Architecture. `Entities` y `UseCases` no dependen de HTTP, DynamoDB o RabbitMQ; los contratos están en `UseCases/Ports`, los gateways en `InterfaceAdapters/Gateways` y Laravel registra los adaptadores en `Frameworks/Providers`.

## Ejecución local mediante Docker Compose

Desde la raíz del monorepo:

```shell
docker compose -f infra/docker-compose.yml up --build ms-ranking
docker compose -f infra/docker-compose.yml exec ms-ranking php artisan test
```

En el arranque, `ranking:ensure-tables` crea en DynamoDB Local las tablas de ranking, SAGA, idempotencia, auditoría y outbox, además de sus índices. El contenedor ejecuta el servidor HTTP, consumidor RabbitMQ de eventos SAGA y poller de outbox.

REST:

- `GET /api/v1/ranking/vacancies/{vacancyId}?limit=20`
- `POST /api/v1/ranking/evaluate`
- `POST /api/v1/ranking/sagas` (también acepta el contrato de selección del proto en `POST /api/v1/ranking/select`)
- `POST /api/v1/ranking/revert`

Las operaciones de escritura protegidas requieren `Idempotency-Key` UUIDv4. La clave guarda hash de método/ruta/query/body, expira y devuelve la respuesta original en reintentos; reutilizarla con otro contenido responde 409.

MCP se publica en `GET /mcp/tools` y `POST /mcp/execute`, con `recalcular_puntaje_candidatos` y `obtener_top_ranking_vacante`.

La integración de Paso 3 llama al servicio gRPC `VacancyService` del proto compartido mediante HTTP/2 gRPC sin requerir extensiones PHP generadas. El scoring de IA usa el adaptador HTTP configurable `AI_NODE_HTTP_URL`; si el nodo no está disponible, se calcula una heurística local. Eventos de ranking y preaprobación salen mediante Outbox hacia el exchange RabbitMQ `recruitment.events`.
