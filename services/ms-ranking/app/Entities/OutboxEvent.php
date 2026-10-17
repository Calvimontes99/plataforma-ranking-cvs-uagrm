<?php

namespace App\Entities;

use DateTimeImmutable;

final class OutboxEvent
{
    public function __construct(
        public readonly string $eventId,
        public readonly string $eventType,
        public readonly string $aggregateId,
        public readonly array $payload,
        public readonly string $routingKey,
        public readonly DateTimeImmutable $createdAt,
        public readonly int $attempts = 0,
    ) {}

    public function toArray(): array
    {
        return [
            'eventId' => $this->eventId, 'eventType' => $this->eventType,
            'aggregateId' => $this->aggregateId, 'payload' => $this->payload,
            'routingKey' => $this->routingKey, 'createdAt' => $this->createdAt->format(DATE_ATOM),
            'attempts' => $this->attempts,
        ];
    }
}
