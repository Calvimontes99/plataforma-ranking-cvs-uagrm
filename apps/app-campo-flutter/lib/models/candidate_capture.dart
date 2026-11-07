class CandidateCapture {
  const CandidateCapture({
    required this.id,
    required this.idempotencyKey,
    required this.name,
    required this.vacancyId,
    required this.imagePath,
    required this.interviewScore,
    required this.localCvScore,
    required this.createdAt,
  });

  final String id;
  final String idempotencyKey;
  final String name;
  final String vacancyId;
  final String imagePath;
  final double interviewScore;
  final double localCvScore;
  final DateTime createdAt;

  Map<String, Object?> toMap() => {
        'id': id,
        'idempotency_key': idempotencyKey,
        'name': name,
        'vacancy_id': vacancyId,
        'image_path': imagePath,
        'interview_score': interviewScore,
        'local_cv_score': localCvScore,
        'created_at': createdAt.toIso8601String(),
      };

  Map<String, Object?> toRequestBody() => {
        'candidateId': id,
        'vacancyId': vacancyId.isEmpty ? null : vacancyId,
        'channel': 'mobile',
        'applicant': {'candidateId': id, 'fullName': name},
        'resume': {
          'imagePath': imagePath,
          'localCvScore': localCvScore,
          'interviewScore': interviewScore,
          'capturedAt': createdAt.toIso8601String(),
        },
      };

  factory CandidateCapture.fromMap(Map<String, Object?> map) {
    return CandidateCapture(
      id: map['id']! as String,
      idempotencyKey: map['idempotency_key']! as String,
      name: map['name']! as String,
      vacancyId: map['vacancy_id'] as String? ?? '',
      imagePath: map['image_path']! as String,
      interviewScore: (map['interview_score']! as num).toDouble(),
      localCvScore: (map['local_cv_score']! as num).toDouble(),
      createdAt: DateTime.parse(map['created_at']! as String),
    );
  }
}
