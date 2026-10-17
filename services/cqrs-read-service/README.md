# CQRS Read Service

Python 3.11/FastAPI service consuming the `recruitment.events` RabbitMQ topic
exchange and maintaining a denormalized `read_model_candidaturas_vacantes`
projection in PostgreSQL. It consumes vacancy, ingestion, and ranking events;
reports never perform joins against other service databases.

## Runtime

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Writer connection used by schema initialization and the RabbitMQ projection consumer. |
| `REPORT_DATABASE_URL` | Least-privilege PostgreSQL reader connection for report requests. |
| `RABBITMQ_URL` | RabbitMQ connection URL. |
| `RABBITMQ_EXCHANGE` | Durable event topic exchange, defaults to `recruitment.events`. |
| `RABBITMQ_QUEUE` | Durable projection queue. |
| `PORT` | HTTP port, defaults to `8080`. |

Compose initializes a dedicated report database role with `SELECT` privileges.
The query path also starts each PostgreSQL transaction with
`SET TRANSACTION READ ONLY`. SQL is assembled exclusively from allowlisted
Pydantic DTO fields through parameterized SQLAlchemy ORM expressions. The
natural-language parser does not accept SQL or NoSQL expressions.

## HTTP API

- `GET /health`
- `GET /reports/schema`
- `POST /reports/voice-query`
- `POST /reports/export` with `format` set to `xlsx` or `pdf`

The same report endpoints are mounted under `/api/v1/read/` for the Nginx
gateway prefix. Voice filters include vacancy title, candidate name, score, and
salary expectation ranges. For example:

```json
{
  "question": "candidatos al cargo de Ingeniero de Sistemas con puntaje mayor a 80 y pretensión salarial menor a 9000 bolivianos",
  "fields": ["candidate_name", "vacancy_title", "score", "salary_expectation"],
  "limit": 50
}
```

## Tests

From this directory run `python -m pytest -q`.
