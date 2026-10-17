package com.recruitment.vacancies.domain.model;

import com.recruitment.vacancies.domain.exception.CupoAgotadoException;
import com.recruitment.vacancies.domain.valueobject.CupoPresupuestario;
import com.recruitment.vacancies.domain.valueobject.EstadoVacante;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Currency;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

class VacanteTest {
    @Test
    void adjudicarDescuentaCupoYCubreLaVacanteAlConsumirElUltimo() {
        Vacante vacante = vacancy(1);
        vacante.adjudicar();
        assertThat(vacante.cupo().disponible()).isZero();
        assertThat(vacante.estado()).isEqualTo(EstadoVacante.CUBIERTA);
    }

    @Test
    void adjudicarSinCupoLanzaExcepcionDeDominio() {
        assertThatThrownBy(() -> vacancy(0).adjudicar()).isInstanceOf(CupoAgotadoException.class);
    }

    private Vacante vacancy(int available) {
        return new Vacante(UUID.randomUUID(), UUID.randomUUID(), "Backend Engineer", "Java 21",
                new CupoPresupuestario(Math.max(1, available), available, BigDecimal.valueOf(1000),
                        Currency.getInstance("USD")), EstadoVacante.ABIERTA, List.of("Java"), List.of(),
                Instant.now(), null);
    }
}
