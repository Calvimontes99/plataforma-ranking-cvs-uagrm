<?php

namespace App\UseCases;

use App\Entities\AuditLogEntry;
use App\Entities\OutboxEvent;
use App\Entities\SagaStatus;
use App\UseCases\Ports\RankingRepositoryPort;
use App\UseCases\Ports\SagaRepositoryPort;
use DateTimeImmutable;
use Illuminate\Support\Str;

final class CompensateRankingSelectionUseCase
{
    public function __construct(
        private readonly RankingRepositoryPort $rankings,
        private readonly SagaRepositoryPort $sagas,
    ) {}

    public function execute(string $sagaId, string $reason): array
    {
        $saga = $this->sagas->find($sagaId);
        if ($saga === null) {
            throw new \InvalidArgumentException("SAGA $sagaId no encontrada");
        }
        if ($saga->status === SagaStatus::ROLLED_BACK) {
            return $saga->toArray();
        }
        $now = new DateTimeImmutable();
        $entry = $this->rankings->compensate($saga->vacanteId, $saga->candidatoId);
        if ($entry === null) {
            throw new \RuntimeException('No existe el registro seleccionado para compensar');
        }
        $compensated = $saga->fail($reason, SagaStatus::ROLLED_BACK);
        $event = new OutboxEvent(
            Str::uuid()->toString(), 'CandidateSelectionRevertedEvent', $sagaId,
            ['sagaId' => $sagaId, 'rankingId' => $entry->rankingId, 'reason' => $reason],
            'ranking.saga.compensated', $now,
        );
        $audit = new AuditLogEntry(
            Str::uuid()->toString(), 'SAGA_RANKING_COMPENSATED', $sagaId,
            ['candidateId' => $saga->candidatoId, 'reason' => $reason, 'status' => SagaStatus::ROLLED_BACK->value],
            $now, $sagaId,
        );
        $this->sagas->saveTransition($compensated, [$event, $audit]);
        return $compensated->toArray();
    }
}
