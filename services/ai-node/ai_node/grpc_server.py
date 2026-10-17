from __future__ import annotations

from concurrent import futures
from datetime import datetime, timezone
from typing import Any

import grpc
from google.protobuf import empty_pb2, struct_pb2, timestamp_pb2

from ai_node import __version__
from ai_node.inference import MAX_DOCUMENT_BYTES, AiInference


class AiService:
    def __init__(self, inference: AiInference) -> None:
        self.inference = inference

    def ExtractDocument(self, request: Any, context: grpc.ServicerContext) -> Any:
        import recruitment_pb2

        try:
            result = self.inference.extract_document(
                request.document_id,
                request.document_type,
                request.content_type,
                bytes(request.content),
                request.language_hint,
            )
        except ValueError as exc:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
        response = recruitment_pb2.ExtractDocumentResponse(
            document_id=result.document_id,
            extracted_text=result.extracted_text,
            confidence=result.confidence,
            model_version=result.model_version,
        )
        response.skills.extend(
            recruitment_pb2.Skill(
                name=item["name"],
                proficiency=item.get("proficiency", 0),
                years_experience=item.get("yearsExperience", 0),
            )
            for item in result.skills
        )
        response.education.extend(
            recruitment_pb2.Education(institution=item.get("institution", ""), degree=item.get("degree", ""))
            for item in result.education
        )
        response.experience.extend(
            recruitment_pb2.WorkExperience(description=item.get("description", ""), role=item.get("role", ""), company=item.get("company", ""))
            for item in result.experience
        )
        response.warnings.extend(
            recruitment_pb2.ErrorDetail(code=item["code"], message=item["message"], field=item.get("field", ""))
            for item in result.warnings
        )
        response.additional_data.update(result.additional_data)
        return response

    def GenerateEmbedding(self, request: Any, context: grpc.ServicerContext) -> Any:
        import recruitment_pb2

        vector = self.inference.generate_embedding(request.text)
        return recruitment_pb2.GenerateEmbeddingResponse(
            subject_id=request.subject_id,
            vector=vector,
            dimensions=len(vector),
            model_version=request.model or "hashing-vectorizer-v1",
        )

    def PredictCompatibility(self, request: Any, context: grpc.ServicerContext) -> Any:
        import recruitment_pb2

        result = self.inference.predict_compatibility(
            request.resume,
            request.vacancy,
            request.resume_embedding,
            request.vacancy_embedding,
        )
        breakdown = result["breakdown"]
        return recruitment_pb2.PredictCompatibilityResponse(
            score=result["score"],
            explanation=result["explanation"],
            model_version=result["modelVersion"],
            breakdown=recruitment_pb2.ScoreBreakdown(
                skills_score=breakdown["skillsScore"],
                experience_score=breakdown["experienceScore"],
                education_score=breakdown["educationScore"],
                semantic_score=breakdown["semanticScore"],
                model_score=breakdown["modelScore"],
                custom_scores=breakdown["customScores"],
            ),
        )

    def ClusterTalent(self, request: Any, context: grpc.ServicerContext) -> Any:
        import recruitment_pb2

        talents = [{"candidateId": item.candidate_id, "vector": item.vector} for item in request.talents]
        try:
            result = self.inference.cluster_talents(talents, request.cluster_count or 5)
        except ValueError as exc:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
        return recruitment_pb2.ClusterTalentResponse(
            assignments=[
                recruitment_pb2.TalentCluster(
                    candidate_id=item["candidateId"],
                    cluster_id=item["clusterId"],
                    distance_to_centroid=item["distanceToCentroid"],
                )
                for item in result["assignments"]
            ],
            model_version=result["modelVersion"],
        )

    def Health(self, request: empty_pb2.Empty, context: grpc.ServicerContext) -> Any:
        import recruitment_pb2

        timestamp = timestamp_pb2.Timestamp()
        timestamp.FromDatetime(datetime.now(timezone.utc))
        return recruitment_pb2.HealthResponse(
            service="ai-node",
            status="SERVING",
            version=__version__,
            checked_at=timestamp,
        )


def start_grpc_server(inference: AiInference, port: int = 50051) -> grpc.Server:
    import recruitment_pb2_grpc

    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=8),
        options=(("grpc.max_receive_message_length", MAX_DOCUMENT_BYTES + 1024 * 1024),),
    )
    service = AiService(inference)
    recruitment_pb2_grpc.add_AiServiceServicer_to_server(service, server)
    if server.add_insecure_port(f"[::]:{port}") == 0:
        raise RuntimeError(f"No se pudo abrir el puerto gRPC {port}")
    server.start()
    return server
