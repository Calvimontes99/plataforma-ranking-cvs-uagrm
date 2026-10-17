export interface SagaStep2CompensateDossierCommand {
  sagaId: string;
  candidateId: string;
  restoreApplicationIds?: string[];
  reason?: string;
}

export interface SagaStep2CompensateDossierUseCasePort {
  execute(command: SagaStep2CompensateDossierCommand): Promise<{ sagaId: string; restoredApplicationIds: string[] }>;
}
