import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CURRICULUM_REPOSITORY, IDEMPOTENCY, OUTBOX_REPOSITORY, POSTULACION_REPOSITORY, UNIT_OF_WORK } from '../../../tokens';
import {
  CurriculumRecord, CurriculumSchema, IdempotencyRecord, IdempotencyRecordSchema,
  OutboxEventRecord, OutboxEventSchema, PostulacionRecord, PostulacionSchema,
  DeviceTokenRecord, DeviceTokenSchema,
} from './schemas';
import { MongoCurriculumRepository, MongoIdempotencyAdapter, MongoOutboxRepository, MongoPostulacionRepository } from './repository.adapters';
import { MongoSessionContext } from './mongo-session-context';
import { MongoUnitOfWork } from './mongo-unit-of-work';

@Module({
  imports: [MongooseModule.forFeature([
    { name: CurriculumRecord.name, schema: CurriculumSchema },
    { name: PostulacionRecord.name, schema: PostulacionSchema },
    { name: OutboxEventRecord.name, schema: OutboxEventSchema },
    { name: IdempotencyRecord.name, schema: IdempotencyRecordSchema },
    { name: DeviceTokenRecord.name, schema: DeviceTokenSchema },
  ])],
  providers: [
    MongoSessionContext, MongoUnitOfWork,
    MongoCurriculumRepository, MongoPostulacionRepository, MongoOutboxRepository, MongoIdempotencyAdapter,
    { provide: CURRICULUM_REPOSITORY, useExisting: MongoCurriculumRepository },
    { provide: POSTULACION_REPOSITORY, useExisting: MongoPostulacionRepository },
    { provide: OUTBOX_REPOSITORY, useExisting: MongoOutboxRepository },
    { provide: IDEMPOTENCY, useExisting: MongoIdempotencyAdapter },
    { provide: UNIT_OF_WORK, useExisting: MongoUnitOfWork },
  ],
  exports: [CURRICULUM_REPOSITORY, POSTULACION_REPOSITORY, OUTBOX_REPOSITORY, IDEMPOTENCY, UNIT_OF_WORK],
})
export class PersistenceModule {}
