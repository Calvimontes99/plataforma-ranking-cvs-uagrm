from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CandidateScreeningAgent:
    """Rule-based, deterministic screening agent for an individual application."""

    top_tier_score: float = 85.0
    standard_score: float = 60.0
    top_tier_experience_years: float = 5.0
    standard_experience_years: float = 2.0
    critical_skills: tuple[str, ...] = ("python", "fastapi", "sql")

    def screen(self, skills: list[str], experience_years: float, compatibility_score: float) -> dict[str, Any]:
        normalized_skills = {skill.strip().casefold() for skill in skills}
        matched_critical = sorted(skill for skill in self.critical_skills if skill in normalized_skills)

        if compatibility_score >= self.top_tier_score and experience_years >= self.top_tier_experience_years and len(matched_critical) >= 2:
            category = "Top Tier"
            recommendation = "Candidato altamente recomendado para entrevista técnica inmediata por superar el umbral de compatibilidad, experiencia y skills críticas."
        elif compatibility_score >= self.standard_score and experience_years >= self.standard_experience_years:
            category = "Standard"
            recommendation = "Candidato viable para continuar en el proceso; se recomienda validar en entrevista las skills críticas pendientes."
        else:
            category = "Rechazado"
            reasons = []
            if compatibility_score < self.standard_score:
                reasons.append(f"compatibilidad inferior a {self.standard_score:.0f}%")
            if experience_years < self.standard_experience_years:
                reasons.append(f"experiencia inferior a {self.standard_experience_years:.0f} años")
            recommendation = "No se recomienda avanzar: " + " y ".join(reasons) + "."

        return {
            "agent": "CandidateScreeningAgent",
            "category": category,
            "recommendation": recommendation,
            "analysis": {
                "compatibilityScore": compatibility_score,
                "experienceYears": experience_years,
                "matchedCriticalSkills": matched_critical,
                "criticalSkillsRequired": list(self.critical_skills),
            },
        }
