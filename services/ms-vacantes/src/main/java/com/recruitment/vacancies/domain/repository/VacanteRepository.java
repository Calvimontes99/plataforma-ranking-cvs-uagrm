package com.recruitment.vacancies.domain.repository;

import com.recruitment.vacancies.domain.model.Vacante;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface VacanteRepository {
    Vacante save(Vacante vacante);
    Optional<Vacante> findById(UUID id);
    Optional<Vacante> findByIdForUpdate(UUID id);
    List<Vacante> findOpen(UUID departamentoId, int limit);
}
