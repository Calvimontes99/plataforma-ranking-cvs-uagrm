<?php

require '/var/www/vendor/autoload.php';

use Aws\DynamoDb\DynamoDbClient;

$client = new DynamoDbClient([
    'version' => 'latest',
    'region' => getenv('AWS_DEFAULT_REGION') ?: 'us-east-1',
    'endpoint' => getenv('DYNAMODB_ENDPOINT') ?: 'http://dynamodb-local:8000',
    'credentials' => [
        'key' => getenv('AWS_ACCESS_KEY_ID') ?: 'local',
        'secret' => getenv('AWS_SECRET_ACCESS_KEY') ?: 'local',
    ],
]);

$tableNames = array_filter([
    getenv('DYNAMODB_RANKING_TABLE') ?: 'recruitment_rankings',
    getenv('DYNAMODB_SAGA_TABLE') ?: 'recruitment_saga_states',
    getenv('DYNAMODB_IDEMPOTENCY_TABLE') ?: 'recruitment_idempotency',
    getenv('DYNAMODB_AUDIT_TABLE') ?: 'recruitment_audit_log',
    getenv('DYNAMODB_OUTBOX_TABLE') ?: 'recruitment_outbox_events',
]);

$snapshot = ['formatVersion' => 1, 'tables' => []];
foreach ($tableNames as $tableName) {
    $items = [];
    $lastKey = null;
    do {
        $params = ['TableName' => $tableName];
        if ($lastKey !== null) {
            $params['ExclusiveStartKey'] = $lastKey;
        }
        $page = $client->scan($params);
        array_push($items, ...$page['Items']);
        $lastKey = !empty($page['LastEvaluatedKey']) ? $page['LastEvaluatedKey'] : null;
    } while ($lastKey !== null);
    $snapshot['tables'][$tableName] = $items;
    fwrite(STDERR, sprintf("%s: %d items\n", $tableName, count($items)));
}

$output = $argv[1] ?? '/tmp/dynamodb.json';
if (file_put_contents($output, json_encode($snapshot, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT)) === false) {
    fwrite(STDERR, "Unable to write DynamoDB snapshot\n");
    exit(1);
}
