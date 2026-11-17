import '../models/candidate_capture.dart';

enum FieldCandidateStatus { suitable, review }

class LocalCandidateAssessment {
  const LocalCandidateAssessment({
    required this.status,
    required this.reasons,
    required this.visualScore,
    required this.interviewScore,
    required this.completenessScore,
    required this.compositeScore,
    required this.summary,
  });

  final FieldCandidateStatus status;
  final List<String> reasons;
  final double visualScore;
  final double interviewScore;
  final double completenessScore;
  final double compositeScore;
  final String summary;

  String get label => status == FieldCandidateStatus.suitable ? 'APTO EN CAMPO' : 'REQUIERE REVISIÓN';
  bool get isSuitable => status == FieldCandidateStatus.suitable;
}

/// Fast, deterministic pre-screening agent that runs entirely on the device (Edge AI).
class LocalCandidateAgent {
  const LocalCandidateAgent({
    this.minimumCvScore = 0.5,
    this.minimumInterviewScore = 60,
  });

  final double minimumCvScore;
  final double minimumInterviewScore;

  LocalCandidateAssessment assess({
    required String name,
    required String? imagePath,
    required String? documentPath,
    required double cvScore,
    required double interviewScore,
  }) {
    final reasons = <String>[];
    final hasName = name.trim().length >= 3;
    final hasImage = imagePath != null && imagePath.isNotEmpty;
    final hasDoc = documentPath != null && documentPath.isNotEmpty;
    final hasAttachment = hasImage || hasDoc;

    if (!hasName) {
      reasons.add('Ingresa el nombre completo del candidato (mín. 3 caracteres).');
    }
    if (!hasAttachment) {
      reasons.add('Adjunta una fotografía o un CV PDF/DOCX.');
    }

    // Baseline documentary score for digital files (PDF/DOCX) or vision score for photos
    final effectiveCvScore = hasDoc ? (cvScore > 0 ? cvScore : 0.85) : (hasImage ? cvScore : 0.0);

    if (hasAttachment && effectiveCvScore < minimumCvScore) {
      reasons.add('El puntaje preliminar del CV (${(effectiveCvScore * 100).round()}%) no alcanza el umbral (${(minimumCvScore * 100).round()}%).');
    }

    if (interviewScore < minimumInterviewScore) {
      reasons.add('La calificación de entrevista (${interviewScore.round()} pts) requiere revisión (mínimo ${minimumInterviewScore.round()} pts).');
    }

    final completeness = (hasName ? 0.4 : 0.0) + (hasAttachment ? 0.4 : 0.0) + (interviewScore > 0 ? 0.2 : 0.0);
    final composite = (effectiveCvScore * 0.40) + ((interviewScore / 100.0) * 0.45) + (completeness * 0.15);

    final isSuitable = reasons.isEmpty &&
        hasName &&
        hasAttachment &&
        effectiveCvScore >= minimumCvScore &&
        interviewScore >= minimumInterviewScore;

    final summary = isSuitable
        ? 'Expediente favorable: estructura preliminar aprobada y entrevista satisfactoria (≥${minimumInterviewScore.round()} pts). Listo para análisis supervisado en Azure ai-node.'
        : reasons.join(' ');

    return LocalCandidateAssessment(
      status: isSuitable ? FieldCandidateStatus.suitable : FieldCandidateStatus.review,
      reasons: reasons.isEmpty ? const ['Datos completos y umbrales locales superados.'] : reasons,
      visualScore: effectiveCvScore,
      interviewScore: interviewScore,
      completenessScore: completeness,
      compositeScore: composite.clamp(0.0, 1.0),
      summary: summary,
    );
  }

  LocalCandidateAssessment assessCapture(CandidateCapture capture) => assess(
        name: capture.name,
        imagePath: capture.imagePath,
        documentPath: capture.attachmentPath,
        cvScore: capture.localCvScore,
        interviewScore: capture.interviewScore,
      );
}
