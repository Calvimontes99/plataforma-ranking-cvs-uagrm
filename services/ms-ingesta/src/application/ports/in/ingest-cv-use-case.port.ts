import { CurriculumDocument } from '../../../domain/entities/curriculum-document.entity';

export interface IngestCvCommand {
  idempotencyKey: string;
  candidateId?: string;
  vacancyId?: string;
  channel: 'web' | 'mobile' | 'whatsapp';
  fileName?: string;
  contentType?: string;
  data: Record<string, unknown> | Buffer;
}

export interface IngestCvUseCasePort {
  execute(command: IngestCvCommand): Promise<{ document: CurriculumDocument; applicationId: string; replayed: boolean }>;
}
