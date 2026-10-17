import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models import ReadModelCandidaturaVacante

logger = logging.getLogger(__name__)


def _pick(source: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = source.get(key)
        if value is not None:
            return value
    return None


def _as_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _payload(event: dict[str, Any]) -> dict[str, Any]:
    value = event.get("payload", event.get("data", event))
    return value if isinstance(value, dict) else {}


def _normalized_fields(event: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    details = data.get("vacancy") if isinstance(data.get("vacancy"), dict) else data
    resume = data.get("resume") if isinstance(data.get("resume"), dict) else data
    candidate = data.get("candidate") if isinstance(data.get("candidate"), dict) else data
    ranking = data.get("ranking") if isinstance(data.get("ranking"), dict) else data
    breakdown = _pick(ranking, "breakdown", "scoreBreakdown", "score_breakdown")
    fields = {
        "application_id": _pick(data, "applicationId", "application_id"),
        "vacancy_id": _pick(data, "vacancyId", "vacancy_id") or _pick(details, "vacancyId", "vacancy_id"),
        "candidate_id": _pick(data, "candidateId", "candidate_id") or _pick(candidate, "candidateId", "candidate_id"),
        "resume_id": _pick(data, "resumeId", "resume_id"),
        "candidate_name": _pick(candidate, "fullName", "full_name", "candidateName", "candidate_name", "name"),
        "candidate_email": _pick(candidate, "email"),
        "candidate_phone": _pick(candidate, "phone"),
        "salary_expectation": _pick(
            candidate,
            "salaryExpectation",
            "salary_expectation",
            "expectedSalary",
            "expected_salary",
            "pretensionSalarial",
            "pretension_salarial",
        ),
        "application_status": _pick(data, "applicationStatus", "application_status"),
        "score": _pick(ranking, "score", "scoreCompatibility", "score_compatibilidad"),
        "ranking_position": _pick(ranking, "position", "rankingPosition", "ranking_position"),
        "ranking_status": _pick(ranking, "rankingStatus", "ranking_status", "status"),
        "score_breakdown": breakdown,
        "skills": _pick(resume, "skills"),
        "experience": _pick(resume, "experience"),
        "education": _pick(resume, "education"),
        "channel": _pick(data, "channel", "source"),
        "vacancy_title": _pick(details, "title", "vacancyTitle", "vacancy_title"),
        "vacancy_department_id": _pick(details, "departmentId", "department_id"),
        "vacancy_description": _pick(details, "description"),
        "vacancy_required_skills": _pick(details, "requiredSkills", "required_skills"),
        "vacancy_preferred_skills": _pick(details, "preferredSkills", "preferred_skills"),
        "vacancy_status": _pick(details, "vacancyStatus", "vacancy_status", "estado"),
        "vacancy_available_slots": _pick(
            details, "availableSlots", "available_slots", "vacancyAvailableSlots", "remainingSlots", "cupoDisponible"
        ),
        "source_event_id": _pick(event, "eventId", "event_id", "id"),
        "created_at": _as_datetime(_pick(data, "createdAt", "created_at", "occurredAt", "occurred_at")),
        "updated_at": _as_datetime(_pick(data, "updatedAt", "updated_at")),
        "evaluated_at": _as_datetime(_pick(ranking, "evaluatedAt", "evaluated_at")),
    }
    return {key: value for key, value in fields.items() if value is not None}


class ProjectionRepository:
    def __init__(self, session: Session):
        self.session = session

    def apply_event(self, event: dict[str, Any]) -> int:
        """Apply a single source event idempotently to the denormalized projection."""
        event_type = str(event.get("eventType") or event.get("event_type") or "")
        data = _payload(event)
        values = _normalized_fields(event, data)
        is_vacancy = "vacanc" in event_type.casefold() and any(
            word in event_type.casefold() for word in ("open", "creat", "updat", "publish", "vacancy")
        )
        if not values.get("vacancy_id"):
            return 0

        if is_vacancy and not values.get("application_id"):
            values["projection_id"] = f"vacancy:{values['vacancy_id']}"
            self._upsert(values)
            self.session.execute(
                update(ReadModelCandidaturaVacante)
                .where(ReadModelCandidaturaVacante.vacancy_id == values["vacancy_id"])
                .values(**{k: v for k, v in values.items() if k not in {"projection_id", "application_id"}})
            )
            self.session.commit()
            return 1

        application_id = values.get("application_id")
        # Ingestion event names applicationId; some candidate events carry it nested.
        if not application_id:
            return 0
        vacancy_snapshot = self.session.get(ReadModelCandidaturaVacante, f"vacancy:{values['vacancy_id']}")
        if vacancy_snapshot:
            for column in (
                "vacancy_title", "vacancy_department_id", "vacancy_description",
                "vacancy_required_skills", "vacancy_preferred_skills", "vacancy_status",
                "vacancy_available_slots",
            ):
                values.setdefault(column, getattr(vacancy_snapshot, column))

        kind = event_type.casefold()
        if "ingest" in kind or "cv." in kind:
            values.setdefault("application_status", "received")
        if "scoring.requested" in kind:
            values.setdefault("application_status", "processing")
        if "rank" in kind or "score" in kind:
            values.setdefault("application_status", "evaluated")
            values.setdefault("ranking_status", _pick(data, "status"))
        if "preapproved" in kind or "preaprob" in kind:
            values["application_status"] = "preapproved"
            values["ranking_status"] = "PRE_APROBADO"
        if "selected" in kind or "seleccion" in kind:
            values["application_status"] = "selected"
            values["ranking_status"] = "SELECCIONADO"
        if "vacancyadjudicated" in kind:
            values.setdefault("application_status", "selected")
        values["projection_id"] = f"application:{application_id}"
        self._upsert(values)
        self.session.commit()
        return 1

    def _upsert(self, values: dict[str, Any]) -> None:
        model = ReadModelCandidaturaVacante
        table = model.__table__
        dialect = self.session.get_bind().dialect.name
        if dialect == "postgresql":
            statement = pg_insert(model).values(**values)
            update_values = {
                key: func.coalesce(getattr(statement.excluded, key), table.c[key])
                for key in values
                if key not in {"projection_id", "application_id"}
            }
            update_values["projected_at"] = func.now()
            self.session.execute(
                statement.on_conflict_do_update(index_elements=[table.c.projection_id], set_=update_values)
            )
        elif dialect == "sqlite":
            statement = sqlite_insert(model).values(**values)
            update_values = {
                key: func.coalesce(getattr(statement.excluded, key), table.c[key])
                for key in values
                if key not in {"projection_id", "application_id"}
            }
            self.session.execute(
                statement.on_conflict_do_update(index_elements=[table.c.projection_id], set_=update_values)
            )
        else:
            row = self.session.get(model, values["projection_id"])
            if row is None:
                self.session.add(model(**values))
            else:
                for key, value in values.items():
                    if key != "projection_id":
                        setattr(row, key, value)


def decode_event(body: bytes) -> dict[str, Any]:
    event = json.loads(body.decode("utf-8"))
    if not isinstance(event, dict):
        raise ValueError("RabbitMQ event must be a JSON object")
    return event
