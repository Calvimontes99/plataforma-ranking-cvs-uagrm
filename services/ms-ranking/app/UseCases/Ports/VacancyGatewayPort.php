<?php

namespace App\UseCases\Ports;

interface VacancyGatewayPort
{
    public function createContract(array $command): array;
    public function preapprove(array $command): array;
}
