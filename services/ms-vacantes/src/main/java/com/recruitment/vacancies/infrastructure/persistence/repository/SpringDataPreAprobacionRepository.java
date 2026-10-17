package com.recruitment.vacancies.infrastructure.persistence.repository;
import com.recruitment.vacancies.infrastructure.persistence.entity.PreAprobacionJpaEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
public interface SpringDataPreAprobacionRepository extends JpaRepository<PreAprobacionJpaEntity, UUID> {
    Optional<PreAprobacionJpaEntity> findByVacanteIdAndPostulacionId(UUID vacanteId, UUID postulacionId);
    List<PreAprobacionJpaEntity> findByVacanteIdOrderByScoreDesc(UUID vacanteId);
}
