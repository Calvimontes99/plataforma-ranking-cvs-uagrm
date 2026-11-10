class CandidateCapture {
  const CandidateCapture({
    required this.id,
    required this.idempotencyKey,
    required this.name,
    required this.vacancyId,
    required this.imagePath,
    this.attachmentPath,
    this.attachmentName,
    this.attachmentContentType,
    required this.interviewScore,
    required this.localCvScore,
    required this.createdAt,
  });

  final String id;
  final String idempotencyKey;
  final String name;
  final String vacancyId;
  final String imagePath;
  final String? attachmentPath;
  final String? attachmentName;
  final String? attachmentContentType;
  final double interviewScore;
  final double localCvScore;
  final DateTime createdAt;

  Map<String, Object?> toMap() => {
        'id': id,
        'idempotency_key': idempotencyKey,
        'name': name,
        'vacancy_id': vacancyId,
        'image_path': imagePath,
        'attachment_path': attachmentPath,
        'attachment_name': attachmentName,
        'attachment_content_type': attachmentContentType,
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

  CandidateCapture withAttachmentPath(String path) => CandidateCapture(
        id: id,
        idempotencyKey: idempotencyKey,
        name: name,
        vacancyId: vacancyId,
        imagePath: imagePath,
        attachmentPath: path,
        attachmentName: attachmentName,
        attachmentContentType: attachmentContentType,
        interviewScore: interviewScore,
        localCvScore: localCvScore,
        createdAt: createdAt,
      );

  factory CandidateCapture.fromMap(Map<String, Object?> map) {
    return CandidateCapture(
      id: map['id']! as String,
      idempotencyKey: map['idempotency_key']! as String,
      name: map['name']! as String,
      vacancyId: map['vacancy_id'] as String? ?? '',
      imagePath: map['image_path']! as String,
      attachmentPath: map['attachment_path'] as String?,
      attachmentName: map['attachment_name'] as String?,
      attachmentContentType: map['attachment_content_type'] as String?,
      interviewScore: (map['interview_score']! as num).toDouble(),
      localCvScore: (map['local_cv_score']! as num).toDouble(),
      createdAt: DateTime.parse(map['created_at']! as String),
    );
  }
}
