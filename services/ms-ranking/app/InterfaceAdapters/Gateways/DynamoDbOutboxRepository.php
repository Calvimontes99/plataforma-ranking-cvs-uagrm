<?php

namespace App\InterfaceAdapters\Gateways;

use App\Entities\OutboxEvent;
use App\UseCases\Ports\OutboxRepositoryPort;
use Aws\DynamoDb\DynamoDbClient;

final class DynamoDbOutboxRepository implements OutboxRepositoryPort
{
    private readonly string $table;

    public function __construct(
        private readonly DynamoDbClient $client,
        private readonly DynamoItemMapper $mapper,
    ) {
        $this->table = (string) config('ranking.tables.outbox');
    }

    public function add(OutboxEvent $event): void
    {
        $this->client->putItem([
            'TableName' => $this->table,
            'Item' => $this->mapper->encode($event->toArray() + ['deliveryStatus' => 'PENDING']),
            'ConditionExpression' => 'attribute_not_exists(eventId)',
        ]);
    }

    public function pending(int $limit = 50): array
    {
        $result = $this->client->query([
            'TableName' => $this->table, 'IndexName' => 'PendingOutboxIndex',
            'KeyConditionExpression' => 'deliveryStatus = :status',
            'ExpressionAttributeValues' => $this->mapper->encode([':status' => 'PENDING']),
            'ScanIndexForward' => true, 'Limit' => min(max($limit, 1), 100),
        ]);
        return array_map(fn (array $item): OutboxEvent => $this->toEvent($this->mapper->decode($item)), $result['Items'] ?? []);
    }

    public function published(string $eventId): void
    {
        $this->client->updateItem([
            'TableName' => $this->table, 'Key' => $this->mapper->encode(['eventId' => $eventId]),
            'UpdateExpression' => 'SET deliveryStatus = :published, publishedAt = :now',
            'ExpressionAttributeValues' => $this->mapper->encode([
                ':published' => 'PUBLISHED', ':now' => (new \DateTimeImmutable())->format(DATE_ATOM),
            ]),
        ]);
    }

    public function failed(string $eventId): void
    {
        $this->client->updateItem([
            'TableName' => $this->table, 'Key' => $this->mapper->encode(['eventId' => $eventId]),
            'UpdateExpression' => 'SET attempts = if_not_exists(attempts, :zero) + :one',
            'ExpressionAttributeValues' => $this->mapper->encode([':zero' => 0, ':one' => 1]),
        ]);
    }

    private function toEvent(array $item): OutboxEvent
    {
        return new OutboxEvent(
            $item['eventId'], $item['eventType'], $item['aggregateId'], $item['payload'] ?? [],
            $item['routingKey'], new \DateTimeImmutable($item['createdAt']), (int) ($item['attempts'] ?? 0),
        );
    }
}
