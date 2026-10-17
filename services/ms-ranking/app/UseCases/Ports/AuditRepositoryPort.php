<?php

namespace App\UseCases\Ports;

use App\Entities\AuditLogEntry;

interface AuditRepositoryPort
{
    public function add(AuditLogEntry $entry): void;
}
