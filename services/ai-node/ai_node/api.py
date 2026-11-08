from __future__ import annotations

import base64
import binascii
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from ai_node import __version__
from ai_node.inference import MAX_DOCUMENT_BYTES, AiInference, stable_document_id
from ai_node.orchestrator import MissionGuardrailError, McpMissionOrchestrator

router = APIRouter()


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class ExtractDocumentBody(ApiModel):
    document_id: str = Field(default="", alias="documentId", max_length=200)
    document_type: str = Field(default="DOCUMENT_TYPE_CV", alias="documentType", max_length=64)
    content_type: str = Field(default="text/plain", alias="contentType", max_length=128)
    content_base64: str | None = Field(default=None, alias="contentBase64")
    text: str | None = None
    language_hint: str = Field(default="", alias="languageHint", max_length=32)


class EmbeddingBody(ApiModel):
    subject_id: str = Field(default="", alias="subjectId", max_length=200)
    text: str = Field(min_length=1, max_length=100_000)
    model: str = ""


class CompatibilityBody(ApiModel):
    resume: dict[str, Any]
    vacancy: dict[str, Any]
    resume_embedding: list[float] | None = Field(default=None, alias="resumeEmbedding")
    vacancy_embedding: list[float] | None = Field(default=None, alias="vacancyEmbedding")


class TalentVectorBody(ApiModel):
    candidate_id: str = Field(alias="candidateId", max_length=200)
    vector: list[float] = Field(min_length=1, max_length=4096)


class ClusterBody(ApiModel):
    talents: list[TalentVectorBody] = Field(min_length=0, max_length=1000)
    cluster_count: int = Field(default=5, alias="clusterCount", ge=1, le=20)


class VideoAnalysisBody(ApiModel):
    content_base64: str = Field(alias="contentBase64")
    content_type: str = Field(default="video/mp4", alias="contentType", max_length=128)


def _decode_content(content_base64: str | None, text: str | None) -> bytes:
    if content_base64 is not None:
        try:
            content = base64.b64decode(content_base64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(status_code=422, detail="contentBase64 debe ser Base64 válido") from exc
    elif text is not None:
        content = text.encode("utf-8")
    else:
        raise HTTPException(status_code=422, detail="Se requiere contentBase64 o text")
    if len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail=f"El contenido supera {MAX_DOCUMENT_BYTES} bytes")
    return content


def _extraction_json(result: Any) -> dict[str, Any]:
    return {
        "documentId": result.document_id,
        "extractedText": result.extracted_text,
        "confidence": result.confidence,
        "warnings": result.warnings,
        "modelVersion": result.model_version,
        "skills": result.skills,
        "education": result.education,
        "experience": result.experience,
        "additionalData": result.additional_data,
    }


@router.get("/health")
async def health(request: Request) -> dict[str, Any]:
    return {
        "service": "ai-node",
        "status": "SERVING",
        "version": __version__,
        "modelVersion": getattr(request.app.state, "inference", None) and "synthetic-hr-v1",
        "checkedAt": time.time(),
    }


@router.post("/api/v1/ai/extract-document")
async def extract_document(body: ExtractDocumentBody, request: Request) -> dict[str, Any]:
    content = _decode_content(body.content_base64, body.text)
    document_id = body.document_id or stable_document_id(content)
    try:
        result = request.app.state.inference.extract_document(
            document_id,
            body.document_type,
            body.content_type,
            content,
            body.language_hint,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _extraction_json(result)


@router.post("/api/v1/ai/generate-embedding")
async def generate_embedding(body: EmbeddingBody, request: Request) -> dict[str, Any]:
    vector = request.app.state.inference.generate_embedding(body.text)
    return {
        "subjectId": body.subject_id,
        "vector": vector,
        "dimensions": len(vector),
        "modelVersion": body.model or "hashing-vectorizer-v1",
    }


@router.post("/api/v1/ai/predict-compatibility")
async def predict_compatibility(body: CompatibilityBody, request: Request) -> dict[str, Any]:
    result = request.app.state.inference.predict_compatibility(
        body.resume,
        body.vacancy,
        body.resume_embedding,
        body.vacancy_embedding,
    )
    return result


@router.post("/api/v1/ai/cluster-talent")
async def cluster_talent(body: ClusterBody, request: Request) -> dict[str, Any]:
    talents = [{"candidateId": talent.candidate_id, "vector": talent.vector} for talent in body.talents]
    try:
        return request.app.state.inference.cluster_talents(talents, body.cluster_count)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/api/v1/ai/analyze-video")
async def analyze_video(body: VideoAnalysisBody, request: Request) -> dict[str, Any]:
    content = _decode_content(body.content_base64, None)
    if not body.content_type.startswith("video/"):
        raise HTTPException(status_code=415, detail="contentType debe identificar un video")
    try:
        metadata = await request.app.state.inference.analyze_video(content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"status": "completed", "contentType": body.content_type, "analysis": metadata, "modelVersion": "synthetic-hr-v1"}


@router.post("/agents/execute-mission")
async def execute_mission(body: dict[str, Any], request: Request) -> dict[str, Any]:
    try:
        auth_header = request.headers.get("authorization")
        return await request.app.state.orchestrator.execute(body, authorization=auth_header)
    except MissionGuardrailError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
