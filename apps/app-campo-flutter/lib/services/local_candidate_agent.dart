import '../models/candidate_capture.dart';

enum FieldCandidateStatus { suitable, review }

class LocalCandidateAssessment {
  const LocalCandidateAssessment({required this.status, required this.reasons});
  final FieldCandidateStatus status;
  final List<String> reasons;
  String get label => status == FieldCandidateStatus.suitable ? 'Apto en campo' : 'Requiere revisión';
}

/// Fast, deterministic pre-screening that runs entirely on the device.
class LocalCandidateAgent {
  const LocalCandidateAgent({this.minimumCvScore = 0.5, this.minimumInterviewScore = 60});
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
    if (name.trim().length < 3) reasons.add('Completa el nombre del candidato.');
    if ((imagePath == null || imagePath.isEmpty) && (documentPath == null || documentPath.isEmpty)) {
      reasons.add('Adjunta una fotografía o un CV PDF/DOCX.');
    }
    if (cvScore < minimumCvScore) reasons.add('El puntaje preliminar del CV no alcanza el umbral.');
    if (interviewScore < minimumInterviewScore) reasons.add('La calificación de entrevista requiere revisión.');
    return LocalCandidateAssessment(
      status: reasons.isEmpty ? FieldCandidateStatus.suitable : FieldCandidateStatus.review,
      reasons: reasons.isEmpty ? const ['Datos completos y umbrales locales superados.'] : reasons,
    );
  }

  LocalCandidateAssessment assessCapture(CandidateCapture capture) => assess(
        name: capture.name, imagePath: capture.imagePath, documentPath: capture.attachmentPath,
        cvScore: capture.localCvScore, interviewScore: capture.interviewScore,
      );
}
