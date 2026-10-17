# ms-vacantes

Bounded context de gestión de vacantes implementado con Java 21, Spring Boot 3 y DDD.

## Interfaces

- HTTP REST: `8080`, health en `/api/v1/vacancies/health`.
- GraphQL: `/graphql`.
- MCP: `/mcp/tools` y `/mcp/execute`.
- gRPC: `9090`, servicio `recruitment.v1.VacancyService`.

REST, GraphQL y MCP validan JWT emitidos por el realm `recruitment` de Keycloak. El healthcheck y gRPC interno no requieren JWT.

## Ejecución

Desde la raíz del monorepo:

```shell
docker compose -f infra/docker-compose.yml up --build
```

El build genera las clases Java y gRPC directamente desde `proto/recruitment.proto`. Flyway crea el esquema al iniciar y el poller publica los eventos transaccionales en el exchange `recruitment.events`.

Las credenciales incluidas en Compose son únicamente para desarrollo y se pueden sustituir mediante variables de entorno.
