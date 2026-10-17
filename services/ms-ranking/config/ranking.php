<?php

return [
    'tables' => [
        'rankings' => env('DYNAMODB_RANKING_TABLE', 'recruitment_rankings'),
        'sagas' => env('DYNAMODB_SAGA_TABLE', 'recruitment_saga_states'),
        'idempotency' => env('DYNAMODB_IDEMPOTENCY_TABLE', 'recruitment_idempotency'),
        'audit' => env('DYNAMODB_AUDIT_TABLE', 'recruitment_audit_log'),
        'outbox' => env('DYNAMODB_OUTBOX_TABLE', 'recruitment_outbox_events'),
    ],
];
