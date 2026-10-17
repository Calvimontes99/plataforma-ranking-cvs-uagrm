<?php

namespace App\InterfaceAdapters\Gateways;

use App\Entities\AuditLogEntry;
use App\Entities\OutboxEvent;
use App\Entities\RankingEntry;
use App\Entities\SagaState;
use App\UseCases\Ports\RankingRepositoryPort;
use Aws\DynamoDb\DynamoDbClient;
use Aws\DynamoDb\Exception\DynamoDbException;

final class DynamoDbRankingRepository implements RankingRepositoryPort
{
    private readonly string $table;

    public function __construct(
        private readonly DynamoDbClient $client,
        private readonly DynamoItemMapper $mapper,
    ) {
        $this->table = (string) config('ranking.tables.rankings');
    }

    public function save(RankingEntry $entry): void
    {
        $item = $entry->toArray() + ['evaluationsFrozen' => false];
        try {
            $this->client->putItem([
                'TableName' => $this->table,
                'Item' => $this->mapper->encode($item),
                'ConditionExpression' => 'attribute_not_exists(vacancyId) OR (evaluationsFrozen = :false AND #version = :previousVersion)',
                'ExpressionAttributeNames' => ['#version' => 'version'],
                'ExpressionAttributeValues' => $this->mapper->encode([
                    ':false' => false, ':previousVersion' => max(0, $entry->version - 1),
                ]),
            ]);
        } catch (DynamoDbException $exception) {
            if ($exception->getAwsErrorCode() === 'ConditionalCheckFailedException') {
                throw new \DomainException('La evaluación fue congelada o modificada concurrentemente');
            }
            throw $exception;
        }
    }

    public function saveEvaluation(RankingEntry $entry, array $outboxAndAudit): void
    {
        $items = [[
            'Put' => [
                'TableName' => $this->table,
                'Item' => $this->mapper->encode($entry->toArray() + ['evaluationsFrozen' => false]),
                'ConditionExpression' => 'attribute_not_exists(vacancyId) OR (evaluationsFrozen = :false AND #version = :previousVersion)',
                'ExpressionAttributeNames' => ['#version' => 'version'],
                'ExpressionAttributeValues' => $this->mapper->encode([
                    ':false' => false, ':previousVersion' => max(0, $entry->version - 1),
                ]),
            ],
        ]];
        foreach ($outboxAndAudit as $record) {
            if ($record instanceof OutboxEvent) {
                $items[] = ['Put' => [
                    'TableName' => (string) config('ranking.tables.outbox'),
                    'Item' => $this->mapper->encode($record->toArray() + ['deliveryStatus' => 'PENDING']),
                    'ConditionExpression' => 'attribute_not_exists(eventId)',
                ]];
            } elseif ($record instanceof AuditLogEntry) {
                $items[] = ['Put' => [
                    'TableName' => (string) config('ranking.tables.audit'),
                    'Item' => $this->mapper->encode($record->toArray()),
                    'ConditionExpression' => 'attribute_not_exists(auditId)',
                ]];
            }
        }
        try {
            $this->client->transactWriteItems(['TransactItems' => $items]);
        } catch (DynamoDbException $exception) {
            if ($exception->getAwsErrorCode() === 'TransactionCanceledException') {
                throw new \DomainException('La evaluación está congelada o se actualizó concurrentemente');
            }
            throw $exception;
        }
    }

    public function find(string $vacancyId, string $candidateId): ?RankingEntry
    {
        $result = $this->client->getItem([
            'TableName' => $this->table, 'ConsistentRead' => true,
            'Key' => $this->mapper->encode(['vacancyId' => $vacancyId, 'candidateId' => $candidateId]),
        ]);
        return isset($result['Item']) ? $this->toEntry($this->mapper->decode($result['Item'])) : null;
    }

    public function findByRankingId(string $rankingId): ?RankingEntry
    {
        $result = $this->client->scan([
            'TableName' => $this->table,
            'FilterExpression' => 'rankingId = :rankingId',
            'ExpressionAttributeValues' => $this->mapper->encode([':rankingId' => $rankingId]),
            'Limit' => 1000,
        ]);
        foreach ($result['Items'] ?? [] as $item) {
            return $this->toEntry($this->mapper->decode($item));
        }
        return null;
    }

    public function byVacancy(string $vacancyId, int $limit = 100): array
    {
        $result = $this->client->query([
            'TableName' => $this->table, 'IndexName' => 'VacancyScoreIndex',
            'KeyConditionExpression' => 'vacancyId = :vacancyId',
            'ExpressionAttributeValues' => $this->mapper->encode([':vacancyId' => $vacancyId]),
            'ScanIndexForward' => false,
            'Limit' => min(max($limit, 1), 100),
        ]);
        $entries = array_map(fn (array $item): RankingEntry => $this->toEntry($this->mapper->decode($item)), $result['Items'] ?? []);
        usort($entries, static fn (RankingEntry $a, RankingEntry $b): int =>
            ($b->scoreCompatibilidad <=> $a->scoreCompatibilidad) ?: strcmp($a->candidatoId, $b->candidatoId));
        return $entries;
    }

    public function selectForSaga(RankingEntry $entry, array $records): void
    {
        $otherCandidates = $this->client->query([
            'TableName' => $this->table, 'IndexName' => 'CandidateApplicationsIndex',
            'KeyConditionExpression' => 'candidateId = :candidateId',
            'ExpressionAttributeValues' => $this->mapper->encode([':candidateId' => $entry->candidatoId]),
            'Limit' => 23,
        ]);
        if (isset($otherCandidates['LastEvaluatedKey'])) {
            throw new \DomainException('Demasiadas evaluaciones paralelas para congelar atómicamente en DynamoDB');
        }
        $items = [
            ['Put' => [
                'TableName' => $this->table,
                'Item' => $this->mapper->encode($entry->toArray() + ['evaluationsFrozen' => true]),
                'ConditionExpression' => 'attribute_exists(vacancyId) AND evaluationsFrozen = :false AND #version = :version',
                'ExpressionAttributeNames' => ['#version' => 'version'],
                'ExpressionAttributeValues' => $this->mapper->encode([
                    ':false' => false, ':version' => $entry->version - 1,
                ]),
            ]],
        ];
        foreach ($otherCandidates['Items'] ?? [] as $item) {
            $other = $this->mapper->decode($item);
            if ($other['vacancyId'] === $entry->vacanteId) continue;
            $items[] = ['Update' => [
                'TableName' => $this->table,
                'Key' => $this->mapper->encode(['vacancyId' => $other['vacancyId'], 'candidateId' => $other['candidateId']]),
                'UpdateExpression' => 'SET evaluationsFrozen = :true, updatedAt = :updatedAt',
                'ExpressionAttributeValues' => $this->mapper->encode([
                    ':true' => true, ':updatedAt' => $entry->updatedAt->format(DATE_ATOM),
                ]),
            ]];
        }
        if (count($items) > 22) {
            throw new \DomainException('Demasiadas evaluaciones paralelas para congelar atómicamente en DynamoDB');
        }
        foreach ($records as $record) {
            if ($record instanceof SagaState) {
                $items[] = ['Put' => [
                    'TableName' => (string) config('ranking.tables.sagas'),
                    'Item' => $this->mapper->encode($record->toArray()),
                    'ConditionExpression' => 'attribute_not_exists(sagaId)',
                ]];
            } elseif ($record instanceof OutboxEvent) {
                $items[] = ['Put' => [
                    'TableName' => (string) config('ranking.tables.outbox'),
                    'Item' => $this->mapper->encode($record->toArray() + ['deliveryStatus' => 'PENDING']),
                    'ConditionExpression' => 'attribute_not_exists(eventId)',
                ]];
            } elseif ($record instanceof AuditLogEntry) {
                $items[] = ['Put' => [
                    'TableName' => (string) config('ranking.tables.audit'),
                    'Item' => $this->mapper->encode($record->toArray()),
                    'ConditionExpression' => 'attribute_not_exists(auditId)',
                ]];
            }
        }
        try {
            $this->client->transactWriteItems(['TransactItems' => $items]);
        } catch (DynamoDbException $exception) {
            if ($exception->getAwsErrorCode() === 'TransactionCanceledException') {
                throw new \DomainException('No fue posible seleccionar al candidato: existe una selección concurrente');
            }
            throw $exception;
        }
    }

    public function compensate(string $vacancyId, string $candidateId): ?RankingEntry
    {
        $entry = $this->find($vacancyId, $candidateId);
        if (!$entry) return null;
        if ($entry->estado->value !== 'SELECCIONADO') return $entry;
        $restored = $entry->withState(\App\Entities\RankingStatus::EN_CONCURSO);
        $this->client->updateItem([
            'TableName' => $this->table,
            'Key' => $this->mapper->encode(['vacancyId' => $vacancyId, 'candidateId' => $candidateId]),
            'UpdateExpression' => 'SET #status = :status, #version = :version, updatedAt = :updatedAt, evaluationsFrozen = :false',
            'ConditionExpression' => '#status = :selected',
            'ExpressionAttributeNames' => ['#status' => 'status', '#version' => 'version'],
            'ExpressionAttributeValues' => $this->mapper->encode([
                ':status' => $restored->estado->value, ':version' => $restored->version,
                ':updatedAt' => $restored->updatedAt->format(DATE_ATOM), ':false' => false,
                ':selected' => \App\Entities\RankingStatus::SELECCIONADO->value,
            ]),
        ]);
        $this->client->updateItem([
            'TableName' => $this->table,
            'Key' => $this->mapper->encode(['vacancyId' => $vacancyId, 'candidateId' => $candidateId]),
            'UpdateExpression' => 'REMOVE evaluationsFrozen',
        ]);
        $this->unfreezeCandidate($candidateId);
        return $restored;
    }

    private function unfreezeCandidate(string $candidateId): void
    {
        $records = $this->client->scan([
            'TableName' => $this->table,
            'FilterExpression' => 'candidateId = :candidateId AND evaluationsFrozen = :true',
            'ExpressionAttributeValues' => $this->mapper->encode([':candidateId' => $candidateId, ':true' => true]),
        ]);
        foreach ($records['Items'] ?? [] as $item) {
            $record = $this->mapper->decode($item);
            if ($record['status'] === 'SELECCIONADO') continue;
            $this->client->updateItem([
                'TableName' => $this->table,
                'Key' => $this->mapper->encode(['vacancyId' => $record['vacancyId'], 'candidateId' => $candidateId]),
                'UpdateExpression' => 'REMOVE evaluationsFrozen',
            ]);
        }
    }

    private function toEntry(array $item): RankingEntry
    {
        return RankingEntry::fromArray($item);
    }
}
