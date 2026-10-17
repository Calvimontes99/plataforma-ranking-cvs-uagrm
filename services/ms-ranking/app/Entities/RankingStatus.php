<?php

namespace App\Entities;

enum RankingStatus: string
{
    case EN_CONCURSO = 'EN_CONCURSO';
    case SELECCIONADO = 'SELECCIONADO';
    case PRE_APROBADO = 'PRE_APROBADO';
    case DESCARTADO = 'DESCARTADO';
}
