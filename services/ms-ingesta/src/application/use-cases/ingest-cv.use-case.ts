import { randomUUID } from 'node:crypto';
import { CurriculumDocument } from '../../domain/entities/curriculum-document.entity';
import { OutboxEvent } from '../../domain/entities/outbox-event.entity';
import { Postulacion } from '../../domain/entities/postulacion.entity';
import { IdempotencyInProgressException } from '../../domain/exceptions/domain.exception';
import { IngestCvCommand, IngestCvUseCasePort } from '../ports/in/ingest-cv-use-case.port';
import { AiNodeGrpcClientPort } from '../ports/out/ai-node-grpc-client.port';
import { CurriculumRepositoryPort } from '../ports/out/curriculum-repository.port';
import { IdempotencyPort } from '../ports/out/idempotency.port';
import { OutboxRepositoryPort } from '../ports/out/outbox-repository.port';
import { PostulacionRepositoryPort } from '../ports/out/postulacion-repository.port';
import { UnitOfWorkPort } from '../ports/out/unit-of-work.port';

export class IngestCvUseCase implements IngestCvUseCasePort {
  constructor(
    private readonly curricula: CurriculumRepositoryPort,
    private readonly applications: PostulacionRepositoryPort,
    private readonly outbox: OutboxRepositoryPort,
    private readonly idempotency: IdempotencyPort,
    private readonly ai: AiNodeGrpcClientPort,
    private readonly unitOfWork: UnitOfWorkPort,
  ) {}

  async execute(command: IngestCvCommand): Promise<{ document: CurriculumDocument; applicationId: string; replayed: boolean }> {
    const previous = await this.idempotency.find(command.idempotencyKey);
    if (previous) {
      const document = await this.curricula.findById(previous.resumeId);
      if (!document) throw new Error(`Idempotency record references missing resume ${previous.resumeId}`);
      return { document, applicationId: previous.applicationId, replayed: true };
    }
    if (!await this.idempotency.claim(command.idempotencyKey)) {
      const completed = await this.idempotency.find(command.idempotencyKey);
      if (completed) {
        const document = await this.curricula.findById(completed.resumeId);
        if (!document) throw new Error(`Idempotency record references missing resume ${completed.resumeId}`);
        return { document, applicationId: completed.applicationId, replayed: true };
      }
      throw new IdempotencyInProgressException();
    }

    try {
    const resumeId = randomUUID();
    const candidateId = command.candidateId || randomUUID();
    const input = command.data;
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(JSON.stringify(input));
    const contentType = command.contentType || 'application/json';
    const warnings: string[] = [];
    let extracted: {
      plainText: string;
      skills: { name: string; proficiency?: number; yearsExperience?: number }[];
      experience: unknown[];
      education: unknown[];
      additionalData?: Record<string, unknown>;
      warnings: string[];
    };

    try {
      extracted = await this.ai.extract(resumeId, contentType, buffer);
    } catch (error) {
      const localData = Buffer.isBuffer(input) ? {} : input;
      extracted = {
        plainText: typeof localData['plainText'] === 'string' ? localData['plainText'] : JSON.stringify(localData),
        skills: Array.isArray(localData['skills']) ? localData['skills'].map((skill) => typeof skill === 'string' ? { name: skill } : skill as { name: string }) : [],
        experience: Array.isArray(localData['experience']) ? localData['experience'] : [],
        education: Array.isArray(localData['education']) ? localData['education'] : [],
        warnings: [`ai-node no disponible; se aplicó extracción local: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
    warnings.push(...extracted.warnings);
    const applicant = command.applicant || (
      !Buffer.isBuffer(input) && typeof input['applicant'] === 'object' && input['applicant'] !== null
        ? input['applicant'] as Record<string, unknown>
        : {}
    );
    const document = new CurriculumDocument(
      resumeId,
      { ...applicant, candidateId } as CurriculumDocument['applicant'],
      {
        ...(command.metadata || {}),
        ...(Buffer.isBuffer(input) ? { binaryBase64: input.toString('base64') } : input),
        ...(extracted.additionalData ? { aiAdditionalData: extracted.additionalData } : {}),
        fileName: command.fileName,
        contentType,
        source: command.channel,
      },
      extracted.plainText,
      extracted.skills,
      extracted.experience,
      extracted.education,
      command.channel,
      'evaluated',
      new Date(),
      undefined,
      undefined,
      warnings,
    );
    const application = new Postulacion(randomUUID(), candidateId, resumeId, command.vacancyId || '', 'received', new Date());

    await this.unitOfWork.execute(async () => {
      await this.curricula.save(document);
      await this.applications.save(application);
      await this.outbox.add(new OutboxEvent(randomUUID(), 'cv.ingested', resumeId, {
        resumeId, applicationId: application.id, candidateId, vacancyId: application.vacancyId,
        candidate: document.applicant,
        channel: command.channel, skills: extracted.skills, plainText: extracted.plainText,
      }, new Date()));
      await this.outbox.add(new OutboxEvent(randomUUID(), 'scoring.requested', application.id, {
        applicationId: application.id, candidateId, vacancyId: application.vacancyId, resumeId,
      }, new Date()));
      await this.idempotency.save(command.idempotencyKey, { applicationId: application.id, resumeId });
    });
    return { document, applicationId: application.id, replayed: false };
    } catch (error) {
      await this.idempotency.release(command.idempotencyKey);
      throw error;
    }
  }
}
