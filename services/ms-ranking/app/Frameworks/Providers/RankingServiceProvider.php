<?php

namespace App\Frameworks\Providers;

use App\Frameworks\DynamoDb\DynamoDbSagaRepository;
use App\Frameworks\DynamoDb\DynamoDbSchemaManager;
use App\Frameworks\Console\ConsumeSagaEventsCommand;
use App\Frameworks\Console\EnsureDynamoTablesCommand;
use App\Frameworks\Console\PublishOutboxCommand;
use App\InterfaceAdapters\Gateways\DynamoDbAuditRepository;
use App\InterfaceAdapters\Gateways\DynamoDbIdempotencyRepository;
use App\InterfaceAdapters\Gateways\DynamoDbOutboxRepository;
use App\InterfaceAdapters\Gateways\DynamoDbRankingRepository;
use App\InterfaceAdapters\Gateways\DynamoItemMapper;
use App\InterfaceAdapters\Gateways\GrpcVacancyGateway;
use App\InterfaceAdapters\Gateways\GuzzleAiScoringGateway;
use App\InterfaceAdapters\Gateways\RabbitMqEventPublisher;
use App\UseCases\Ports\AiScoringGatewayPort;
use App\UseCases\Ports\AuditRepositoryPort;
use App\UseCases\Ports\EventPublisherPort;
use App\UseCases\Ports\IdempotencyRepositoryPort;
use App\UseCases\Ports\OutboxRepositoryPort;
use App\UseCases\Ports\RankingRepositoryPort;
use App\UseCases\Ports\SagaRepositoryPort;
use App\UseCases\Ports\VacancyGatewayPort;
use Aws\DynamoDb\DynamoDbClient;
use GuzzleHttp\Client;
use GuzzleHttp\ClientInterface;
use Illuminate\Support\ServiceProvider;
use Psr\Log\LoggerInterface;

final class RankingServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(DynamoDbClient::class, fn (): DynamoDbClient => new DynamoDbClient([
            'version' => 'latest',
            'region' => config('services.aws.region'),
            'credentials' => ['key' => config('services.aws.key'), 'secret' => config('services.aws.secret')],
            ...(config('services.aws.endpoint') ? ['endpoint' => config('services.aws.endpoint')] : []),
        ]));
        $this->app->singleton(DynamoItemMapper::class);
        $this->app->singleton(DynamoDbSchemaManager::class);

        $this->app->singleton(DynamoDbRankingRepository::class);
        $this->app->singleton(DynamoDbSagaRepository::class);
        $this->app->singleton(DynamoDbIdempotencyRepository::class);
        $this->app->singleton(DynamoDbOutboxRepository::class);
        $this->app->singleton(DynamoDbAuditRepository::class);
        $this->app->bind(RankingRepositoryPort::class, DynamoDbRankingRepository::class);
        $this->app->bind(SagaRepositoryPort::class, DynamoDbSagaRepository::class);
        $this->app->bind(IdempotencyRepositoryPort::class, DynamoDbIdempotencyRepository::class);
        $this->app->bind(OutboxRepositoryPort::class, DynamoDbOutboxRepository::class);
        $this->app->bind(AuditRepositoryPort::class, DynamoDbAuditRepository::class);

        $this->app->singleton(ClientInterface::class, fn (): ClientInterface => new Client());
        $this->app->singleton(AiScoringGatewayPort::class, fn ($app): AiScoringGatewayPort => new GuzzleAiScoringGateway(
            $app->make(ClientInterface::class), $app->make(LoggerInterface::class),
            (string) config('services.ai_node_url'),
        ));
        $this->app->singleton(VacancyGatewayPort::class, fn (): VacancyGatewayPort => new GrpcVacancyGateway(
            (string) config('services.vacancy_grpc_address'),
            (int) config('services.vacancy_grpc_timeout'),
        ));
        $this->app->singleton(EventPublisherPort::class, RabbitMqEventPublisher::class);
    }

    public function boot(): void
    {
        if ($this->app->runningInConsole()) {
            $this->commands([
                EnsureDynamoTablesCommand::class,
                PublishOutboxCommand::class,
                ConsumeSagaEventsCommand::class,
            ]);
        }
    }
}
