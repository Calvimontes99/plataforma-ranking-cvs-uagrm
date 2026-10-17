# MASTER SPECIFICATION: PLATAFORMA EMPRESARIAL DE FILTRADO Y RANKING AUTOMÁTICO DE CVs (RRHH)

Actúa como un Arquitecto de Software Principal e Ingeniero Full-Stack Senior. Vamos a construir un sistema empresarial distribuido (Monorepo) para el Filtrado, Evaluación y Ranking Automático de CVs (Área Recursos Humanos), siguiendo estrictamente la metodología ICONIX y las siguientes reglas arquitectónicas innegociables:

## 1. ESTRUCTURA DEL MONOREPO Y STACK TECNOLÓGICO
El repositorio debe organizarse en la siguiente estructura de carpetas:
- `/infra`: Docker Compose, configuración de API Gateway (Nginx/Kong), Keycloak (SSO Realm export), RabbitMQ/Kafka, bases de datos y flujos de n8n.
- `/proto`: Archivos `.proto` compartidos para comunicación gRPC entre microservicios y el nodo de IA.
- `/services`:
  1. `/ms-vacantes` (Java 21 + Spring Boot 3):
     - **Base de Datos:** PostgreSQL (Relacional Transaccional).
     - **Arquitectura de Código:** DDD (Domain-Driven Design) estricto (`domain`, `application`, `infrastructure`, `interfaces`).
     - **Protocolos Expuestos:** GraphQL (exclusivo para el ERP en React), REST, gRPC Client/Server, y **MCP Server** (Tools de vacantes).
     - **Responsabilidad:** Gestión de departamentos, apertura de vacantes, cupos presupuestarios, etapas de selección, formalización de contratos y tabla `outbox_events`.
  2. `/ms-ingesta` (TypeScript + NestJS / Node 20):
     - **Base de Datos:** MongoDB (NoSQL Documental para JSON flexibles de CVs).
     - **Arquitectura de Código:** Arquitectura Hexagonal (Puertos y Adaptadores: `domain`, `application/ports`, `infrastructure/adapters`).
     - **Protocolos Expuestos:** REST (recepción de PDFs/imágenes), gRPC (envío de texto/embeddings al Nodo IA y MS-Ranking), y **MCP Server** (Resources de CVs).
     - **Responsabilidad:** Ingesta multicanal (Web, Móvil, WhatsApp/n8n), parsing de CVs, almacenamiento documental y tabla/colección `outbox_events`.
  3. `/ms-ranking` (PHP 8.3 + Laravel 11):
     - **Base de Datos:** AWS DynamoDB (usando DynamoDB Local en Docker para desarrollo).
     - **Arquitectura de Código:** Clean Architecture (`Entities`, `UseCases`, `InterfaceAdapters`, `Frameworks`).
     - **Protocolos Expuestos:** REST (con validación de `Idempotency-Key`), gRPC, y **MCP Server** (Tools de scoring).
     - **Responsabilidad:** Ranking en vivo por vacante, puntajes de compatibilidad, control de claves de idempotencia (`UUIDv4`), bitácoras de auditoría y eventos SAGA.
  4. `/ai-node` (Python 3.11 + FastAPI + gRPC):
     - **Tecnologías:** TensorFlow (CNN para OCR de CVs/certificados y análisis asíncrono de Video-CVs), Scikit-Learn / XGBoost (ML Supervisado para Score 0-100% y ML No Supervisado con K-Means para clustering de talento), Orquestador de Agentes (MCP Client/Host).
  5. `/cqrs-read-service` ( Servicio o vista materializada de lectura):
     - Escucha eventos de RabbitMQ/Kafka emitidos por PostgreSQL, MongoDB y DynamoDB para alimentar una base de datos de lectura desnormalizada (Read Model sin JOINs distribuidos) consumida por los Reportes Generativos.
- `/apps`:
  1. `/mf-erp-react` (React + TypeScript + Apollo Client): ERP de Gestión de RRHH consumiendo **GraphQL** (evitando Over-fetching) y panel de Agentes IA con misiones en lenguaje natural.
  2. `/mf-bi-angular` (Angular 17+): Portal de Inteligencia de Negocios, Dashboards y **Reportes Generativos por Voz** (Web Speech API / Audio -> Backend JSON Schema Guardrails -> ORM Read-Only -> Exportación a Excel `.xlsx` y PDF).
  3. `/mf-portal-vue` (Vue 3 + Vite + PWA): Portal público ligero del postulante con **Service Workers + IndexedDB** para soporte offline e **IA Local en navegador (TensorFlow.js / ONNX Runtime Web)** para validar si el archivo subido es un CV válido antes de enviarlo, adjuntando `Idempotency-Key`.
  4. `/app-campo-flutter` (Flutter): App móvil offline-first para ferias de empleo con **SQLite + TensorFlow Lite** (captura de CVs en foto sin internet y sincronización con `Idempotency-Key`).

## 2. PATRONES TRANSVERSALES OBLIGATORIOS
1. **Single Sign-On (SSO) + API Gateway:** Un único punto de entrada (Keycloak OAuth2/OIDC + Gateway). Un solo login/password permite saltar entre React, Angular, Vue y Flutter validando JWT.
2. **Patrón SAGA Orquestada + Transactional Outbox:**
   - Caso de uso transversal: *"Adjudicación de Vacante y Contratación de Candidato Seleccionado"*.
   - Paso 1 (`ms-ranking` en PHP/DynamoDB): Cambia estado a `Seleccionado`.
   - Paso 2 (`ms-ingesta` en NestJS/MongoDB): Bloquea expediente y da de baja postulaciones paralelas.
   - Paso 3 (`ms-vacantes` en Spring Boot/PostgreSQL): Descuenta cupo de vacante y crea contrato.
   - **Rollback/Compensación:** Si el Paso 3 falla (ej. cupo = 0), el Coordinador SAGA emite eventos de compensación por RabbitMQ/Kafka para revertir el Paso 2 en MongoDB y el Paso 1 en DynamoDB.
3. **Seguridad Anti-Inyección SQL/NoSQL en Reportes por Voz:**
   - Prohibido que el LLM ejecute SQL o consultas NoSQL crudas. El comando de voz se convierte estrictamente a un DTO validado con JSON Schema + Guardrails, y se consulta únicamente sobre el Read Model (CQRS) mediante un ORM parametrizado con usuario Read-Only.
4. **Automatización n8n:** Flujo exportable en JSON que recibe CV por Webhook de WhatsApp -> llama a `ms-ingesta` -> evalúa en `ms-ranking` / `ai-node` -> si score >= 85 registra pre-aprobación en `ms-vacantes` -> envía Email y WhatsApp de citación.

## 3. REGLAS DE GENERACIÓN DE CÓDIGO
- No generes código espagueti; respeta la separación de carpetas de **DDD** en Java, **Hexagonal** en NestJS y **Clean Architecture** en PHP.
- Incluye siempre los `Dockerfile` individuales y actualiza el `docker-compose.yml` general.
- Alinea cada módulo con el Análisis de Robustez de ICONIX (Boundary, Control, Entity).
