<?php

namespace App\Frameworks\DynamoDb;

use Aws\DynamoDb\DynamoDbClient;

final class DynamoDbSchemaManager
{
    public function __construct(private readonly DynamoDbClient $client) {}

    public function ensureTables(): void
    {
        $this->ensure(
            (string) config('ranking.tables.rankings'),
            [['AttributeName' => 'vacancyId', 'KeyType' => 'HASH'], ['AttributeName' => 'candidateId', 'KeyType' => 'RANGE']],
            [
                ['AttributeName' => 'vacancyId', 'AttributeType' => 'S'],
                ['AttributeName' => 'candidateId', 'AttributeType' => 'S'],
                ['AttributeName' => 'score', 'AttributeType' => 'N'],
            ],
            [
                [
                'IndexName' => 'VacancyScoreIndex',
                'KeySchema' => [['AttributeName' => 'vacancyId', 'KeyType' => 'HASH'], ['AttributeName' => 'score', 'KeyType' => 'RANGE']],
                'Projection' => ['ProjectionType' => 'ALL'],
                ],
                [
                'IndexName' => 'CandidateApplicationsIndex',
                'KeySchema' => [['AttributeName' => 'candidateId', 'KeyType' => 'HASH'], ['AttributeName' => 'vacancyId', 'KeyType' => 'RANGE']],
                'Projection' => ['ProjectionType' => 'ALL'],
                ],
            ],
        );
        $this->ensure(
            (string) config('ranking.tables.sagas'),
            [['AttributeName' => 'sagaId', 'KeyType' => 'HASH']],
            [['AttributeName' => 'sagaId', 'AttributeType' => 'S']],
        );
        $this->ensure(
            (string) config('ranking.tables.idempotency'),
            [['AttributeName' => 'idempotencyKey', 'KeyType' => 'HASH']],
            [['AttributeName' => 'idempotencyKey', 'AttributeType' => 'S']],
        );
        $this->ensure(
            (string) config('ranking.tables.audit'),
            [['AttributeName' => 'auditId', 'KeyType' => 'HASH']],
            [
                ['AttributeName' => 'auditId', 'AttributeType' => 'S'],
                ['AttributeName' => 'sagaId', 'AttributeType' => 'S'],
                ['AttributeName' => 'occurredAt', 'AttributeType' => 'S'],
            ],
            [[
                'IndexName' => 'SagaAuditIndex',
                'KeySchema' => [['AttributeName' => 'sagaId', 'KeyType' => 'HASH'], ['AttributeName' => 'occurredAt', 'KeyType' => 'RANGE']],
                'Projection' => ['ProjectionType' => 'ALL'],
            ]],
        );
        $this->ensure(
            (string) config('ranking.tables.outbox'),
            [['AttributeName' => 'eventId', 'KeyType' => 'HASH']],
            [
                ['AttributeName' => 'eventId', 'AttributeType' => 'S'],
                ['AttributeName' => 'deliveryStatus', 'AttributeType' => 'S'],
                ['AttributeName' => 'createdAt', 'AttributeType' => 'S'],
            ],
            [[
                'IndexName' => 'PendingOutboxIndex',
                'KeySchema' => [['AttributeName' => 'deliveryStatus', 'KeyType' => 'HASH'], ['AttributeName' => 'createdAt', 'KeyType' => 'RANGE']],
                'Projection' => ['ProjectionType' => 'ALL'],
            ]],
        );
    }

    private function ensure(string $tableName, array $keys, array $definitions, array $indexes = []): void
    {
        try {
            $this->client->describeTable(['TableName' => $tableName]);
            return;
        } catch (\Aws\DynamoDb\Exception\DynamoDbException $exception) {
            if ($exception->getAwsErrorCode() !== 'ResourceNotFoundException') {
                throw $exception;
            }
        }
        $params = [
            'TableName' => $tableName, 'KeySchema' => $keys,
            'AttributeDefinitions' => $definitions,
            'BillingMode' => 'PAY_PER_REQUEST',
        ];
        if ($indexes) {
            $params['GlobalSecondaryIndexes'] = array_map(
                fn (array $index): array => $index + ['ProvisionedThroughput' => ['ReadCapacityUnits' => 5, 'WriteCapacityUnits' => 5]],
                $indexes,
            );
            $params['BillingMode'] = 'PROVISIONED';
            $params['ProvisionedThroughput'] = ['ReadCapacityUnits' => 5, 'WriteCapacityUnits' => 5];
        }
        try {
            $this->client->createTable($params);
        } catch (\Aws\DynamoDb\Exception\DynamoDbException $exception) {
            if ($exception->getAwsErrorCode() !== 'ResourceInUseException') {
                throw $exception;
            }
        }
        $this->client->waitUntil('TableExists', ['TableName' => $tableName]);
    }
}
