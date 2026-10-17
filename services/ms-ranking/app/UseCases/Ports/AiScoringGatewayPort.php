<?php

namespace App\UseCases\Ports;

interface AiScoringGatewayPort
{
    public function score(array $resume, array $vacancy): ?array;
}
