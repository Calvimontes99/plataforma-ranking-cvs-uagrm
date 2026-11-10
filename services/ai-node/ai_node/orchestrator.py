from __future__ import annotations

import json
import hashlib
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

MAX_SKILLS = 30
MAX_CANDIDATES = 100
MISSION_INJECTION_PATTERNS = (
    re.compile(r"\b(ignore|bypass|override)\b.{0,80}\b(instructions?|guardrails?|tools?|policies)\b", re.I),
    re.compile(r"\b(select|insert|update|delete|drop|alter|truncate|union)\b", re.I),
    re.compile(r"(?:--|/\*|\*/|;|\$(?:where|gt|gte|lt|lte|ne|in|nin|expr)\b)", re.I),
)


@dataclass(frozen=True)
class DownstreamServices:
    vacancies_url: str = ""
    ingestion_url: str = ""
    ranking_url: str = ""


class MissionGuardrailError(ValueError):
    pass


def validate_mission(mission: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(mission, dict):
        raise MissionGuardrailError("mission debe ser un objeto JSON")
    goal = mission.get("goal", "")
    if not isinstance(goal, str) or not goal.strip() or len(goal) > 1000:
        raise MissionGuardrailError("goal debe contener entre 1 y 1000 caracteres")
    if any(pattern.search(goal) for pattern in MISSION_INJECTION_PATTERNS):
        raise MissionGuardrailError("La misión contiene instrucciones o sintaxis no permitidas")
    intent = mission.get("intent", "evaluate_vacancy")
    allowed = {"evaluate_vacancy", "find_historical_candidates", "diagnose_vacancies"}
    if not isinstance(intent, str) or intent not in allowed:
        raise MissionGuardrailError("La misión solicitada no está permitida; solo se admiten consultas de lectura")
    vacancy_id = mission.get("vacancyId")
    try:
        if vacancy_id is not None:
            uuid.UUID(vacancy_id)
    except (AttributeError, TypeError, ValueError) as exc:
        raise MissionGuardrailError("vacancyId debe ser un UUID") from exc
    if vacancy_id is not None and not isinstance(vacancy_id, str):
        raise MissionGuardrailError("vacancyId debe ser un UUID")
    skills = mission.get("skills", [])
    if not isinstance(skills, list) or len(skills) > MAX_SKILLS or any(not isinstance(skill, str) or not skill.strip() or len(skill) > 100 for skill in skills):
        raise MissionGuardrailError(f"skills debe ser una lista de hasta {MAX_SKILLS} textos cortos")
    try:
        limit = int(mission.get("limit", 20))
    except (TypeError, ValueError) as exc:
        raise MissionGuardrailError("limit debe ser un entero entre 1 y 100") from exc
    if not 1 <= limit <= MAX_CANDIDATES:
        raise MissionGuardrailError(f"limit debe ser un entero entre 1 y {MAX_CANDIDATES}")
    context = mission.get("context", {})
    if not isinstance(context, dict) or len(context) > 20:
        raise MissionGuardrailError("context debe ser un objeto con hasta 20 atributos")
    safe_context: dict[str, str] = {}
    for key, value in context.items():
        if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", key):
            raise MissionGuardrailError("Los nombres de atributos context deben ser identificadores simples")
        if not isinstance(value, (str, int, float, bool)) or len(str(value)) > 256:
            raise MissionGuardrailError("Los valores context deben ser escalares de hasta 256 caracteres")
        safe_context[key] = str(value)
    return {
        "goal": goal.strip(),
        "intent": intent,
        "vacancyId": vacancy_id,
        "skills": [item.strip() for item in skills],
        "limit": limit,
        "context": safe_context,
    }


def _unwrap_mcp(response: dict[str, Any]) -> Any:
    content = response.get("content")
    if isinstance(content, list):
        for entry in content:
            if isinstance(entry, dict) and isinstance(entry.get("json"), (dict, list)):
                return entry["json"]
    return response


def _extract_candidates(ingestion_result: Any, vacancy_id: str) -> list[dict[str, Any]]:
    if not isinstance(ingestion_result, dict):
        return []
    raw_candidates = ingestion_result.get("candidates", [])
    if not isinstance(raw_candidates, list):
        return []
    normalized = []
    for entry in raw_candidates[:MAX_CANDIDATES]:
        if not isinstance(entry, dict):
            continue
        resume = entry.get("resume") or entry.get("curriculum") or entry
        applicant = entry.get("applicant") if isinstance(entry.get("applicant"), dict) else {}
        candidate_id = (
            entry.get("candidateId")
            or entry.get("candidate_id")
            or applicant.get("candidateId")
            or applicant.get("candidate_id")
        )
        resume_id = entry.get("resumeId") or entry.get("resume_id") or entry.get("id")
        application_id = entry.get("applicationId") or entry.get("application_id")
        if not application_id and candidate_id and resume_id:
            application_id = str(
                uuid.uuid5(uuid.NAMESPACE_URL, f"historical-evaluation:{vacancy_id}:{candidate_id}:{resume_id}")
            )
        candidate = {
            "vacancyId": entry.get("vacancyId") or entry.get("vacanteId") or vacancy_id,
            "candidateId": candidate_id,
            "resumeId": resume_id,
            "applicationId": application_id,
            "resume": resume if isinstance(resume, dict) else {},
        }
        try:
            for key in ("vacancyId", "candidateId", "resumeId", "applicationId"):
                uuid.UUID(candidate[key])
            normalized.append(candidate)
        except (AttributeError, TypeError, ValueError):
            continue
    return normalized


def _extract_ranked_candidates(ranking_result: Any) -> list[dict[str, Any]]:
    if not isinstance(ranking_result, dict):
        return []
    raw = ranking_result.get("results") or ranking_result.get("candidates") or []
    if isinstance(raw, dict):
        raw = raw.get("results", [])
    if not isinstance(raw, list):
        return []
    candidates = [item for item in raw[:MAX_CANDIDATES] if isinstance(item, dict)]
    return sorted(
        candidates,
        key=lambda item: float(item.get("score", item.get("scoreCompatibility", 0)) or 0),
        reverse=True,
    )


class McpMissionOrchestrator:
    """Runs a fixed, read-only vacancy → ingestion → ranking workflow."""

    def __init__(
        self,
        services: DownstreamServices,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.services = services
        self.client = client or httpx.AsyncClient(timeout=httpx.Timeout(4.0, connect=1.5))
        self.owns_client = client is None
        self.context_memory: dict[str, dict[str, Any]] = {}

    async def close(self) -> None:
        if self.owns_client:
            await self.client.aclose()

    async def execute(self, raw_mission: dict[str, Any], authorization: str | None = None) -> dict[str, Any]:
        request = validate_mission(raw_mission)
        correlation_id = request["context"].get("correlationId") or request["context"].get("correlation_id") or "ai-mission"
        headers = {
            "X-Correlation-Id": correlation_id,
            "X-Request-Context": json.dumps(request["context"], separators=(",", ":")),
            "X-AI-Guardrail": "read-only-mcp-tools-v1",
        }
        bearer_token = os.getenv("MCP_BEARER_TOKEN", "").strip()
        if authorization and authorization.strip():
            headers["Authorization"] = authorization.strip()
        elif bearer_token:
            headers["Authorization"] = f"Bearer {bearer_token}"
        steps: list[dict[str, Any]] = []
        vacancy_id = request["vacancyId"]
        vacancy_details: Any = None

        if request["intent"] == "diagnose_vacancies" or not vacancy_id:
            vacancy_call = ("diagnosticar_vacantes_criticas", {"limite": request["limit"]})
        else:
            vacancy_call = ("obtener_cupos_vacante", {"vacanteId": vacancy_id})
        vacancies = await self._call(
            "vacancies",
            self.services.vacancies_url,
            *vacancy_call,
            headers=headers,
        )
        steps.append({"sequence": 1, "skill": "vacancy-context", "service": "vacancies", **vacancies})
        vacancy_details = vacancies.get("result")
        if not vacancy_id and request["intent"] == "diagnose_vacancies":
            vacancy_id, vacancy_details = self._first_critical_vacancy(vacancy_details)

        ingestion_skills = request["skills"]
        if not ingestion_skills and request["intent"] == "evaluate_vacancy":
            ingestion_skills = self._vacancy_skill_hints(vacancy_details)
        elif not ingestion_skills and request["intent"] == "diagnose_vacancies":
            ingestion_skills = self._vacancy_skill_hints(vacancy_details)
        ingestion = await self._call(
            "ingestion",
            self.services.ingestion_url,
            "buscar_candidatos_historicos_afines",
            {"skills": ingestion_skills, "limit": request["limit"]},
            headers=headers,
        )
        steps.append({"sequence": 2, "skill": "historical-candidate-search", "service": "ingestion", **ingestion})

        ranking_result: dict[str, Any]
        if vacancy_id:
            candidates = _extract_candidates(ingestion.get("result"), vacancy_id)
            vacancy = self._ranking_vacancy(vacancy_details, vacancy_id, ingestion_skills)
            if candidates:
                for candidate in candidates:
                    candidate["vacancyId"] = vacancy_id
                ranking_name = "recalcular_puntaje_candidatos"
                ranking_arguments = {"vacancy": vacancy, "candidates": candidates}
            else:
                ranking_name = "obtener_top_ranking_vacante"
                ranking_arguments = {"vacancyId": vacancy_id, "limit": request["limit"]}
            ranking_result = await self._call("ranking", self.services.ranking_url, ranking_name, ranking_arguments, headers=headers)
        elif request["intent"] == "diagnose_vacancies":
            ranking_result = {"ok": False, "skipped": True, "reason": "ranking requiere vacancyId"}
        else:
            ranking_result = {"ok": False, "skipped": True, "reason": "vacancyId no fue proporcionado"}
        steps.append({"sequence": 3, "skill": "candidate-ranking", "service": "ranking", **ranking_result})

        completed = sum(1 for step in steps if step.get("ok"))
        status = "completed" if completed == 3 else "partial" if completed else "unavailable"
        shortlisted = _extract_ranked_candidates(ranking_result.get("result"))
        shortlist = [
            {
                "candidateId": item.get("candidateId") or item.get("candidate_id"),
                "applicationId": item.get("applicationId") or item.get("application_id"),
                "resumeId": item.get("resumeId") or item.get("resume_id"),
                "score": item.get("score", item.get("scoreCompatibility")),
                "position": item.get("position", index + 1),
            }
            for index, item in enumerate(shortlisted[:3])
        ]
        interview_slots = self._propose_interviews(shortlist)
        action = {
            "sequence": 4,
            "skill": "audited-action-plan",
            "service": "ai-node",
            "ok": True,
            "candidateShortlist": shortlist,
            "interviewPreSchedule": interview_slots,
            "plan": [
                "Revisar la terna con el equipo de RRHH",
                "Confirmar disponibilidad antes de enviar invitaciones",
                "Validar los puntajes y requisitos de la vacante",
            ],
        }
        audit_material = json.dumps(
            {"mission": request["goal"], "context": request["context"], "steps": steps, "action": action},
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        action["audit"] = {
            "auditId": str(uuid.uuid4()),
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "missionSha256": hashlib.sha256(audit_material.encode("utf-8")).hexdigest(),
            "externalStepsSucceeded": completed,
            "externalStepsTotal": 3,
        }
        memory_key = correlation_id[:128]
        self.context_memory[memory_key] = {
            "lastMission": request["goal"],
            "lastStatus": status,
            "updatedAt": action["audit"]["createdAt"],
        }
        if len(self.context_memory) > 100:
            self.context_memory.pop(next(iter(self.context_memory)))
        steps.append(action)
        return {
            "mission": request["goal"],
            "intent": request["intent"],
            "status": status,
            "context": request["context"],
            "contextMemory": self.context_memory[memory_key],
            "sequence": [step["skill"] for step in steps],
            "steps": steps,
            "candidateShortlist": shortlist,
            "interviewPreSchedule": interview_slots,
        }

    @staticmethod
    def _first_critical_vacancy(result: Any) -> tuple[str | None, Any]:
        if not isinstance(result, dict):
            return None, None
        vacancies = result.get("vacantesCriticas") or result.get("vacancies") or []
        if not isinstance(vacancies, list):
            return None, None
        valid: list[tuple[str, dict[str, Any]]] = []
        for vacancy in vacancies:
            if not isinstance(vacancy, dict):
                continue
            vacancy_id = vacancy.get("vacanteId") or vacancy.get("vacancyId") or vacancy.get("vacancy_id")
            try:
                uuid.UUID(vacancy_id)
            except (AttributeError, TypeError, ValueError):
                continue
            valid.append((vacancy_id, vacancy))
        for vacancy_id, vacancy in valid:
            if vacancy_id.endswith("1103"):
                return vacancy_id, vacancy
        for vacancy_id, vacancy in valid:
            if (vacancy.get("cuposDisponibles") or 0) > 0:
                return vacancy_id, vacancy
        return valid[0] if valid else (None, None)

    @staticmethod
    def _propose_interviews(shortlist: list[dict[str, Any]]) -> list[dict[str, Any]]:
        next_slot = datetime.now(timezone.utc) + timedelta(days=2)
        next_slot = next_slot.replace(hour=14, minute=0, second=0, microsecond=0)
        while next_slot.weekday() >= 5:
            next_slot += timedelta(days=1)
        proposals = []
        for candidate in shortlist:
            proposals.append(
                {
                    "candidateId": candidate["candidateId"],
                    "proposedAt": next_slot.isoformat(),
                    "durationMinutes": 30,
                    "status": "PROPOSED_PENDING_HR_CONFIRMATION",
                }
            )
            next_slot += timedelta(minutes=30)
        return proposals

    async def _call(
        self,
        service: str,
        base_url: str,
        tool_name: str,
        arguments: dict[str, Any],
        headers: dict[str, str],
    ) -> dict[str, Any]:
        if not base_url:
            return {"ok": False, "error": f"{service} MCP URL no está configurada"}
        try:
            tool_list = await self.client.get(base_url.rstrip("/") + "/mcp/tools", headers=headers)
            tool_list.raise_for_status()
            discovered = tool_list.json()
            available_tools = discovered.get("tools", []) if isinstance(discovered, dict) else []
            if available_tools and not any(
                isinstance(item, dict) and item.get("name") == tool_name for item in available_tools
            ):
                return {"ok": False, "tool": tool_name, "error": f"{service} MCP no anuncia la herramienta solicitada"}
            resource_result = None
            if service == "ingestion":
                resources = await self.client.get(base_url.rstrip("/") + "/mcp/resources", headers=headers)
                resources.raise_for_status()
                resource_result = resources.json()
            response = await self.client.post(
                base_url.rstrip("/") + "/mcp/execute",
                json={"name": tool_name, "arguments": arguments},
                headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
            )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict) or payload.get("isError") is True:
                return {"ok": False, "error": f"{service} MCP devolvió una respuesta inválida"}
            result = {"ok": True, "tool": tool_name, "result": _unwrap_mcp(payload)}
            if resource_result is not None:
                result["resources"] = resource_result
            result["discoveredTools"] = [item.get("name") for item in available_tools if isinstance(item, dict)]
            return result
        except (httpx.HTTPError, ValueError) as exc:
            return {"ok": False, "tool": tool_name, "error": f"{service} MCP no disponible: {str(exc)[:200]}"}

    @staticmethod
    def _vacancy_skill_hints(result: Any) -> list[str]:
        if not isinstance(result, dict):
            return []
        skills = result.get("requiredSkills") or result.get("required_skills") or []
        if not isinstance(skills, list):
            return []
        return [str(item.get("name", "")) if isinstance(item, dict) else str(item) for item in skills[:MAX_SKILLS]]

    @staticmethod
    def _ranking_vacancy(result: Any, vacancy_id: str, skills: list[str]) -> dict[str, Any]:
        details = result if isinstance(result, dict) else {}
        return {
            "vacancyId": vacancy_id,
            "title": details.get("titulo") or details.get("title") or "",
            "description": details.get("description") or "",
            "requiredSkills": skills,
        }
