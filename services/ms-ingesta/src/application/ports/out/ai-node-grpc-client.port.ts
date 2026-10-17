import { DetectedSkill } from '../../../domain/entities/curriculum-document.entity';

export interface AiExtractionResult {
  plainText: string;
  skills: DetectedSkill[];
  experience: unknown[];
  education: unknown[];
  additionalData?: Record<string, unknown>;
  warnings: string[];
}

export interface AiNodeGrpcClientPort {
  extract(documentId: string, contentType: string, content: Buffer | string): Promise<AiExtractionResult>;
}
