<?php

namespace App\UseCases\Ports;

use App\Entities\IdempotencyRecord;

interface IdempotencyRepositoryPort
{
    public function find(string $key): ?IdempotencyRecord;
    public function claim(IdempotencyRecord $record): bool;
    public function complete(string $key, int $status, array $body): void;
    public function release(string $key): void;
}
