package com.recruitment.vacancies.domain.model;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record PreAprobacion(UUID id, UUID vacanteId, UUID postulacionId, UUID candidatoId,
                           UUID rankingId, double score, Instant creadaEn) {
    public PreAprobacion {
        Objects.requireNonNull(id);
        Objects.requireNonNull(vacanteId);
        Objects.requireNonNull(postulacionId);
        Objects.requireNonNull(candidatoId);
        Objects.requireNonNull(rankingId);
        Objects.requireNonNull(creadaEn);
        if (score < 0 || score > 100) {
            throw new IllegalArgumentException("El score debe estar entre 0 y 100");
        }
    }
}
