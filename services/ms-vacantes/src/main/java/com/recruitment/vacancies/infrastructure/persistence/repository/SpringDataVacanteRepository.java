package com.recruitment.vacancies.infrastructure.persistence.repository;

import com.recruitment.vacancies.domain.valueobject.EstadoVacante;
import com.recruitment.vacancies.infrastructure.persistence.entity.VacanteJpaEntity;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SpringDataVacanteRepository extends JpaRepository<VacanteJpaEntity, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from VacanteJpaEntity v where v.id = :id")
    Optional<VacanteJpaEntity> findByIdForUpdate(@Param("id") UUID id);

    List<VacanteJpaEntity> findByEstadoOrderByFechaAperturaDesc(EstadoVacante estado, Pageable pageable);
    List<VacanteJpaEntity> findByEstadoAndDepartamentoIdOrderByFechaAperturaDesc(
            EstadoVacante estado, UUID departamentoId, Pageable pageable);
}
