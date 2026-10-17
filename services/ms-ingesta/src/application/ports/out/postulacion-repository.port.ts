import { Postulacion } from '../../../domain/entities/postulacion.entity';

export interface PostulacionRepositoryPort {
  save(application: Postulacion): Promise<void>;
  findById(id: string): Promise<Postulacion | null>;
  createIngestApplication(candidateId: string, resumeId: string, vacancyId: string): Promise<Postulacion>;
  withdrawParallel(candidateId: string, selectedApplicationId: string, sagaId: string): Promise<string[]>;
  listWithdrawnForSaga(sagaId: string): Promise<string[]>;
  restoreWithdrawn(sagaId: string, applicationIds?: string[]): Promise<string[]>;
  setSelectedLocked(applicationId: string, sagaId: string): Promise<void>;
  revertSelectedToEvaluated(candidateId: string): Promise<void>;
}
