<?php

namespace App\Entities;

use DateTimeImmutable;

final class IdempotencyRecord
{
    public function __construct(
        public readonly string $idempotencyKey,
        public readonly string $requestHash,
        public readonly ?int $responseStatus,
        public readonly ?array $responseBody,
        public readonly DateTimeImmutable $expiresAt,
        public readonly bool $completed = false,
    ) {}
}
