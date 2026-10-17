package com.recruitment.vacancies.application.command;

import java.util.UUID;

public record RegistrarPreAprobacionCommand(UUID vacanteId, UUID postulacionId, UUID candidatoId,
                                            UUID rankingId, double score) {
}
