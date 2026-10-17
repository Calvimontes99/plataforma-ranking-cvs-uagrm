import { randomUUID } from 'node:crypto';
import { OutboxEvent } from '../../domain/entities/outbox-event.entity';
import { CurriculumRepositoryPort } from '../ports/out/curriculum-repository.port';
import { OutboxRepositoryPort } from '../ports/out/outbox-repository.port';
import { PostulacionRepositoryPort } from '../ports/out/postulacion-repository.port';
import { UnitOfWorkPort } from '../ports/out/unit-of-work.port';
import { SagaStep2CompensateDossierCommand, SagaStep2CompensateDossierUseCasePort } from '../ports/in/saga-step2-compensate-dossier-use-case.port';

export class SagaStep2CompensateDossierUseCase implements SagaStep2CompensateDossierUseCasePort {
  constructor(
    private readonly curricula: CurriculumRepositoryPort,
    private readonly applications: PostulacionRepositoryPort,
    private readonly outbox: OutboxRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
  ) {}

  async execute(command: SagaStep2CompensateDossierCommand): Promise<{ sagaId: string; restoredApplicationIds: string[] }> {
    return this.unitOfWork.execute(async () => {
      await this.curricula.unlock(command.candidateId);
      const restoredApplicationIds = await this.applications.restoreWithdrawn(command.sagaId, command.restoreApplicationIds);
      await this.applications.revertSelectedToEvaluated(command.candidateId);
      await this.outbox.add(new OutboxEvent(randomUUID(), 'saga.step2.dossier-unlocked', command.sagaId, {
        sagaId: command.sagaId,
        candidateId: command.candidateId,
        restoredApplicationIds,
        reason: command.reason,
      }, new Date()));
      return { sagaId: command.sagaId, restoredApplicationIds };
    });
  }
}
