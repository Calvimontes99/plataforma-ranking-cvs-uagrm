<?php

namespace App\UseCases;

use App\Entities\AuditLogEntry;
use App\Entities\OutboxEvent;
use App\Entities\RankingStatus;
use App\Entities\SagaState;
use App\Entities\SagaStatus;
use App\UseCases\Ports\AuditRepositoryPort;
use App\UseCases\Ports\OutboxRepositoryPort;
use App\UseCases\Ports\RankingRepositoryPort;
use App\UseCases\Ports\SagaRepositoryPort;
use DateTimeImmutable;
use Illuminate\Support\Str;
use InvalidArgumentException;

final class StartAdjudicationSagaUseCase
{
    public function __construct(
        private readonly RankingRepositoryPort $rankings,
        private readonly SagaRepositoryPort $sagas,
        private readonly OutboxRepositoryPort $outbox,
        private readonly AuditRepositoryPort $audit,
    ) {}

    public function execute(array $input): array
    {
        foreach (['vacancyId', 'candidateId'] as $field) {
            if (empty($input[$field]) || !is_string($input[$field])) {
                throw new InvalidArgumentException("$field es obligatorio");
            }
        }
        $entry = $this->rankings->find($input['vacancyId'], $input['candidateId']);
        if ($entry === null) {
            throw new InvalidArgumentException('El candidato no tiene evaluación en esta vacante');
        }
        if (isset($input['rankingId']) && $entry->rankingId !== $input['rankingId']) {
            throw new InvalidArgumentException('rankingId no corresponde a la evaluación actual');
        }
        if (isset($input['applicationId']) && $entry->applicationId !== $input['applicationId']) {
            throw new InvalidArgumentException('applicationId no corresponde al candidato');
        }
        if ($entry->estado === RankingStatus::SELECCIONADO) {
            throw new InvalidArgumentException('El candidato ya está seleccionado para esta vacante');
        }
        $sagaId = $input['sagaId'] ?? Str::uuid()->toString();
        $now = new DateTimeImmutable();
        $saga = new SagaState(
            $sagaId, $entry->vacanteId, $entry->candidatoId, $entry->cvId,
            $entry->applicationId, 1, SagaStatus::STEP1_COMPLETED, null, $now, $now,
            [], $entry->rankingId,
        );
        $selected = $entry->withState(RankingStatus::SELECCIONADO);
        $command = new OutboxEvent(
            Str::uuid()->toString(), 'SagaStep2BlockDossier', $sagaId,
            [
                'sagaId' => $sagaId, 'candidateId' => $entry->candidatoId,
                'selectedApplicationId' => $entry->applicationId, 'selectedVacancyId' => $entry->vacanteId,
                'reason' => $input['reason'] ?? 'vacancy adjudication',
            ],
            'ingesta.saga.commands', $now,
        );
        $audit = new AuditLogEntry(
            Str::uuid()->toString(), 'SAGA_STEP1_CANDIDATE_SELECTED', $sagaId,
            ['candidateId' => $entry->candidatoId, 'vacancyId' => $entry->vacanteId],
            $now, $sagaId,
        );
        $this->rankings->selectForSaga($selected, [$saga, $command, $audit]);
        return $saga->toArray();
    }
}
