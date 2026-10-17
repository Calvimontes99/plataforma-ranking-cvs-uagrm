class CandidateCapture {
  CandidateCapture({required this.id,required this.idempotencyKey,required this.name,required this.vacancyId,required this.imagePath,required this.interviewScore,required this.localCvScore,required this.createdAt,this.synced=false});
  final String id,idempotencyKey,name,vacancyId,imagePath;final double interviewScore,localCvScore;final DateTime createdAt;final bool synced;
  Map<String,Object?> toMap()=>{'id':id,'idempotency_key':idempotencyKey,'name':name,'vacancy_id':vacancyId,'image_path':imagePath,'interview_score':interviewScore,'local_cv_score':localCvScore,'created_at':createdAt.toIso8601String(),'synced':synced?1:0};
  factory CandidateCapture.fromMap(Map<String,Object?> m)=>CandidateCapture(id:m['id']! as String,idempotencyKey:m['idempotency_key']! as String,name:m['name']! as String,vacancyId:m['vacancy_id']! as String,imagePath:m['image_path']! as String,interviewScore:(m['interview_score']! as num).toDouble(),localCvScore:(m['local_cv_score']! as num).toDouble(),createdAt:DateTime.parse(m['created_at']! as String),synced:m['synced']==1);
}
