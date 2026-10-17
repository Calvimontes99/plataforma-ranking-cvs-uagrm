package com.recruitment.vacancies.domain.valueobject;

import com.recruitment.vacancies.domain.exception.CupoAgotadoException;

import java.math.BigDecimal;
import java.util.Currency;
import java.util.Objects;

public record CupoPresupuestario(int total, int disponible, BigDecimal salario, Currency moneda) {
    public CupoPresupuestario {
        if (total < 0 || disponible < 0 || disponible > total) {
            throw new IllegalArgumentException("Los cupos deben cumplir 0 <= disponible <= total");
        }
        Objects.requireNonNull(salario, "salario es requerido");
        Objects.requireNonNull(moneda, "moneda es requerida");
        if (salario.signum() < 0) {
            throw new IllegalArgumentException("El salario presupuestado no puede ser negativo");
        }
    }

    public CupoPresupuestario descontarUno() {
        if (disponible == 0) {
            throw new CupoAgotadoException("La vacante no tiene cupos disponibles");
        }
        return new CupoPresupuestario(total, disponible - 1, salario, moneda);
    }
}
