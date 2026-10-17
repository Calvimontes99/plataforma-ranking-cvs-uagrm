<?php

namespace App\Entities;

enum SagaStatus: string
{
    case STARTED = 'STARTED';
    case STEP1_COMPLETED = 'STEP1_COMPLETED';
    case STEP2_COMPLETED = 'STEP2_COMPLETED';
    case COMPLETED = 'COMPLETED';
    case COMPENSATING = 'COMPENSATING';
    case ROLLED_BACK = 'ROLLED_BACK';
}
