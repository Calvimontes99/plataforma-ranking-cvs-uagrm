package com.recruitment.vacancies.infrastructure.persistence.repository;

import com.recruitment.vacancies.infrastructure.persistence.entity.EtapaSeleccionJpaEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface SpringDataEtapaSeleccionRepository extends JpaRepository<EtapaSeleccionJpaEntity, UUID> {
    List<EtapaSeleccionJpaEntity> findByVacanteIdOrderByOrden(UUID vacanteId);
}
