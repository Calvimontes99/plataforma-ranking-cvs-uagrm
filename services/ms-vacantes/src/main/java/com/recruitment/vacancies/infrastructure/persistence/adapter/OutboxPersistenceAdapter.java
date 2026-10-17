package com.recruitment.vacancies.infrastructure.persistence.adapter;

import com.recruitment.vacancies.domain.model.OutboxEvent;
import com.recruitment.vacancies.domain.repository.OutboxEventRepository;
import com.recruitment.vacancies.infrastructure.persistence.entity.OutboxEventJpaEntity;
import com.recruitment.vacancies.infrastructure.persistence.repository.SpringDataOutboxEventRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public class OutboxPersistenceAdapter implements OutboxEventRepository {
    private final SpringDataOutboxEventRepository repository;
    public OutboxPersistenceAdapter(SpringDataOutboxEventRepository repository) { this.repository = repository; }
    @Override public OutboxEvent save(OutboxEvent value) {
        OutboxEventJpaEntity e = repository.findById(value.id()).orElseGet(OutboxEventJpaEntity::new);
        e.setId(value.id()); e.setAggregateType(value.aggregateType()); e.setAggregateId(value.aggregateId());
        e.setEventType(value.eventType()); e.setPayload(value.payload()); e.setRoutingKey(value.routingKey());
        e.setStatus(value.status()); e.setAttempts(value.attempts()); e.setOccurredAt(value.occurredAt());
        e.setPublishedAt(value.publishedAt()); e.setLastError(value.lastError());
        return toDomain(repository.save(e));
    }
    @Override public List<OutboxEvent> findPublishable(int limit) {
        return repository.findByStatusInAndAttemptsLessThanOrderByOccurredAtAsc(
                List.of(OutboxEvent.Status.PENDING, OutboxEvent.Status.FAILED), 10, PageRequest.of(0, limit))
                .stream().map(this::toDomain).toList();
    }
    private OutboxEvent toDomain(OutboxEventJpaEntity e) {
        return new OutboxEvent(e.getId(), e.getAggregateType(), e.getAggregateId(), e.getEventType(),
                e.getPayload(), e.getRoutingKey(), e.getStatus(), e.getAttempts(), e.getOccurredAt(),
                e.getPublishedAt(), e.getLastError());
    }
}
