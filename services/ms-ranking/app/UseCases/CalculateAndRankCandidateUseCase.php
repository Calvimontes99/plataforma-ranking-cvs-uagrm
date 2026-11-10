<?php

namespace App\UseCases;

use App\Entities\AuditLogEntry;
use App\Entities\OutboxEvent;
use App\Entities\RankingEntry;
use App\Entities\RankingStatus;
use App\UseCases\Ports\AiScoringGatewayPort;
use App\UseCases\Ports\RankingRepositoryPort;
use DateTimeImmutable;
use InvalidArgumentException;

final class CalculateAndRankCandidateUseCase
{
    public function __construct(
        private readonly RankingRepositoryPort $rankings,
        private readonly AiScoringGatewayPort $ai,
    ) {}

    public function execute(array $input): array
    {
        foreach (['vacancyId', 'candidateId', 'resumeId', 'applicationId'] as $field) {
            if (!isset($input[$field]) || !is_string($input[$field]) || $input[$field] === '') {
                throw new InvalidArgumentException("$field es obligatorio");
            }
        }
        $resume = is_array($input['resume'] ?? null) ? $input['resume'] : [];
        $vacancy = is_array($input['vacancy'] ?? null) ? $input['vacancy'] : [];
        $aiScore = $this->ai->score($resume, $vacancy);
        $score = $aiScore !== null ? (float) $aiScore['score'] : $this->heuristicScore($resume, $vacancy);
        $score = round(max(0, min(100, $score)), 2);
        $breakdown = $aiScore['breakdown'] ?? $this->heuristicBreakdown($resume, $vacancy);
        $now = new DateTimeImmutable();
        $existing = $this->rankings->find($input['vacancyId'], $input['candidateId']);
        if ($existing !== null && $existing->estado === RankingStatus::SELECCIONADO) {
            return $this->present($existing, 1);
        }
        $entry = new RankingEntry(
            $input['vacancyId'],
            $input['candidateId'],
            $input['resumeId'],
            $input['applicationId'],
            $score,
            $breakdown,
            $score >= 85 ? RankingStatus::PRE_APROBADO : RankingStatus::EN_CONCURSO,
            ($existing?->version ?? 0) + 1,
            $existing?->createdAt ?? $now,
            $now,
            $existing?->rankingId ?? $this->uuid(),
            $aiScore['modelVersion'] ?? 'heuristic-v1',
        );
        $events = [new OutboxEvent(
            $this->uuid(), 'CandidateRankedEvent', $entry->rankingId,
            $entry->toArray(), 'ranking.candidate.ranked', $now,
        )];
        if ($score >= 85) {
            $events[] = new OutboxEvent(
                $this->uuid(), 'CandidatePreapprovedEvent', $entry->rankingId,
                [
                    'vacancyId' => $entry->vacanteId, 'applicationId' => $entry->applicationId,
                    'candidateId' => $entry->candidatoId, 'score' => $entry->scoreCompatibilidad,
                    'rankingId' => $entry->rankingId,
                ],
                'vacancy.candidate.preapproved', $now,
            );
        }
        $audit = new AuditLogEntry(
            $this->uuid(), 'CANDIDATE_RANKED', $entry->rankingId,
            ['vacancyId' => $entry->vacanteId, 'candidateId' => $entry->candidatoId, 'score' => $score],
            $now,
        );
        $this->rankings->saveEvaluation($entry, [...$events, $audit]);
        $list = $this->rankings->byVacancy($entry->vacanteId);
        foreach ($list as $index => $ranked) {
            if ($ranked->candidatoId === $entry->candidatoId) {
                return $this->present($entry, $index + 1);
            }
        }
        return $this->present($entry, count($list) + 1);
    }

    public function top(string $vacancyId, int $limit = 20): array
    {
        $entries = $this->rankings->byVacancy($vacancyId, min(max($limit, 1), 100));
        return array_map(fn (RankingEntry $entry, int $index): array => $this->present($entry, $index + 1), $entries, array_keys($entries));
    }

    private function heuristicScore(array $resume, array $vacancy): float
    {
        return $this->heuristicBreakdown($resume, $vacancy)['model_score'];
    }

    private function heuristicBreakdown(array $resume, array $vacancy): array
    {
        $candidateSkills = array_map(
            fn ($skill): string => strtolower(is_array($skill) ? (string) ($skill['name'] ?? '') : (string) $skill),
            is_array($resume['skills'] ?? null) ? $resume['skills'] : [],
        );
        $required = array_map(
            fn ($skill): string => strtolower(is_array($skill) ? (string) ($skill['name'] ?? '') : (string) $skill),
            is_array($vacancy['requiredSkills'] ?? null) ? $vacancy['requiredSkills'] : [],
        );
        $preferred = array_map('strtolower', is_array($vacancy['preferredSkills'] ?? null) ? $vacancy['preferredSkills'] : []);
        $requiredMatches = count(array_intersect(array_filter($required), array_filter($candidateSkills)));
        $skillsScore = count($required) > 0 ? 100 * $requiredMatches / count($required) : 50;
        if ($preferred) {
            $skillsScore = min(100, $skillsScore * 0.8 + 20 * count(array_intersect($preferred, $candidateSkills)) / count($preferred));
        }
        $experience = is_array($resume['experience'] ?? null) ? count($resume['experience']) : 0;
        $education = is_array($resume['education'] ?? null) ? count($resume['education']) : 0;
        $experienceScore = min(100, $experience * 25);
        $educationScore = min(100, $education * 50);
        $semanticScore = $candidateSkills ? 60 : 0;
        $modelScore = $skillsScore * 0.6 + $experienceScore * 0.2 + $educationScore * 0.1 + $semanticScore * 0.1;
        return [
            'skills_score' => round($skillsScore, 2), 'experience_score' => round($experienceScore, 2),
            'education_score' => round($educationScore, 2), 'semantic_score' => round($semanticScore, 2),
            'model_score' => round($modelScore, 2),
        ];
    }

    private function present(RankingEntry $entry, int $position): array
    {
        return [
            'rankingId' => $entry->rankingId, 'applicationId' => $entry->applicationId,
            'vacancyId' => $entry->vacanteId, 'candidateId' => $entry->candidatoId,
            'resumeId' => $entry->cvId, 'score' => $entry->scoreCompatibilidad,
            'breakdown' => $entry->desgloseSkills, 'position' => $position,
            'status' => $entry->estado->value, 'modelVersion' => $entry->modelVersion,
            'evaluatedAt' => $entry->updatedAt->format(DATE_ATOM),
        ];
    }

    private function uuid(): string
    {
        return \Illuminate\Support\Str::uuid()->toString();
    }
}
