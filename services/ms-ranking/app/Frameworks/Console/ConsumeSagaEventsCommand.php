<?php

namespace App\Frameworks\Console;

use App\UseCases\HandleSagaStepEventsUseCase;
use Illuminate\Console\Command;
use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;
use Psr\Log\LoggerInterface;
use Throwable;

final class ConsumeSagaEventsCommand extends Command
{
    protected $signature = 'ranking:consume-saga';
    protected $description = 'Consume las confirmaciones y fallos de los participantes de la SAGA';

    public function handle(HandleSagaStepEventsUseCase $handler, LoggerInterface $logger): int
    {
        while (true) {
            $connection = null;
            try {
                $connection = new AMQPStreamConnection(
                    (string) config('services.rabbitmq.host'), (int) config('services.rabbitmq.port'),
                    (string) config('services.rabbitmq.user'), (string) config('services.rabbitmq.password'),
                    (string) config('services.rabbitmq.vhost'), false, 'AMQPLAIN', null, 'en_US',
                    2, 5, null, false, 5,
                );
                $channel = $connection->channel();
                $exchange = (string) config('services.rabbitmq.exchange');
                $queue = (string) config('services.rabbitmq.queue');
                $channel->exchange_declare($exchange, 'topic', false, true, false);
                $channel->queue_declare($queue, false, true, false, false);
                foreach ([
                    'saga.step2.dossier-locked', 'DossierLockedEvent', 'saga.step2.dossier-lock-failed',
                    'DossierLockFailedEvent', 'saga.vacancy.adjudication.failed',
                    'saga.vacancy.adjudicated', 'VacancyAdjudicatedEvent',
                ] as $routingKey) {
                    $channel->queue_bind($queue, $exchange, $routingKey);
                }
                $channel->basic_qos(null, 1, null);
                $channel->basic_consume($queue, '', false, false, false, false,
                    function (AMQPMessage $message) use ($handler, $logger, $channel): void {
                        try {
                            $event = json_decode($message->getBody(), true, flags: JSON_THROW_ON_ERROR);
                            if (!is_array($event)) throw new \UnexpectedValueException('Evento RabbitMQ no es objeto JSON');
                            $handler->execute(
                                (string) ($event['eventType'] ?? $message->getRoutingKey()),
                                is_array($event['payload'] ?? null) ? $event['payload'] : $event,
                            );
                            $channel->basic_ack($message->getDeliveryTag());
                        } catch (Throwable $exception) {
                            $logger->error('Evento SAGA inválido o no procesable', [
                                'routingKey' => $message->getRoutingKey(), 'exception' => $exception->getMessage(),
                            ]);
                            $channel->basic_nack($message->getDeliveryTag(), false, false);
                        }
                    });
                while ($channel->is_consuming()) $channel->wait();
            } catch (Throwable $exception) {
                $logger->error('Consumidor SAGA perdió la conexión RabbitMQ', ['exception' => $exception->getMessage()]);
                sleep(3);
            } finally {
                if ($connection?->isConnected()) $connection->close();
            }
        }
    }
}
