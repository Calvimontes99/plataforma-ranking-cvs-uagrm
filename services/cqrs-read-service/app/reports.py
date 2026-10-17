from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.models import ReadModelCandidaturaVacante
from app.query import QueryFilters, ReportField, ReportQuery, UnsafeQueryError, reject_injection, translate_natural_language

MODEL_FIELDS = {field.value for field in ReportField}


def prepare_query(query: ReportQuery) -> ReportQuery:
    for value in query.model_dump(mode="json").values():
        if isinstance(value, str):
            reject_injection(value)
        elif isinstance(value, dict):
            for nested in value.values():
                if isinstance(nested, str):
                    reject_injection(nested)
    natural = getattr(query, "question", None) or query.natural_language
    if natural:
        query = query.model_copy(update={"filters": translate_natural_language(natural, query.filters)})
    return query


def run_report(session: Session, query: ReportQuery) -> list[dict[str, Any]]:
    query = prepare_query(query)
    model = ReadModelCandidaturaVacante
    conditions = [model.application_id.is_not(None)]
    filters = query.filters
    if filters.vacancy_id:
        conditions.append(model.vacancy_id == filters.vacancy_id)
    if filters.candidate_id:
        conditions.append(model.candidate_id == filters.candidate_id)
    if filters.application_status:
        conditions.append(model.application_status == filters.application_status)
    if filters.ranking_status:
        conditions.append(model.ranking_status == filters.ranking_status)
    if filters.vacancy_status:
        conditions.append(model.vacancy_status == filters.vacancy_status)
    if filters.channel:
        conditions.append(model.channel == filters.channel)
    if filters.min_score is not None:
        conditions.append(model.score >= filters.min_score)
    if filters.max_score is not None:
        conditions.append(model.score <= filters.max_score)
    if filters.min_salary is not None:
        conditions.append(model.salary_expectation >= filters.min_salary)
    if filters.max_salary is not None:
        conditions.append(model.salary_expectation <= filters.max_salary)
    if filters.candidate_name_contains:
        escaped = filters.candidate_name_contains.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        conditions.append(model.candidate_name.ilike(f"%{escaped}%", escape="\\"))
    if filters.vacancy_title_contains:
        escaped = filters.vacancy_title_contains.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        conditions.append(model.vacancy_title.ilike(f"%{escaped}%", escape="\\"))
    columns = [getattr(model, field.value).label(field.value) for field in query.fields]
    statement = (
        select(*columns)
        .where(and_(*conditions))
        .order_by(model.score.desc().nullslast(), model.evaluated_at.desc().nullslast())
        .limit(query.limit)
    )
    return [dict(row._mapping) for row in session.execute(statement).all()]
