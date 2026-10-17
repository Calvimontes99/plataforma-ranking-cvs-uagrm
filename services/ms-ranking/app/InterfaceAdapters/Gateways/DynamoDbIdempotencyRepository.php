<?php

namespace App\InterfaceAdapters\Gateways;

use App\Entities\IdempotencyRecord;
use App\UseCases\Ports\IdempotencyRepositoryPort;
use Aws\DynamoDb\DynamoDbClient;
use Aws\DynamoDb\Exception\DynamoDbException;
use DateTimeImmutable;

final class DynamoDbIdempotencyRepository implements IdempotencyRepositoryPort
{
    private readonly string $table;

    public function __construct(
        private readonly DynamoDbClient $client,
        private readonly DynamoItemMapper $mapper,
    ) {
        $this->table = (string) config('ranking.tables.idempotency');
    }

    public function find(string $key): ?IdempotencyRecord
    {
        $result = $this->client->getItem([
            'TableName' => $this->table, 'ConsistentRead' => true,
            'Key' => $this->mapper->encode(['idempotencyKey' => $key]),
        ]);
        if (!isset($result['Item'])) return null;
        $item = $this->mapper->decode($result['Item']);
        if ((int) $item['expiresAt'] <= time()) return null;
        return new IdempotencyRecord(
            $key, $item['requestHash'], isset($item['responseStatus']) ? (int) $item['responseStatus'] : null,
            $item['responseBody'] ?? null, (new DateTimeImmutable())->setTimestamp((int) $item['expiresAt']),
            ($item['state'] ?? 'IN_PROGRESS') === 'COMPLETED',
        );
    }

    public function claim(IdempotencyRecord $record): bool
    {
        try {
            $this->client->putItem([
                'TableName' => $this->table,
                'Item' => $this->mapper->encode([
                    'idempotencyKey' => $record->idempotencyKey,
                    'requestHash' => $record->requestHash,
                    'state' => 'IN_PROGRESS',
                    'expiresAt' => $record->expiresAt->getTimestamp(),
                ]),
                'ConditionExpression' => 'attribute_not_exists(idempotencyKey)',
            ]);
            return true;
        } catch (DynamoDbException $exception) {
            if ($exception->getAwsErrorCode() !== 'ConditionalCheckFailedException') throw $exception;
        }
        try {
            $this->client->updateItem([
                'TableName' => $this->table,
                'Key' => $this->mapper->encode(['idempotencyKey' => $record->idempotencyKey]),
                'UpdateExpression' => 'SET requestHash = :hash, #state = :inProgress, expiresAt = :expiresAt REMOVE responseStatus, responseBody',
                'ConditionExpression' => 'expiresAt <= :now',
                'ExpressionAttributeNames' => ['#state' => 'state'],
                'ExpressionAttributeValues' => $this->mapper->encode([
                    ':hash' => $record->requestHash, ':inProgress' => 'IN_PROGRESS',
                    ':expiresAt' => $record->expiresAt->getTimestamp(), ':now' => time(),
                ]),
            ]);
            return true;
        } catch (DynamoDbException $exception) {
            if ($exception->getAwsErrorCode() === 'ConditionalCheckFailedException') return false;
            throw $exception;
        }
    }

    public function complete(string $key, int $status, array $body): void
    {
        $this->client->updateItem([
            'TableName' => $this->table,
            'Key' => $this->mapper->encode(['idempotencyKey' => $key]),
            'UpdateExpression' => 'SET #state = :completed, responseStatus = :status, responseBody = :body',
            'ConditionExpression' => '#state = :inProgress',
            'ExpressionAttributeNames' => ['#state' => 'state'],
            'ExpressionAttributeValues' => $this->mapper->encode([
                ':completed' => 'COMPLETED', ':inProgress' => 'IN_PROGRESS',
                ':status' => $status, ':body' => $body,
            ]),
        ]);
    }

    public function release(string $key): void
    {
        $this->client->deleteItem([
            'TableName' => $this->table,
            'Key' => $this->mapper->encode(['idempotencyKey' => $key]),
            'ConditionExpression' => '#state = :inProgress',
            'ExpressionAttributeNames' => ['#state' => 'state'],
            'ExpressionAttributeValues' => $this->mapper->encode([':inProgress' => 'IN_PROGRESS']),
        ]);
    }
}
