<?php

namespace Tests\Unit;

use App\Entities\AuditLogEntry;
use App\Entities\OutboxEvent;
use App\Entities\RankingEntry;
use App\UseCases\CalculateAndRankCandidateUseCase;
use App\UseCases\Ports\AiScoringGatewayPort;
use App\UseCases\Ports\RankingRepositoryPort;
use PHPUnit\Framework\TestCase;

final class CalculateAndRankCandidateTest extends TestCase
{
    public function test_fallback_score_persists_rank_outbox_and_preapproval_at_threshold(): void
    {
        $rankings = new InMemoryRankings();
        $useCase = new CalculateAndRankCandidateUseCase($rankings, new UnavailableAi());
        $result = $useCase->execute([
            'vacancyId' => 'vacancy-1',
            'candidateId' => 'candidate-1',
            'resumeId' => 'resume-1',
            'applicationId' => 'application-1',
            'resume' => [
                'skills' => ['php', 'laravel'],
                'experience' => [['role' => 'developer'], ['role' => 'engineer'], ['role' => 'lead'], ['role' => 'architect']],
                'education' => [['degree' => 'BSc'], ['degree' => 'MSc']],
            ],
            'vacancy' => ['requiredSkills' => ['php', 'laravel']],
        ]);

        self::assertSame(96.0, $result['score']);
        self::assertSame(1, $result['position']);
        self::assertCount(1, $rankings->saved);
        self::assertCount(3, $rankings->transactionRecords);
        self::assertContainsOnlyInstancesOf(OutboxEvent::class, array_slice($rankings->transactionRecords, 0, 2));
        self::assertInstanceOf(AuditLogEntry::class, $rankings->transactionRecords[2]);
    }

    public function test_ai_score_is_used_when_available_and_values_are_clamped_to_the_contract_range(): void
    {
        $rankings = new InMemoryRankings();
        $ai = new class implements AiScoringGatewayPort {
            public function score(array $resume, array $vacancy): ?array
            {
                return ['score' => 78.25, 'breakdown' => ['skills_score' => 80], 'modelVersion' => 'model-7'];
            }
        };
        $useCase = new CalculateAndRankCandidateUseCase($rankings, $ai);
        $result = $useCase->execute([
            'vacancyId' => 'vacancy-2',
            'candidateId' => 'candidate-2',
            'resumeId' => 'resume-2',
            'applicationId' => 'application-2',
            'resume' => ['skills' => ['go']],
            'vacancy' => ['requiredSkills' => ['go']],
        ]);

        self::assertSame(78.25, $result['score']);
        self::assertSame('model-7', $result['modelVersion']);
        self::assertCount(2, $rankings->transactionRecords);
    }
}

final class InMemoryRankings implements RankingRepositoryPort
{
    public array $saved = [];
    public array $transactionRecords = [];

    public function save(RankingEntry $entry): void { $this->saved[] = $entry; }
    public function saveEvaluation(RankingEntry $entry, array $outboxAndAudit): void
    {
        $this->saved[] = $entry;
        $this->transactionRecords = $outboxAndAudit;
    }
    public function find(string $vacancyId, string $candidateId): ?RankingEntry { return null; }
    public function byVacancy(string $vacancyId, int $limit = 100): array { return $this->saved; }
    public function selectForSaga(RankingEntry $entry, array $records): void {}
    public function compensate(string $vacancyId, string $candidateId): ?RankingEntry { return null; }
}

final class UnavailableAi implements AiScoringGatewayPort
{
    public function score(array $resume, array $vacancy): ?array { return null; }
}
