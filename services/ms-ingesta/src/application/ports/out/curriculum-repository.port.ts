import { CurriculumDocument } from '../../../domain/entities/curriculum-document.entity';

export interface CurriculumRepositoryPort {
  save(document: CurriculumDocument): Promise<void>;
  findById(id: string): Promise<CurriculumDocument | null>;
  findByCandidateId(candidateId: string): Promise<CurriculumDocument | null>;
  lock(candidateId: string, selectedApplicationId: string): Promise<boolean>;
  unlock(candidateId: string): Promise<void>;
  searchBySkills(skills: string[], limit: number): Promise<CurriculumDocument[]>;
}
