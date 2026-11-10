<?php

require '/var/www/vendor/autoload.php';

use Aws\DynamoDb\DynamoDbClient;

$input = $argv[1] ?? '/tmp/dynamodb.json';
$snapshot = json_decode(file_get_contents($input), true, 512, JSON_THROW_ON_ERROR);
if (($snapshot['formatVersion'] ?? null) !== 1 || !is_array($snapshot['tables'] ?? null)) {
    throw new RuntimeException('Unsupported DynamoDB backup format');
}

$client = new DynamoDbClient([
    'version' => 'latest',
    'region' => getenv('AWS_DEFAULT_REGION') ?: 'us-east-1',
    'endpoint' => getenv('DYNAMODB_ENDPOINT') ?: 'http://dynamodb-local:8000',
    'credentials' => [
        'key' => getenv('AWS_ACCESS_KEY_ID') ?: 'local',
        'secret' => getenv('AWS_SECRET_ACCESS_KEY') ?: 'local',
    ],
]);

foreach ($snapshot['tables'] as $tableName => $items) {
    foreach (array_chunk($items, 25) as $chunk) {
        $requests = array_map(
            static fn (array $item): array => ['PutRequest' => ['Item' => $item]],
            $chunk,
        );
        $pending = [$tableName => $requests];
        $attempt = 0;
        while ($pending !== []) {
            $result = $client->batchWriteItem(['RequestItems' => $pending]);
            $pending = $result['UnprocessedItems'] ?? [];
            if ($pending !== []) {
                usleep(min(2_000_000, 100_000 * (2 ** min($attempt, 4))));
                $attempt++;
            }
        }
    }
    fwrite(STDERR, sprintf("%s: %d items restored\n", $tableName, count($items)));
}
