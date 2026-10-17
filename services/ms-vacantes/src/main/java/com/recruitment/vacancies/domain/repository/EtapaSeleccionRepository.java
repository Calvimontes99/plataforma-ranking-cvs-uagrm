package com.recruitment.vacancies.domain.repository;

import com.recruitment.vacancies.domain.model.EtapaSeleccion;
import java.util.List;
import java.util.UUID;

public interface EtapaSeleccionRepository {
    EtapaSeleccion save(EtapaSeleccion etapa);
    List<EtapaSeleccion> findByVacanteId(UUID vacanteId);
}
