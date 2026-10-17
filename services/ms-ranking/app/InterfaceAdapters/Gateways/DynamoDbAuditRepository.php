<?php

namespace App\InterfaceAdapters\Gateways;

use App\Entities\AuditLogEntry;
use App\UseCases\Ports\AuditRepositoryPort;
use Aws\DynamoDb\DynamoDbClient;

final class DynamoDbAuditRepository implements AuditRepositoryPort
{
    private readonly string $table;

    public function __construct(
        private readonly DynamoDbClient $client,
        private readonly DynamoItemMapper $mapper,
    ) {
        $this->table = (string) config('ranking.tables.audit');
    }

    public function add(AuditLogEntry $entry): void
    {
        $item = $entry->toArray() + ['occurredAt' => $entry->occurredAt->format('Y-m-d\TH:i:s.u\Z')];
        $this->client->putItem([
            'TableName' => $this->table,
            'Item' => $this->mapper->encode($item),
        ]);
    }
}
