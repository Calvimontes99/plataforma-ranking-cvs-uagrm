export type ApplicationStatus = 'received' | 'processing' | 'evaluated' | 'preapproved' | 'selected' | 'rejected' | 'locked' | 'withdrawn';

export class Postulacion {
  constructor(
    readonly id: string,
    readonly candidateId: string,
    readonly resumeId: string,
    readonly vacancyId: string,
    readonly status: ApplicationStatus,
    readonly createdAt: Date,
    readonly sagaId?: string,
  ) {}
}
