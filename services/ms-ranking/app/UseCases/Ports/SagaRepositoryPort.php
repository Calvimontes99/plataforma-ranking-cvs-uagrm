<?php

namespace App\UseCases\Ports;

use App\Entities\SagaState;

interface SagaRepositoryPort
{
    public function save(SagaState $saga): void;
    public function saveTransition(SagaState $saga, array $outboxAndAudit): void;
    public function find(string $sagaId): ?SagaState;
}
