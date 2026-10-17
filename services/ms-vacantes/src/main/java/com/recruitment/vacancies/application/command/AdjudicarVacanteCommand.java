package com.recruitment.vacancies.application.command;

import java.util.UUID;

public record AdjudicarVacanteCommand(UUID sagaId, UUID vacanteId, UUID postulacionId,
                                      UUID candidatoId, String terminos) {
}
