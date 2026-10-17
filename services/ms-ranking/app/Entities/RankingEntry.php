<?php

namespace App\Entities;

use DateTimeImmutable;

final class RankingEntry
{
    public function __construct(
        public readonly string $vacanteId,
        public readonly string $candidatoId,
        public readonly string $cvId,
        public readonly string $applicationId,
        public readonly float $scoreCompatibilidad,
        public readonly array $desgloseSkills,
        public readonly RankingStatus $estado,
        public readonly int $version,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $updatedAt,
        public readonly string $rankingId,
        public readonly string $modelVersion = 'heuristic-v1',
    ) {}

    public function withState(RankingStatus $state): self
    {
        return new self(
            $this->vacanteId, $this->candidatoId, $this->cvId, $this->applicationId,
            $this->scoreCompatibilidad, $this->desgloseSkills, $state, $this->version + 1,
            $this->createdAt, new DateTimeImmutable(), $this->rankingId, $this->modelVersion,
        );
    }

    public function toArray(): array
    {
        return [
            'vacancyId' => $this->vacanteId,
            'candidateId' => $this->candidatoId,
            'resumeId' => $this->cvId,
            'applicationId' => $this->applicationId,
            'score' => $this->scoreCompatibilidad,
            'breakdown' => $this->desgloseSkills,
            'status' => $this->estado->value,
            'version' => $this->version,
            'createdAt' => $this->createdAt->format(DATE_ATOM),
            'updatedAt' => $this->updatedAt->format(DATE_ATOM),
            'rankingId' => $this->rankingId,
            'modelVersion' => $this->modelVersion,
        ];
    }

    public static function fromArray(array $data): self
    {
        return new self(
            $data['vacancyId'], $data['candidateId'], $data['resumeId'], $data['applicationId'] ?? '',
            (float) $data['score'], $data['breakdown'] ?? [],
            RankingStatus::from($data['status'] ?? RankingStatus::EN_CONCURSO->value),
            (int) ($data['version'] ?? 1),
            new DateTimeImmutable($data['createdAt']), new DateTimeImmutable($data['updatedAt']),
            $data['rankingId'], $data['modelVersion'] ?? 'unknown',
        );
    }
}
