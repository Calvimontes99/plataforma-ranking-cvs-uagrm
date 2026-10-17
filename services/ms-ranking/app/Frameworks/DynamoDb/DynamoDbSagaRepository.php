<?php

namespace App\Frameworks\DynamoDb;

use App\Entities\SagaState;
use App\Entities\AuditLogEntry;
use App\Entities\OutboxEvent;
use App\InterfaceAdapters\Gateways\DynamoItemMapper;
use App\UseCases\Ports\SagaRepositoryPort;
use Aws\DynamoDb\DynamoDbClient;

final class DynamoDbSagaRepository implements SagaRepositoryPort
{
    private readonly string $table;

    public function __construct(
        private readonly DynamoDbClient $client,
        private readonly DynamoItemMapper $mapper,
    ) {
        $this->table = (string) config('ranking.tables.sagas');
    }

    public function save(SagaState $saga): void
    {
        $this->client->putItem([
            'TableName' => $this->table,
            'Item' => $this->mapper->encode($saga->toArray()),
        ]);
    }

    public function saveTransition(SagaState $saga, array $outboxAndAudit): void
    {
        $items = [[
            'Put' => [
                'TableName' => $this->table,
                'Item' => $this->mapper->encode($saga->toArray()),
                'ConditionExpression' => 'attribute_exists(sagaId)',
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
        $this->client->transactWriteItems(['TransactItems' => $items]);
    }

    public function find(string $sagaId): ?SagaState
    {
        $result = $this->client->getItem([
            'TableName' => $this->table, 'ConsistentRead' => true,
            'Key' => $this->mapper->encode(['sagaId' => $sagaId]),
        ]);
        return isset($result['Item']) ? SagaState::fromArray($this->mapper->decode($result['Item'])) : null;
    }
}
