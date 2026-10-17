<?php

namespace App\InterfaceAdapters\Controllers;

use App\UseCases\CalculateAndRankCandidateUseCase;
use App\UseCases\CompensateRankingSelectionUseCase;
use App\UseCases\StartAdjudicationSagaUseCase;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

final class RankingController
{
    public function __construct(
        private readonly CalculateAndRankCandidateUseCase $calculate,
        private readonly StartAdjudicationSagaUseCase $startSaga,
        private readonly CompensateRankingSelectionUseCase $compensate,
    ) {}

    public function health(): JsonResponse
    {
        return response()->json(['service' => 'ms-ranking', 'status' => 'UP', 'version' => '1.0.0']);
    }

    public function ranking(string $vacancyId, Request $request): JsonResponse
    {
        $limit = filter_var($request->query('limit', 20), FILTER_VALIDATE_INT);
        if ($limit === false || $limit < 1 || $limit > 100) {
            throw ValidationException::withMessages(['limit' => 'limit debe estar entre 1 y 100']);
        }
        return response()->json([
            'vacancyId' => $vacancyId,
            'results' => $this->calculate->top($vacancyId, $limit),
            'generatedAt' => now()->toISOString(),
        ]);
    }

    public function evaluate(Request $request): JsonResponse
    {
        $input = $this->validated($request, [
            'vacancyId' => ['required', 'uuid'],
            'candidateId' => ['sometimes', 'uuid'],
            'resumeId' => ['sometimes', 'uuid'],
            'applicationId' => ['required', 'uuid'],
            'resume' => ['required', 'array'],
            'vacancy' => ['required', 'array'],
        ]);
        $input['candidateId'] ??= $input['resume']['candidateId'] ?? null;
        $input['resumeId'] ??= $input['resume']['resumeId'] ?? null;
        if (!is_string($input['candidateId']) || !is_string($input['resumeId'])) {
            throw ValidationException::withMessages(['resume' => 'resume debe incluir resumeId y candidateId']);
        }
        return response()->json($this->calculate->execute($input));
    }

    public function startSaga(Request $request): JsonResponse
    {
        $input = $this->validated($request, [
            'vacancyId' => ['required', 'uuid'],
            'candidateId' => ['required', 'uuid'],
            'applicationId' => ['sometimes', 'uuid'],
            'rankingId' => ['sometimes', 'uuid'],
            'sagaId' => ['sometimes', 'uuid'],
            'reason' => ['sometimes', 'string', 'max:500'],
        ]);
        return response()->json($this->startSaga->execute($input), 202);
    }

    public function revertSelection(Request $request): JsonResponse
    {
        $input = $this->validated($request, [
            'sagaId' => ['required', 'uuid'],
            'rankingId' => ['sometimes', 'uuid'],
            'reason' => ['required', 'string', 'max:1000'],
        ]);
        return response()->json($this->compensate->execute($input['sagaId'], $input['reason']));
    }

    public function compensate(string $sagaId, Request $request): JsonResponse
    {
        $input = $this->validated($request, ['reason' => ['required', 'string', 'max:1000']]);
        return response()->json($this->compensate->execute($sagaId, $input['reason']));
    }

    private function validated(Request $request, array $rules): array
    {
        return Validator::make($request->all(), $rules)->validate();
    }
}
