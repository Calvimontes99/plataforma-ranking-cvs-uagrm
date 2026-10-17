<?php

namespace App\Frameworks\Console;

use App\Frameworks\DynamoDb\DynamoDbSchemaManager;
use Illuminate\Console\Command;

final class EnsureDynamoTablesCommand extends Command
{
    protected $signature = 'ranking:ensure-tables';
    protected $description = 'Crea las tablas y los índices de ms-ranking si todavía no existen';

    public function handle(DynamoDbSchemaManager $schema): int
    {
        $schema->ensureTables();
        $this->info('Tablas DynamoDB listas');
        return self::SUCCESS;
    }
}
