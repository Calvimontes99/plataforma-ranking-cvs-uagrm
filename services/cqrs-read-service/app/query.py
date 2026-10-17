import re
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ReportField(str, Enum):
    application_id = "application_id"
    vacancy_id = "vacancy_id"
    candidate_id = "candidate_id"
    resume_id = "resume_id"
    candidate_name = "candidate_name"
    candidate_email = "candidate_email"
    salary_expectation = "salary_expectation"
    application_status = "application_status"
    score = "score"
    ranking_position = "ranking_position"
    ranking_status = "ranking_status"
    skills = "skills"
    experience = "experience"
    education = "education"
    channel = "channel"
    vacancy_title = "vacancy_title"
    vacancy_title_contains = "vacancy_title"
    vacancy_department_id = "vacancy_department_id"
    vacancy_status = "vacancy_status"
    vacancy_available_slots = "vacancy_available_slots"
    created_at = "created_at"
    evaluated_at = "evaluated_at"


class QueryFilters(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    vacancy_id: str | None = Field(default=None, min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$")
    candidate_id: str | None = Field(default=None, min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$")
    application_status: str | None = Field(default=None, min_length=1, max_length=64)
    ranking_status: str | None = Field(default=None, min_length=1, max_length=64)
    vacancy_status: str | None = Field(default=None, min_length=1, max_length=64)
    channel: str | None = Field(default=None, min_length=1, max_length=64)
    min_score: float | None = Field(default=None, ge=0, le=100)
    max_score: float | None = Field(default=None, ge=0, le=100)
    min_salary: float | None = Field(default=None, ge=0, le=1_000_000_000)
    max_salary: float | None = Field(default=None, ge=0, le=1_000_000_000)
    candidate_name_contains: str | None = Field(default=None, min_length=1, max_length=120)
    vacancy_title_contains: str | None = Field(default=None, min_length=1, max_length=120)

    @field_validator("application_status", "ranking_status", "vacancy_status", "channel")
    @classmethod
    def safe_enum_string(cls, value: str | None) -> str | None:
        if value is not None and not re.fullmatch(r"[A-Za-z][A-Za-z0-9 _-]{0,63}", value):
            raise ValueError("invalid filter value")
        return value


class ReportQuery(BaseModel):
    """Allowlisted report query DTO. It deliberately has no SQL/expression field."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    filters: QueryFilters = Field(default_factory=QueryFilters)
    fields: list[ReportField] = Field(
        default_factory=lambda: [ReportField.application_id, ReportField.candidate_name,
                                 ReportField.vacancy_title, ReportField.score,
                                 ReportField.application_status],
        min_length=1,
        max_length=22,
    )
    limit: int = Field(default=100, ge=1, le=500)
    natural_language: str | None = Field(default=None, min_length=1, max_length=500)


class VoiceQueryRequest(ReportQuery):
    question: str | None = Field(default=None, min_length=1, max_length=500)


class ExportRequest(ReportQuery):
    format: str = Field(default="xlsx", pattern="^(xlsx|pdf)$")


INJECTION_PATTERNS = (
    re.compile(r"\b(select|insert|update|delete|drop|alter|truncate|union|exec(?:ute)?|pragma)\b", re.I),
    re.compile(r"(--|/\*|\*/|;|'\s*or\b|\"\s*or\b)", re.I),
    re.compile(r"\$(?:where|gt|gte|lt|lte|ne|in|nin|regex|expr|function|accumulator)\b", re.I),
    re.compile(r"\b(?:javascript|mapreduce)\s*:", re.I),
    re.compile(r"\b(ignore|override|bypass)\b.{0,40}\b(instructions?|guardrails?|rules?)\b", re.I),
    re.compile(r"\b(sql|query|database)\b.{0,30}\b(run|execute|raw|directly)\b", re.I),
)


class UnsafeQueryError(ValueError):
    pass


def reject_injection(text: str | None) -> None:
    if text and any(pattern.search(text) for pattern in INJECTION_PATTERNS):
        raise UnsafeQueryError("La consulta contiene instrucciones o sintaxis no permitidas")


def translate_natural_language(text: str, base: QueryFilters | None = None) -> QueryFilters:
    """Translate a small, deterministic vocabulary to a validated DTO, never to SQL."""
    reject_injection(text)
    data: dict[str, Any] = (base or QueryFilters()).model_dump(exclude_none=True)
    lowered = text.casefold()
    score_matches = re.findall(
        r"(?:score|puntaje|compatibilidad)\s*(?:(?:>=|mayor(?:\s+o\s+igual)?(?:\s+a|\s+que)?)|sobre|de)?\s*(\d{1,3}(?:\.\d+)?)",
        lowered,
    )
    if score_matches:
        data["min_score"] = float(score_matches[-1])
    max_matches = re.findall(
        r"(?:score|puntaje|compatibilidad)\s*(?:(?:<=|menor(?:\s+o\s+igual)?(?:\s+a|\s+que)?)|bajo)\s*(\d{1,3}(?:\.\d+)?)",
        lowered,
    )
    if max_matches:
        data["max_score"] = float(max_matches[-1])

    salary_limit = re.search(
        r"(?:pretensi[oó]n\s+salarial|salario|sueldo)"
        r"\s*(?:(?:<=|menor(?:\s+o\s+igual)?(?:\s+a|\s+que)?)|bajo)"
        r"\s*(\d{1,12}(?:[.,]\d{1,2})?)",
        lowered,
    )
    if salary_limit:
        data["max_salary"] = float(salary_limit.group(1).replace(",", "."))
    salary_floor = re.search(
        r"(?:pretensi[oó]n\s+salarial|salario|sueldo)"
        r"\s*(?:(?:>=|mayor(?:\s+o\s+igual)?(?:\s+a|\s+que)?)|sobre)"
        r"\s*(\d{1,12}(?:[.,]\d{1,2})?)",
        lowered,
    )
    if salary_floor:
        data["min_salary"] = float(salary_floor.group(1).replace(",", "."))

    statuses = {
        "recibida": "received", "recibido": "received", "evaluada": "evaluated",
        "preaprobada": "preapproved", "seleccionada": "selected", "rechazada": "rejected",
        "bloqueada": "locked", "withdrawn": "withdrawn",
    }
    for phrase, value in statuses.items():
        if phrase in lowered:
            data["application_status"] = value
            break

    vacancy = re.search(r"\b(?:vacante|vacancy)\s+(?:id\s*)?([a-z0-9_-]{1,128})\b", lowered)
    if vacancy:
        data["vacancy_id"] = vacancy.group(1)
    candidate = re.search(r"\b(?:candidato|candidate)\s+(?:id\s*)?([a-z0-9_-]{1,128})\b", lowered)
    if candidate:
        data["candidate_id"] = candidate.group(1)
    name = re.search(r"\b(?:nombre|candidato llamado)\s+([a-záéíóúñ][a-záéíóúñ -]{1,80})", lowered)
    if name:
        data["candidate_name_contains"] = name.group(1).strip()
    role = re.search(
        r"\b(?:cargo|puesto|posici[oó]n)\s+(?:de|para)\s+(.+?)"
        r"(?=\s+(?:con|y|que|puntaje|score|pretensi[oó]n|salario|sueldo|mayor|menor)\b|[,;.]|$)",
        lowered,
    )
    if role:
        data["vacancy_title_contains"] = role.group(1).strip()
    return QueryFilters.model_validate(data)
