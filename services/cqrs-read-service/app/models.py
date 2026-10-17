from datetime import datetime

from sqlalchemy import DateTime, Float, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import JSON


class Base(DeclarativeBase):
    pass


JsonValue = JSON().with_variant(JSONB, "postgresql")


class ReadModelCandidaturaVacante(Base):
    __tablename__ = "read_model_candidaturas_vacantes"
    __table_args__ = (
        Index("ix_read_model_vacancy", "vacancy_id"),
        Index("ix_read_model_score", "score"),
        Index("ix_read_model_status", "application_status"),
    )

    projection_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    application_id: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    vacancy_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    candidate_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    resume_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    candidate_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    candidate_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    candidate_phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    salary_expectation: Mapped[float | None] = mapped_column(Float, nullable=True)
    application_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    ranking_position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ranking_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    score_breakdown: Mapped[dict | list | None] = mapped_column(JsonValue, nullable=True)
    skills: Mapped[dict | list | None] = mapped_column(JsonValue, nullable=True)
    experience: Mapped[dict | list | None] = mapped_column(JsonValue, nullable=True)
    education: Mapped[dict | list | None] = mapped_column(JsonValue, nullable=True)
    channel: Mapped[str | None] = mapped_column(String(64), nullable=True)
    vacancy_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    vacancy_department_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    vacancy_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    vacancy_required_skills: Mapped[dict | list | None] = mapped_column(JsonValue, nullable=True)
    vacancy_preferred_skills: Mapped[dict | list | None] = mapped_column(JsonValue, nullable=True)
    vacancy_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    vacancy_available_slots: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_event_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    projected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
