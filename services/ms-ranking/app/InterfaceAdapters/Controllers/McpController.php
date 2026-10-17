<?php

namespace App\InterfaceAdapters\Controllers;

use App\UseCases\CalculateAndRankCandidateUseCase;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

final class McpController
{
    public function __construct(private readonly CalculateAndRankCandidateUseCase $calculate) {}

    public function tools(): JsonResponse
    {
        return response()->json(['tools' => [
            [
                'name' => 'recalcular_puntaje_candidatos',
                'description' => 'Recalcula el score de una lista de candidatos para una vacante',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => [
                        'vacancy' => ['type' => 'object'],
                        'candidates' => ['type' => 'array', 'items' => ['type' => 'object']],
                    ],
                    'required' => ['vacancy', 'candidates'],
                ],
            ],
            [
                'name' => 'obtener_top_ranking_vacante',
                'description' => 'Devuelve los candidatos con mayor score de una vacante',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => [
                        'vacancyId' => ['type' => 'string', 'format' => 'uuid'],
                        'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100],
                    ],
                    'required' => ['vacancyId'],
                ],
            ],
        ]]);
    }

    public function execute(Request $request): JsonResponse
    {
        $input = Validator::make($request->all(), [
            'name' => ['required', 'string', 'in:recalcular_puntaje_candidatos,obtener_top_ranking_vacante'],
            'arguments' => ['required', 'array'],
        ])->validate();
        $arguments = $input['arguments'];
        if ($input['name'] === 'obtener_top_ranking_vacante') {
            $args = Validator::make($arguments, [
                'vacancyId' => ['required', 'uuid'],
                'limit' => ['sometimes', 'integer', 'between:1,100'],
            ])->validate();
            $result = [
                'results' => $this->calculate->top($args['vacancyId'], (int) ($args['limit'] ?? 20)),
            ];
        } else {
            $args = Validator::make($arguments, [
                'vacancy' => ['required', 'array'],
                'candidates' => ['required', 'array', 'min:1', 'max:100'],
                'candidates.*.vacancyId' => ['required', 'uuid'],
                'candidates.*.candidateId' => ['required', 'uuid'],
                'candidates.*.resumeId' => ['required', 'uuid'],
                'candidates.*.applicationId' => ['required', 'uuid'],
                'candidates.*.resume' => ['required', 'array'],
            ])->validate();
            $result = ['results' => array_map(
                fn (array $candidate): array => $this->calculate->execute($candidate + ['vacancy' => $args['vacancy']]),
                $args['candidates'],
            )];
        }
        return response()->json(['content' => [['type' => 'json', 'json' => $result]], 'isError' => false]);
    }
}
