export type IngestionChannel = 'web' | 'mobile' | 'whatsapp';
export type DossierStatus = 'received' | 'processing' | 'evaluated' | 'locked';

export interface ApplicantData {
  candidateId: string;
  fullName?: string;
  email?: string;
  phone?: string;
  [key: string]: unknown;
}

export interface DetectedSkill {
  name: string;
  proficiency?: number;
  yearsExperience?: number;
}

export class CurriculumDocument {
  constructor(
    readonly id: string,
    readonly applicant: ApplicantData,
    readonly rawData: Record<string, unknown>,
    readonly plainText: string,
    readonly skills: DetectedSkill[],
    readonly experience: unknown[],
    readonly education: unknown[],
    readonly channel: IngestionChannel,
    readonly status: DossierStatus,
    readonly createdAt: Date,
    readonly lockedAt?: Date,
    readonly selectedApplicationId?: string,
    readonly warnings: string[] = [],
  ) {}
}
