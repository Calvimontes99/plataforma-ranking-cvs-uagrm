<?php

namespace App\Entities;

use DateTimeImmutable;

final class SagaState
{
    public function __construct(
        public readonly string $sagaId,
        public readonly string $vacanteId,
        public readonly string $candidatoId,
        public readonly string $cvId,
        public readonly string $applicationId,
        public readonly int $currentStep,
        public readonly SagaStatus $status,
        public readonly ?string $razonFallo,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $updatedAt,
        public readonly array $restoreApplicationIds = [],
        public readonly string $rankingId = '',
    ) {}

    public function advance(int $step, SagaStatus $status): self
    {
        return new self(
            $this->sagaId, $this->vacanteId, $this->candidatoId, $this->cvId, $this->applicationId,
            $step, $status, $this->razonFallo, $this->createdAt, new DateTimeImmutable(),
            $this->restoreApplicationIds, $this->rankingId,
        );
    }

    public function fail(string $reason, SagaStatus $status = SagaStatus::COMPENSATING): self
    {
        return new self(
            $this->sagaId, $this->vacanteId, $this->candidatoId, $this->cvId, $this->applicationId,
            $this->currentStep, $status, $reason, $this->createdAt, new DateTimeImmutable(),
            $this->restoreApplicationIds, $this->rankingId,
        );
    }

    public function toArray(): array
    {
        return [
            'sagaId' => $this->sagaId, 'vacancyId' => $this->vacanteId,
            'candidateId' => $this->candidatoId, 'resumeId' => $this->cvId,
            'applicationId' => $this->applicationId, 'currentStep' => $this->currentStep,
            'status' => $this->status->value, 'failureReason' => $this->razonFallo,
            'createdAt' => $this->createdAt->format(DATE_ATOM), 'updatedAt' => $this->updatedAt->format(DATE_ATOM),
            'restoreApplicationIds' => $this->restoreApplicationIds, 'rankingId' => $this->rankingId,
        ];
    }

    public static function fromArray(array $data): self
    {
        return new self(
            $data['sagaId'], $data['vacancyId'], $data['candidateId'], $data['resumeId'],
            $data['applicationId'], (int) $data['currentStep'], SagaStatus::from($data['status']),
            $data['failureReason'] ?? null, new DateTimeImmutable($data['createdAt']),
            new DateTimeImmutable($data['updatedAt']), $data['restoreApplicationIds'] ?? [],
            $data['rankingId'] ?? '',
        );
    }
}
