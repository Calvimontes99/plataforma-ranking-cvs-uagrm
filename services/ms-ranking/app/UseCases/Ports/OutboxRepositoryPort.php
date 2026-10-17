<?php

namespace App\UseCases\Ports;

use App\Entities\OutboxEvent;

interface OutboxRepositoryPort
{
    public function add(OutboxEvent $event): void;
    public function pending(int $limit = 50): array;
    public function published(string $eventId): void;
    public function failed(string $eventId): void;
}
