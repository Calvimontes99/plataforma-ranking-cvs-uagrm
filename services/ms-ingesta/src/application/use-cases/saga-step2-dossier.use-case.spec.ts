import { CurriculumDocument } from '../../domain/entities/curriculum-document.entity';
import { Postulacion } from '../../domain/entities/postulacion.entity';
import { CurriculumRepositoryPort } from '../ports/out/curriculum-repository.port';
import { PostulacionRepositoryPort } from '../ports/out/postulacion-repository.port';
import { OutboxRepositoryPort } from '../ports/out/outbox-repository.port';
import { UnitOfWorkPort } from '../ports/out/unit-of-work.port';
import { SagaStep2BlockDossierUseCase } from './saga-step2-block-dossier.use-case';
import { SagaStep2CompensateDossierUseCase } from './saga-step2-compensate-dossier.use-case';

const unitOfWork: UnitOfWorkPort = {
  execute: async <T>(work: () => Promise<T>): Promise<T> => work(),
};

describe('Dossier SAGA step 2 use cases', () => {
  it('locks the selected candidate file, withdraws parallel applications, and is idempotent on redelivery', async () => {
    let locked = false;
    const dossier = new CurriculumDocument(
      'resume-1', { candidateId: 'candidate-1' }, {}, 'resume', [], [], [], 'web',
      'evaluated', new Date(),
    );
    const curricula: CurriculumRepositoryPort = {
      save: jest.fn(),
      findById: jest.fn(),
      findByCandidateId: jest.fn(async () => locked
        ? new CurriculumDocument(dossier.id, dossier.applicant, dossier.rawData, dossier.plainText, dossier.skills,
          dossier.experience, dossier.education, dossier.channel, 'locked', dossier.createdAt, new Date(), 'selected-1')
        : dossier),
      lock: jest.fn(async () => { locked = true; return true; }),
      unlock: jest.fn(),
      searchBySkills: jest.fn(),
    };
    const selected = new Postulacion('selected-1', 'candidate-1', 'resume-1', 'vacancy-1', 'selected', new Date());
    const applications: PostulacionRepositoryPort = {
      save: jest.fn(),
      findById: jest.fn(async () => locked
        ? new Postulacion('selected-1', 'candidate-1', 'resume-1', 'vacancy-1', 'locked', selected.createdAt, 'saga-1')
        : selected),
      createIngestApplication: jest.fn(),
      withdrawParallel: jest.fn(async () => ['parallel-1']),
      listWithdrawnForSaga: jest.fn(async () => ['parallel-1']),
      restoreWithdrawn: jest.fn(),
      setSelectedLocked: jest.fn(),
      revertSelectedToEvaluated: jest.fn(),
    };
    const outbox: OutboxRepositoryPort = {
      add: jest.fn(), findPending: jest.fn(), markPublished: jest.fn(), markFailed: jest.fn(),
    };
    const useCase = new SagaStep2BlockDossierUseCase(curricula, applications, outbox, unitOfWork);
    const command = {
      sagaId: 'saga-1', candidateId: 'candidate-1',
      selectedApplicationId: 'selected-1', selectedVacancyId: 'vacancy-1',
    };

    expect(await useCase.execute(command)).toEqual({ sagaId: 'saga-1', withdrawnApplicationIds: ['parallel-1'] });
    expect(await useCase.execute(command)).toEqual({ sagaId: 'saga-1', withdrawnApplicationIds: ['parallel-1'] });
    expect(applications.withdrawParallel).toHaveBeenCalledTimes(1);
    expect(outbox.add).toHaveBeenCalledTimes(1);
  });

  it('unlocks the dossier and restores applications as a compensating transaction', async () => {
    const curricula: CurriculumRepositoryPort = {
      save: jest.fn(), findById: jest.fn(), findByCandidateId: jest.fn(), lock: jest.fn(),
      unlock: jest.fn(),
      searchBySkills: jest.fn(),
    };
    const applications: PostulacionRepositoryPort = {
      save: jest.fn(), findById: jest.fn(), createIngestApplication: jest.fn(), withdrawParallel: jest.fn(),
      listWithdrawnForSaga: jest.fn(),
      restoreWithdrawn: jest.fn(async () => ['parallel-1']),
      setSelectedLocked: jest.fn(),
      revertSelectedToEvaluated: jest.fn(),
    };
    const outbox: OutboxRepositoryPort = {
      add: jest.fn(), findPending: jest.fn(), markPublished: jest.fn(), markFailed: jest.fn(),
    };
    const useCase = new SagaStep2CompensateDossierUseCase(curricula, applications, outbox, unitOfWork);

    const result = await useCase.execute({ sagaId: 'saga-1', candidateId: 'candidate-1' });

    expect(result.restoredApplicationIds).toEqual(['parallel-1']);
    expect(curricula.unlock).toHaveBeenCalledWith('candidate-1');
    expect(applications.revertSelectedToEvaluated).toHaveBeenCalledWith('candidate-1');
    expect(outbox.add).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'saga.step2.dossier-unlocked',
      aggregateId: 'saga-1',
    }));
  });
});
