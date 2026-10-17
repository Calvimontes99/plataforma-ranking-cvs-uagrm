import { Controller, Inject } from '@nestjs/common';
import { GrpcMethod, GrpcStreamMethod } from '@nestjs/microservices';
import { Observable, lastValueFrom, of, toArray } from 'rxjs';
import { IngestCvUseCase } from '../../../../application/use-cases/ingest-cv.use-case';
import { CurriculumRepositoryPort } from '../../../../application/ports/out/curriculum-repository.port';
import { POSTULACION_REPOSITORY, CURRICULUM_REPOSITORY } from '../../../tokens';
import { PostulacionRepositoryPort } from '../../../../application/ports/out/postulacion-repository.port';
import { SagaStep2BlockDossierUseCase } from '../../../../application/use-cases/saga-step2-block-dossier.use-case';
import { SagaStep2CompensateDossierUseCase } from '../../../../application/use-cases/saga-step2-compensate-dossier.use-case';

type GrpcChunk = {
  context?: { idempotencyKey?: string; correlationId?: string };
  uploadId: string; candidateId: string; vacancyId: string; fileName: string;
  contentType: string; data: Buffer; lastChunk: boolean;
};

@Controller()
export class IngestionGrpcController {
  constructor(
    private readonly ingestCv: IngestCvUseCase,
    @Inject(CURRICULUM_REPOSITORY) private readonly curricula: CurriculumRepositoryPort,
    @Inject(POSTULACION_REPOSITORY) private readonly applications: PostulacionRepositoryPort,
    private readonly blockDossier: SagaStep2BlockDossierUseCase,
    private readonly compensateDossier: SagaStep2CompensateDossierUseCase,
  ) {}

  @GrpcStreamMethod('IngestionService', 'IngestDocument')
  async ingestDocument(chunks: Observable<GrpcChunk>): Promise<Observable<Record<string, unknown>>> {
    const allChunks = await lastValueFrom(chunks.pipe(toArray()));
    if (!allChunks.length) throw new Error('IngestDocument requires at least one chunk');
    const received = allChunks[0];
    const document = await this.ingestCv.execute({
      idempotencyKey: received.context?.idempotencyKey || received.uploadId,
      candidateId: received.candidateId,
      vacancyId: received.vacancyId,
      channel: 'web',
      fileName: received.fileName,
      contentType: received.contentType,
      data: Buffer.concat(allChunks.map((chunk) => Buffer.from(chunk.data))),
    });
    return of({
      applicationId: document.applicationId,
      resumeId: document.document.id,
      status: 3,
      receivedAt: { seconds: Math.floor(document.document.createdAt.getTime() / 1000), nanos: 0 },
      warnings: document.document.warnings.map((message) => ({ code: 'EXTRACTION_WARNING', message, field: '' })),
    });
  }

  @GrpcMethod('IngestionService', 'GetResume')
  async getResume(data: { resumeId: string }) {
    const resume = await this.curricula.findById(data.resumeId);
    if (!resume) throw new Error(`Resume ${data.resumeId} not found`);
    return {
      resumeId: resume.id,
      candidateId: resume.applicant.candidateId,
      plainText: resume.plainText,
      skills: resume.skills.map((skill) => ({ name: skill.name, proficiency: skill.proficiency || 0, yearsExperience: skill.yearsExperience || 0 })),
      education: resume.education,
      experience: resume.experience,
      additionalData: resume.rawData,
      parsedAt: { seconds: Math.floor(resume.createdAt.getTime() / 1000), nanos: 0 },
    };
  }

  @GrpcMethod('IngestionService', 'GetApplication')
  async getApplication(data: { applicationId: string }) {
    const application = await this.applications.findById(data.applicationId);
    if (!application) throw new Error(`Application ${data.applicationId} not found`);
    const resume = await this.curricula.findById(application.resumeId);
    return {
      applicationId: application.id,
      vacancyId: application.vacancyId,
      candidate: {
        candidateId: application.candidateId,
        fullName: resume?.applicant.fullName || '',
        email: resume?.applicant.email || '',
        phone: resume?.applicant.phone || '',
      },
      resumeId: application.resumeId,
      status: this.statusNumber(application.status),
      expedienteLocked: resume?.status === 'locked',
      createdAt: { seconds: Math.floor(application.createdAt.getTime() / 1000), nanos: 0 },
      updatedAt: { seconds: Math.floor(application.createdAt.getTime() / 1000), nanos: 0 },
    };
  }

  @GrpcMethod('IngestionService', 'LockCandidateFile')
  async lockCandidateFile(data: Record<string, any>) {
    const result = await this.blockDossier.execute({
      sagaId: data['sagaId'], candidateId: data['candidateId'],
      selectedApplicationId: data['selectedApplicationId'], selectedVacancyId: data['selectedVacancyId'],
      reason: data['reason'],
    });
    return {
      sagaId: result.sagaId, status: 2, withdrawnApplicationIds: result.withdrawnApplicationIds,
      completedAt: { seconds: Math.floor(Date.now() / 1000), nanos: 0 }, errors: [],
    };
  }

  @GrpcMethod('IngestionService', 'UnlockCandidateFile')
  async unlockCandidateFile(data: Record<string, any>) {
    const result = await this.compensateDossier.execute({
      sagaId: data['sagaId'], candidateId: data['candidateId'],
      restoreApplicationIds: data['restoreApplicationIds'], reason: data['reason'],
    });
    return {
      sagaId: result.sagaId, status: 4,
      completedAt: { seconds: Math.floor(Date.now() / 1000), nanos: 0 }, errors: [],
    };
  }

  @GrpcMethod('IngestionService', 'Health')
  health() {
    return { service: 'ms-ingesta', status: 'SERVING', version: '1.0.0', checkedAt: { seconds: Math.floor(Date.now() / 1000), nanos: 0 } };
  }

  private statusNumber(status: string): number {
    const statuses: Record<string, number> = {
      received: 1, processing: 2, evaluated: 3, preapproved: 4, selected: 5,
      rejected: 6, locked: 7, withdrawn: 8,
    };
    return statuses[status] || 0;
  }
}
