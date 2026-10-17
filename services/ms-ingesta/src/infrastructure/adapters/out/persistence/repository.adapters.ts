import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MongoServerError } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { CurriculumDocument } from '../../../../domain/entities/curriculum-document.entity';
import { OutboxEvent } from '../../../../domain/entities/outbox-event.entity';
import { Postulacion } from '../../../../domain/entities/postulacion.entity';
import { CurriculumRepositoryPort } from '../../../../application/ports/out/curriculum-repository.port';
import { IdempotencyPort, IdempotencyResult } from '../../../../application/ports/out/idempotency.port';
import { OutboxRepositoryPort } from '../../../../application/ports/out/outbox-repository.port';
import { PostulacionRepositoryPort } from '../../../../application/ports/out/postulacion-repository.port';
import { CurriculumRecord, IdempotencyRecord, OutboxEventRecord, PostulacionRecord } from './schemas';
import { MongoSessionContext } from './mongo-session-context';

@Injectable()
export class MongoCurriculumRepository implements CurriculumRepositoryPort {
  constructor(
    @InjectModel(CurriculumRecord.name) private readonly model: Model<CurriculumRecord>,
    private readonly sessions: MongoSessionContext,
  ) {}

  async save(document: CurriculumDocument): Promise<void> {
    const data = {
      resumeId: document.id,
      candidateId: document.applicant.candidateId,
      applicant: document.applicant,
      rawData: document.rawData,
      plainText: document.plainText,
      skills: document.skills,
      experience: document.experience,
      education: document.education,
      channel: document.channel,
      status: document.status,
      warnings: document.warnings,
      lockedAt: document.lockedAt,
      selectedApplicationId: document.selectedApplicationId,
    };
    const session = this.sessions.current();
    if (session) await this.model.create([data], { session });
    else await this.model.create(data);
  }

  async findById(id: string): Promise<CurriculumDocument | null> {
    const record = await this.sessions.bind(this.model.findOne({ resumeId: id }).lean()).exec();
    return record ? this.toDomain(record) : null;
  }

  async findByCandidateId(candidateId: string): Promise<CurriculumDocument | null> {
    const record = await this.sessions.bind(this.model.findOne({ candidateId }).sort({ createdAt: -1 }).lean()).exec();
    return record ? this.toDomain(record) : null;
  }

  async lock(candidateId: string, selectedApplicationId: string): Promise<boolean> {
    const result = await this.sessions.bind(this.model.updateMany(
      { candidateId, locked: { $ne: true } },
      { $set: { locked: true, status: 'locked', lockedAt: new Date(), selectedApplicationId } },
    )).exec();
    return result.modifiedCount > 0;
  }

  async unlock(candidateId: string): Promise<void> {
    await this.sessions.bind(this.model.updateMany(
      { candidateId },
      { $set: { locked: false, status: 'evaluated' }, $unset: { lockedAt: 1, selectedApplicationId: 1 } },
    )).exec();
  }

  async searchBySkills(skills: string[], limit: number): Promise<CurriculumDocument[]> {
    if (!skills.length) return [];
    const records = await this.sessions.bind(this.model.find({ 'skills.name': { $in: skills }, locked: { $ne: true } })
      .limit(Math.min(Math.max(limit, 1), 100)).sort({ createdAt: -1 }).lean()).exec();
    return records.map((record) => this.toDomain(record));
  }

  private toDomain(record: Record<string, any>): CurriculumDocument {
    const rawApplicant = record['applicant'] || {};
    return new CurriculumDocument(
      record['resumeId'], { ...rawApplicant, candidateId: record['candidateId'] },
      record['rawData'] || {}, record['plainText'] || '', record['skills'] || [],
      record['experience'] || [], record['education'] || [], record['channel'] || 'web',
      record['status'] || 'received', record['createdAt'] || new Date(),
      record['lockedAt'], record['selectedApplicationId'], record['warnings'] || [],
    );
  }
}

@Injectable()
export class MongoPostulacionRepository implements PostulacionRepositoryPort {
  constructor(
    @InjectModel(PostulacionRecord.name) private readonly model: Model<PostulacionRecord>,
    private readonly sessions: MongoSessionContext,
  ) {}

  async save(application: Postulacion): Promise<void> {
    const data = {
      applicationId: application.id, candidateId: application.candidateId, resumeId: application.resumeId,
      vacancyId: application.vacancyId, status: application.status, sagaId: application.sagaId,
    };
    const session = this.sessions.current();
    if (session) await this.model.create([data], { session });
    else await this.model.create(data);
  }

  async findById(id: string): Promise<Postulacion | null> {
    const record = await this.sessions.bind(this.model.findOne({ applicationId: id }).lean()).exec();
    return record ? this.toDomain(record) : null;
  }

  async createIngestApplication(candidateId: string, resumeId: string, vacancyId: string): Promise<Postulacion> {
    const application = new Postulacion(randomUUID(), candidateId, resumeId, vacancyId, 'received', new Date());
    await this.save(application);
    return application;
  }

  async withdrawParallel(candidateId: string, selectedApplicationId: string, sagaId: string): Promise<string[]> {
    const candidates = await this.sessions.bind(this.model.find({
      candidateId,
      applicationId: { $ne: selectedApplicationId },
      status: { $in: ['received', 'processing', 'evaluated', 'preapproved'] },
    }).select({ applicationId: 1, _id: 0 }).lean()).exec();
    const ids = candidates.map((application) => application['applicationId'] as string);
    if (ids.length) {
      await this.sessions.bind(this.model.updateMany(
        { applicationId: { $in: ids } },
        { $set: { status: 'withdrawn', sagaId } },
      )).exec();
    }
    return ids;
  }

  async restoreWithdrawn(sagaId: string, applicationIds?: string[]): Promise<string[]> {
    const query: Record<string, unknown> = { sagaId, status: 'withdrawn' };
    if (applicationIds?.length) query['applicationId'] = { $in: applicationIds };
    const records = await this.sessions.bind(this.model.find(query).select({ applicationId: 1, _id: 0 }).lean()).exec();
    const ids = records.map((application) => application['applicationId'] as string);
    if (ids.length) {
      await this.sessions.bind(this.model.updateMany(
        { applicationId: { $in: ids }, status: 'withdrawn', sagaId },
        { $set: { status: 'evaluated' }, $unset: { sagaId: 1 } },
      )).exec();
    }
    return ids;
  }

  async listWithdrawnForSaga(sagaId: string): Promise<string[]> {
    const records = await this.sessions.bind(this.model.find({ sagaId, status: 'withdrawn' })
      .select({ applicationId: 1, _id: 0 }).lean()).exec();
    return records.map((application) => application['applicationId'] as string);
  }

  async setSelectedLocked(applicationId: string, sagaId: string): Promise<void> {
    await this.sessions.bind(this.model.updateOne(
      { applicationId },
      { $set: { status: 'locked', sagaId } },
    )).exec();
  }

  async revertSelectedToEvaluated(candidateId: string): Promise<void> {
    await this.sessions.bind(this.model.updateMany({ candidateId, status: 'locked' }, { $set: { status: 'evaluated' } })).exec();
  }

  private toDomain(record: Record<string, any>): Postulacion {
    return new Postulacion(record['applicationId'], record['candidateId'], record['resumeId'],
      record['vacancyId'], record['status'], record['createdAt'] || new Date(), record['sagaId']);
  }
}

@Injectable()
export class MongoOutboxRepository implements OutboxRepositoryPort {
  constructor(
    @InjectModel(OutboxEventRecord.name) private readonly model: Model<OutboxEventRecord>,
    private readonly sessions: MongoSessionContext,
  ) {}

  async add(event: OutboxEvent): Promise<void> {
    const data = {
      eventId: event.id, eventType: event.eventType, aggregateId: event.aggregateId,
      payload: event.payload, createdAt: event.createdAt, attempts: 0,
    };
    const session = this.sessions.current();
    if (session) await this.model.create([data], { session });
    else await this.model.create(data);
  }

  async findPending(limit: number): Promise<OutboxEvent[]> {
    const records = await this.sessions.bind(this.model.find({ publishedAt: { $exists: false } })
      .sort({ createdAt: 1 }).limit(limit).lean()).exec();
    return records.map((record) => new OutboxEvent(
      record['eventId'], record['eventType'], record['aggregateId'], record['payload'],
      record['createdAt'], record['publishedAt'], record['attempts'],
    ));
  }

  async markPublished(id: string): Promise<void> {
    await this.sessions.bind(this.model.updateOne({ eventId: id }, { $set: { publishedAt: new Date() } })).exec();
  }

  async markFailed(id: string): Promise<void> {
    await this.sessions.bind(this.model.updateOne({ eventId: id }, { $inc: { attempts: 1 } })).exec();
  }
}

@Injectable()
export class MongoIdempotencyAdapter implements IdempotencyPort {
  constructor(
    @InjectModel(IdempotencyRecord.name) private readonly model: Model<IdempotencyRecord>,
    private readonly sessions: MongoSessionContext,
  ) {}

  async find(key: string): Promise<IdempotencyResult | null> {
    const record = await this.sessions.bind(this.model.findOne({ key, state: 'completed' }).lean()).exec();
    return record?.['result'] || null;
  }

  async claim(key: string): Promise<boolean> {
    const now = new Date();
    try {
      const session = this.sessions.current();
      if (session) {
        await this.model.create([{ key, state: 'processing', expiresAt: new Date(now.getTime() + 5 * 60 * 1000) }], { session });
      } else {
        await this.model.create({ key, state: 'processing', expiresAt: new Date(now.getTime() + 5 * 60 * 1000) });
      }
      return true;
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
      const updated = await this.sessions.bind(this.model.updateOne(
        { key, state: 'processing', expiresAt: { $lte: now } },
        { $set: { expiresAt: new Date(now.getTime() + 5 * 60 * 1000) } },
      )).exec();
      return updated.modifiedCount === 1;
    }
  }

  async save(key: string, result: IdempotencyResult): Promise<void> {
    const update = this.model.updateOne(
      { key, state: 'processing' },
      { $set: { result, state: 'completed' }, $unset: { expiresAt: 1 } },
    );
    const saved = await this.sessions.bind(update).exec();
    if (saved.matchedCount !== 1) throw new Error(`No existe reserva de idempotencia para la clave ${key}`);
  }

  async release(key: string): Promise<void> {
    await this.sessions.bind(this.model.deleteOne({ key, state: 'processing' })).exec();
  }
}
