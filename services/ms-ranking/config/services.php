<?php

return [
    'aws' => [
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
        'key' => env('AWS_ACCESS_KEY_ID', 'local'),
        'secret' => env('AWS_SECRET_ACCESS_KEY', 'local'),
        'endpoint' => env('DYNAMODB_ENDPOINT', ''),
    ],
    'rabbitmq' => [
        'host' => env('RABBITMQ_HOST', 'localhost'),
        'port' => (int) env('RABBITMQ_PORT', 5672),
        'user' => env('RABBITMQ_USER', 'guest'),
        'password' => env('RABBITMQ_PASSWORD', 'guest'),
        'vhost' => env('RABBITMQ_VHOST', '/'),
        'exchange' => env('RABBITMQ_EXCHANGE', 'recruitment.events'),
        'queue' => env('RABBITMQ_SAGA_QUEUE', 'ranking.saga.events'),
    ],
    'ai_node_url' => env('AI_NODE_HTTP_URL', ''),
    'vacancy_grpc_address' => env('VACANCY_GRPC_ADDRESS', 'localhost:9090'),
    'vacancy_grpc_timeout' => (int) env('VACANCY_GRPC_TIMEOUT_SECONDS', 5),
    'idempotency_ttl' => (int) env('IDEMPOTENCY_TTL_SECONDS', 86400),
];
