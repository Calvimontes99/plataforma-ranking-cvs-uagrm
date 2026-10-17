package com.recruitment.vacancies.domain.model;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record Contrato(UUID id, UUID sagaId, UUID vacanteId, UUID postulacionId,
                       UUID candidatoId, String terminos, Instant creadoEn) {
    public Contrato {
        Objects.requireNonNull(id);
        Objects.requireNonNull(sagaId);
        Objects.requireNonNull(vacanteId);
        Objects.requireNonNull(postulacionId);
        Objects.requireNonNull(candidatoId);
        Objects.requireNonNull(creadoEn);
        if (terminos == null || terminos.isBlank()) {
            throw new IllegalArgumentException("Los términos del contrato son requeridos");
        }
    }
}
