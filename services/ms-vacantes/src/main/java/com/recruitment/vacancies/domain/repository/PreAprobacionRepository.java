package com.recruitment.vacancies.domain.repository;

import com.recruitment.vacancies.domain.model.PreAprobacion;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PreAprobacionRepository {
    PreAprobacion save(PreAprobacion preAprobacion);
    Optional<PreAprobacion> findByVacanteIdAndPostulacionId(UUID vacanteId, UUID postulacionId);
    List<PreAprobacion> findByVacanteId(UUID vacanteId);
}
