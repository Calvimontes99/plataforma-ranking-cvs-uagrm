import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'curricula', timestamps: true, strict: false })
export class CurriculumRecord {
  @Prop({ required: true, unique: true, index: true }) resumeId!: string;
  @Prop({ required: true, index: true }) candidateId!: string;
  @Prop({ required: true }) channel!: string;
  @Prop({ required: true, default: 'received' }) status!: string;
  @Prop({ default: false, index: true }) locked!: boolean;
  @Prop() selectedApplicationId?: string;
  @Prop({ type: Object, default: {} }) applicant!: Record<string, unknown>;
  @Prop({ type: Object, default: {} }) rawData!: Record<string, unknown>;
  @Prop({ default: '' }) plainText!: string;
  @Prop({ type: [Object], default: [] }) skills!: unknown[];
  @Prop({ type: [Object], default: [] }) experience!: unknown[];
  @Prop({ type: [Object], default: [] }) education!: unknown[];
  @Prop({ type: [String], default: [] }) warnings!: string[];
  @Prop() lockedAt?: Date;
}
export type CurriculumRecordDocument = HydratedDocument<CurriculumRecord>;
export const CurriculumSchema = SchemaFactory.createForClass(CurriculumRecord);
CurriculumSchema.index({ 'skills.name': 1 });

@Schema({ collection: 'postulaciones', timestamps: true })
export class PostulacionRecord {
  @Prop({ required: true, unique: true, index: true }) applicationId!: string;
  @Prop({ required: true, index: true }) candidateId!: string;
  @Prop({ required: true, index: true }) resumeId!: string;
  @Prop({ default: '', index: true }) vacancyId!: string;
  @Prop({ required: true, index: true }) status!: string;
  @Prop({ index: true }) sagaId?: string;
}
export type PostulacionRecordDocument = HydratedDocument<PostulacionRecord>;
export const PostulacionSchema = SchemaFactory.createForClass(PostulacionRecord);

@Schema({ collection: 'outbox_events', timestamps: true })
export class OutboxEventRecord {
  @Prop({ required: true, unique: true, index: true }) eventId!: string;
  @Prop({ required: true, index: true }) eventType!: string;
  @Prop({ required: true, index: true }) aggregateId!: string;
  @Prop({ type: Object, required: true }) payload!: Record<string, unknown>;
  @Prop({ default: Date.now, index: true }) createdAt!: Date;
  @Prop() publishedAt?: Date;
  @Prop({ default: 0 }) attempts!: number;
}
export type OutboxEventRecordDocument = HydratedDocument<OutboxEventRecord>;
export const OutboxEventSchema = SchemaFactory.createForClass(OutboxEventRecord);

@Schema({ collection: 'idempotency_records', timestamps: true })
export class IdempotencyRecord {
  @Prop({ required: true, unique: true, index: true }) key!: string;
  @Prop({ required: true, default: 'processing', index: true }) state!: 'processing' | 'completed';
  @Prop({ type: Object }) result?: { applicationId: string; resumeId: string };
  @Prop({ index: { expires: 0 } }) expiresAt?: Date;
}
export type IdempotencyRecordDocument = HydratedDocument<IdempotencyRecord>;
export const IdempotencyRecordSchema = SchemaFactory.createForClass(IdempotencyRecord);
