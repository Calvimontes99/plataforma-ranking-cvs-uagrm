<?php

use App\InterfaceAdapters\Controllers\McpController;
use App\InterfaceAdapters\Controllers\RankingController;
use Illuminate\Support\Facades\Route;

Route::get('/metrics', static function () {
    return response(
        "# HELP ms_ranking_up Whether the ms-ranking service is available.\n"
        ."# TYPE ms_ranking_up gauge\n"
        ."ms_ranking_up 1\n",
        200,
        ['Content-Type' => 'text/plain; version=0.0.4; charset=utf-8'],
    );
});

Route::get('/api/v1/ranking/health', [RankingController::class, 'health']);
Route::get('/api/v1/ranking/vacancies/{vacancyId}', [RankingController::class, 'ranking']);
Route::post('/api/v1/ranking/evaluate', [RankingController::class, 'evaluate'])->middleware('idempotency');
Route::post('/api/v1/ranking/sagas', [RankingController::class, 'startSaga'])->middleware('idempotency');
Route::post('/api/v1/ranking/select', [RankingController::class, 'startSaga'])->middleware('idempotency');
Route::post('/api/v1/ranking/sagas/{sagaId}/compensate', [RankingController::class, 'compensate'])->middleware('idempotency');
Route::post('/api/v1/ranking/revert', [RankingController::class, 'revertSelection'])->middleware('idempotency');

Route::get('/mcp/tools', [McpController::class, 'tools']);
Route::post('/mcp/execute', [McpController::class, 'execute'])->middleware('idempotency');
