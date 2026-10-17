export interface SagaStep2BlockDossierCommand {
  sagaId: string;
  candidateId: string;
  selectedApplicationId: string;
  selectedVacancyId: string;
  reason?: string;
}

export interface SagaStep2BlockDossierUseCasePort {
  execute(command: SagaStep2BlockDossierCommand): Promise<{ sagaId: string; withdrawnApplicationIds: string[] }>;
}
