import { randomUUID } from 'node:crypto';
import {
  DossierAlreadyLockedException,
  DossierNotFoundException,
  InvalidApplicationSelectionException,
} from '../../domain/exceptions/domain.exception';
import { OutboxEvent } from '../../domain/entities/outbox-event.entity';
import { CurriculumRepositoryPort } from '../ports/out/curriculum-repository.port';
import { OutboxRepositoryPort } from '../ports/out/outbox-repository.port';
import { PostulacionRepositoryPort } from '../ports/out/postulacion-repository.port';
import { UnitOfWorkPort } from '../ports/out/unit-of-work.port';
import { SagaStep2BlockDossierCommand, SagaStep2BlockDossierUseCasePort } from '../ports/in/saga-step2-block-dossier-use-case.port';

export class SagaStep2BlockDossierUseCase implements SagaStep2BlockDossierUseCasePort {
  constructor(
    private readonly curricula: CurriculumRepositoryPort,
    private readonly applications: PostulacionRepositoryPort,
    private readonly outbox: OutboxRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
  ) {}

  async execute(command: SagaStep2BlockDossierCommand): Promise<{ sagaId: string; withdrawnApplicationIds: string[] }> {
    return this.unitOfWork.execute(async () => {
      const dossier = await this.curricula.findByCandidateId(command.candidateId);
      if (!dossier) throw new DossierNotFoundException(command.candidateId);
      if (dossier.status === 'locked') {
        const selected = await this.applications.findById(command.selectedApplicationId);
        if (dossier.selectedApplicationId === command.selectedApplicationId && selected?.sagaId === command.sagaId) {
          return {
            sagaId: command.sagaId,
            withdrawnApplicationIds: await this.applications.listWithdrawnForSaga(command.sagaId),
          };
        }
        throw new DossierAlreadyLockedException(command.candidateId);
      }
      const selectedApplication = await this.applications.findById(command.selectedApplicationId);
      if (
        !selectedApplication ||
        selectedApplication.candidateId !== command.candidateId ||
        (selectedApplication.vacancyId && selectedApplication.vacancyId !== command.selectedVacancyId) ||
        ['withdrawn', 'rejected'].includes(selectedApplication.status)
      ) {
        throw new InvalidApplicationSelectionException(command.selectedApplicationId);
      }
      if (!await this.curricula.lock(command.candidateId, command.selectedApplicationId)) {
        throw new DossierNotFoundException(command.candidateId);
      }
      const withdrawnApplicationIds = await this.applications.withdrawParallel(
        command.candidateId, command.selectedApplicationId, command.sagaId,
      );
      await this.applications.setSelectedLocked(command.selectedApplicationId, command.sagaId);
      await this.outbox.add(new OutboxEvent(randomUUID(), 'saga.step2.dossier-locked', command.sagaId, {
        sagaId: command.sagaId,
        candidateId: command.candidateId,
        selectedApplicationId: command.selectedApplicationId,
        selectedVacancyId: command.selectedVacancyId,
        withdrawnApplicationIds,
        reason: command.reason,
      }, new Date()));
      return { sagaId: command.sagaId, withdrawnApplicationIds };
    });
  }
}
