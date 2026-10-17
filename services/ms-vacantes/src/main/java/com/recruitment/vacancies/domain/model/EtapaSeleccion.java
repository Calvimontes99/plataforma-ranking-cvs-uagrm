package com.recruitment.vacancies.domain.model;

import java.util.Objects;
import java.util.UUID;

public record EtapaSeleccion(UUID id, UUID vacanteId, String nombre, int orden, boolean obligatoria) {
    public EtapaSeleccion {
        Objects.requireNonNull(id, "id es requerido");
        Objects.requireNonNull(vacanteId, "vacanteId es requerido");
        if (nombre == null || nombre.isBlank() || orden < 1) {
            throw new IllegalArgumentException("La etapa requiere nombre y orden positivo");
        }
    }
}
