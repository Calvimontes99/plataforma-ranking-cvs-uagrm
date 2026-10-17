<?php

namespace App\Entities;

use DateTimeImmutable;

final class AuditLogEntry
{
    public function __construct(
        public readonly string $auditId,
        public readonly string $action,
        public readonly string $aggregateId,
        public readonly array $details,
        public readonly DateTimeImmutable $occurredAt,
        public readonly ?string $sagaId = null,
    ) {}

    public function toArray(): array
    {
        return [
            'auditId' => $this->auditId, 'action' => $this->action,
            'aggregateId' => $this->aggregateId, 'details' => $this->details,
            'occurredAt' => $this->occurredAt->format(DATE_ATOM), 'sagaId' => $this->sagaId,
        ];
    }
}
