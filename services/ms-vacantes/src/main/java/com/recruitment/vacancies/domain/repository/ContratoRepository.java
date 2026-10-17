package com.recruitment.vacancies.domain.repository;

import com.recruitment.vacancies.domain.model.Contrato;
import java.util.Optional;
import java.util.UUID;

public interface ContratoRepository {
    Contrato save(Contrato contrato);
    Optional<Contrato> findBySagaId(UUID sagaId);
}
