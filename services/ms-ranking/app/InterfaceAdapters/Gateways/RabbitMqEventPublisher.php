<?php

namespace App\InterfaceAdapters\Gateways;

use App\UseCases\Ports\EventPublisherPort;
use PhpAmqpLib\Message\AMQPMessage;
use PhpAmqpLib\Connection\AMQPStreamConnection;

final class RabbitMqEventPublisher implements EventPublisherPort
{
    private ?AMQPStreamConnection $connection = null;
    private mixed $channel = null;

    public function publish(string $routingKey, array $event): void
    {
        $this->connect();
        $this->channel->basic_publish(new AMQPMessage(
            json_encode($event, JSON_THROW_ON_ERROR),
            ['content_type' => 'application/json', 'delivery_mode' => AMQPMessage::DELIVERY_MODE_PERSISTENT],
        ), (string) config('services.rabbitmq.exchange'), $routingKey);
        $this->channel->wait_for_pending_acks_returns(5);
    }

    private function connect(): void
    {
        if ($this->connection?->isConnected() && $this->channel?->is_open()) return;
        $this->connection = new AMQPStreamConnection(
            (string) config('services.rabbitmq.host'), (int) config('services.rabbitmq.port'),
            (string) config('services.rabbitmq.user'), (string) config('services.rabbitmq.password'),
            (string) config('services.rabbitmq.vhost'), false, 'AMQPLAIN', null, 'en_US', 2, 5, null, false, 5,
        );
        $this->channel = $this->connection->channel();
        $exchange = (string) config('services.rabbitmq.exchange');
        $this->channel->exchange_declare($exchange, 'topic', false, true, false);
        $this->channel->confirm_select();
    }
}
