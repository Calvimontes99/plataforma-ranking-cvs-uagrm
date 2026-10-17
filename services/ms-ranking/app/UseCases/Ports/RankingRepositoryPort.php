<?php

namespace App\UseCases\Ports;

use App\Entities\RankingEntry;

interface RankingRepositoryPort
{
    public function save(RankingEntry $entry): void;
    public function saveEvaluation(RankingEntry $entry, array $outboxAndAudit): void;
    public function find(string $vacancyId, string $candidateId): ?RankingEntry;
    public function byVacancy(string $vacancyId, int $limit = 100): array;
    public function selectForSaga(RankingEntry $entry, array $records): void;
    public function compensate(string $vacancyId, string $candidateId): ?RankingEntry;
}
