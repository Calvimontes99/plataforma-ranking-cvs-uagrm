<?php

namespace App\UseCases\Ports;

interface EventPublisherPort
{
    public function publish(string $routingKey, array $event): void;
}
