<?php

namespace App\Frameworks\Console;

use App\UseCases\Ports\EventPublisherPort;
use App\UseCases\Ports\OutboxRepositoryPort;
use Illuminate\Console\Command;
use Psr\Log\LoggerInterface;
use Throwable;

final class PublishOutboxCommand extends Command
{
    protected $signature = 'ranking:publish-outbox {--loop : Mantener el poller activo}';
    protected $description = 'Publica eventos pendientes del Outbox transaccional en RabbitMQ';

    public function handle(OutboxRepositoryPort $outbox, EventPublisherPort $publisher, LoggerInterface $logger): int
    {
        do {
            try {
                foreach ($outbox->pending() as $event) {
                    try {
                        $publisher->publish($event->routingKey, [
                            'eventId' => $event->eventId,
                            'eventType' => $event->eventType,
                            'aggregateId' => $event->aggregateId,
                            'occurredAt' => $event->createdAt->format(DATE_ATOM),
                            'payload' => $event->payload,
                        ]);
                        $outbox->published($event->eventId);
                    } catch (Throwable $exception) {
                        $outbox->failed($event->eventId);
                        $logger->error('No se pudo publicar evento del outbox', [
                            'eventId' => $event->eventId, 'exception' => $exception->getMessage(),
                        ]);
                    }
                }
            } catch (Throwable $exception) {
                $logger->error('No fue posible leer eventos del outbox', ['exception' => $exception->getMessage()]);
                if (!$this->option('loop')) return self::FAILURE;
            }
            if ($this->option('loop')) usleep(1_000_000);
        } while ($this->option('loop'));

        return self::SUCCESS;
    }
}
