package com.recruitment.vacancies.domain.model;

import java.util.Objects;
import java.util.UUID;

public record Departamento(UUID id, String codigo, String nombre, boolean activo) {
    public Departamento {
        Objects.requireNonNull(id, "id es requerido");
        if (codigo == null || codigo.isBlank() || nombre == null || nombre.isBlank()) {
            throw new IllegalArgumentException("Código y nombre del departamento son requeridos");
        }
    }
}
