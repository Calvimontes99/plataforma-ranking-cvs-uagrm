<?php

namespace App\UseCases;

use App\Entities\AuditLogEntry;
use App\Entities\OutboxEvent;
use App\Entities\SagaStatus;
use App\UseCases\Ports\AuditRepositoryPort;
use App\UseCases\Ports\OutboxRepositoryPort;
use App\UseCases\Ports\SagaRepositoryPort;
use App\UseCases\Ports\VacancyGatewayPort;
use DateTimeImmutable;
use Illuminate\Support\Str;
use Psr\Log\LoggerInterface;
use Throwable;

final class HandleSagaStepEventsUseCase
{
    public function __construct(
        private readonly SagaRepositoryPort $sagas,
        private readonly OutboxRepositoryPort $outbox,
        private readonly AuditRepositoryPort $audit,
        private readonly VacancyGatewayPort $vacancies,
        private readonly CompensateRankingSelectionUseCase $compensateRanking,
        private readonly LoggerInterface $logger,
    ) {}

    public function execute(string $eventType, array $payload): void
    {
        $sagaId = $payload['sagaId'] ?? null;
        if (!is_string($sagaId) || $sagaId === '') {
            throw new \InvalidArgumentException('El evento SAGA requiere sagaId');
        }
        $saga = $this->sagas->find($sagaId);
        if ($saga === null) {
            $this->logger->warning('Se ignoró evento para SAGA desconocida', ['sagaId' => $sagaId, 'eventType' => $eventType]);
            return;
        }
        if (in_array($saga->status, [SagaStatus::COMPLETED, SagaStatus::COMPENSATING, SagaStatus::ROLLED_BACK], true)) {
            return;
        }
        if (in_array($eventType, ['saga.step2.dossier-locked', 'DossierLockedEvent'], true)) {
            $this->completeStep2AndCreateContract($saga);
            return;
        }
        if (in_array($eventType, [
            'VacancyAdjudicationFailedEvent',
            'saga.vacancy.adjudication.failed',
            'saga.step2.dossier-lock-failed',
            'DossierLockFailedEvent',
        ], true)) {
            $this->compensate($sagaId, (string) ($payload['reason'] ?? 'SAGA participant failed'));
            return;
        }
        if (in_array($eventType, ['VacancyAdjudicatedEvent', 'saga.vacancy.adjudicated'], true)) {
            $completed = $saga->advance(3, SagaStatus::COMPLETED);
            $this->sagas->save($completed);
            $this->audit->add(new AuditLogEntry(
                Str::uuid()->toString(), 'SAGA_COMPLETED', $sagaId, $payload, new DateTimeImmutable(), $sagaId,
            ));
        }
    }

    private function completeStep2AndCreateContract(\App\Entities\SagaState $saga): void
    {
        $step2 = $saga->advance(2, SagaStatus::STEP2_COMPLETED);
        $auditStep2 = new AuditLogEntry(
            Str::uuid()->toString(), 'SAGA_STEP2_DOSSIER_LOCKED', $saga->sagaId,
            ['candidateId' => $saga->candidatoId], new DateTimeImmutable(), $saga->sagaId,
        );
        $this->sagas->saveTransition($step2, [$auditStep2]);
        try {
            $result = $this->vacancies->createContract([
                'sagaId' => $saga->sagaId, 'vacancyId' => $saga->vacanteId,
                'applicationId' => $saga->applicationId, 'candidateId' => $saga->candidatoId,
                'contractTerms' => [],
            ]);
            if (($result['status'] ?? null) !== 'COMPLETED') {
                $this->compensate($saga->sagaId, $result['reason'] ?? 'vacancy rejected or unknown adjudication result');
                return;
            }
            $completed = $saga->advance(3, SagaStatus::COMPLETED);
            $audit = new AuditLogEntry(
                Str::uuid()->toString(), 'SAGA_COMPLETED', $saga->sagaId, $result,
                new DateTimeImmutable(), $saga->sagaId,
            );
            $this->sagas->saveTransition($completed, [$audit]);
        } catch (Throwable $exception) {
            $this->logger->error('Falló Paso 3 de adjudicación', ['sagaId' => $saga->sagaId, 'exception' => $exception]);
            $this->compensate($saga->sagaId, $exception->getMessage());
        }
    }

    private function compensate(string $sagaId, string $reason): void
    {
        $saga = $this->sagas->find($sagaId);
        if ($saga === null || $saga->status === SagaStatus::ROLLED_BACK) {
            return;
        }
        $compensating = $saga->fail($reason);
        $command = new OutboxEvent(
            Str::uuid()->toString(), 'SagaStep2CompensateDossier', $sagaId,
            [
                'sagaId' => $sagaId, 'candidateId' => $saga->candidatoId,
                'restoreApplicationIds' => $saga->restoreApplicationIds, 'reason' => $reason,
            ],
            'ingesta.saga.commands', new DateTimeImmutable(),
        );
        $this->sagas->saveTransition($compensating, [$command]);
        $this->compensateRanking->execute($sagaId, $reason);
    }
}
