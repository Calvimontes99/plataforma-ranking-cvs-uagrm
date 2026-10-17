package com.recruitment.vacancies.infrastructure.persistence.repository;
import com.recruitment.vacancies.domain.model.OutboxEvent;
import com.recruitment.vacancies.infrastructure.persistence.entity.OutboxEventJpaEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
public interface SpringDataOutboxEventRepository extends JpaRepository<OutboxEventJpaEntity, UUID> {
    List<OutboxEventJpaEntity> findByStatusInAndAttemptsLessThanOrderByOccurredAtAsc(
            Collection<OutboxEvent.Status> statuses, int attempts, Pageable pageable);
}
