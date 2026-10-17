package com.recruitment.vacancies.domain.repository;

import com.recruitment.vacancies.domain.model.Departamento;
import java.util.Optional;
import java.util.UUID;

public interface DepartamentoRepository {
    Optional<Departamento> findById(UUID id);
}
