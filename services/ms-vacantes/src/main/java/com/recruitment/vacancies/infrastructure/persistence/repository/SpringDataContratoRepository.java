package com.recruitment.vacancies.infrastructure.persistence.repository;
import com.recruitment.vacancies.infrastructure.persistence.entity.ContratoJpaEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;
public interface SpringDataContratoRepository extends JpaRepository<ContratoJpaEntity, UUID> {
    Optional<ContratoJpaEntity> findBySagaId(UUID sagaId);
}
