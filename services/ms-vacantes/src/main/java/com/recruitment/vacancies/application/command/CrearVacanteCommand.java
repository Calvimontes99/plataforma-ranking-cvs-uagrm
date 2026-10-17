package com.recruitment.vacancies.application.command;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record CrearVacanteCommand(UUID departamentoId, String titulo, String descripcion,
                                  int cupoTotal, BigDecimal salarioPresupuestado, String moneda,
                                  List<String> habilidadesRequeridas, List<String> habilidadesPreferidas,
                                  Instant fechaCierre) {
}
