package com.recruitment.vacancies.infrastructure.persistence.entity;

import com.recruitment.vacancies.domain.model.OutboxEvent;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "outbox_events")
public class OutboxEventJpaEntity {
    @Id private UUID id;
    @Column(name = "aggregate_type", nullable = false) private String aggregateType;
    @Column(name = "aggregate_id", nullable = false) private UUID aggregateId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable = false, columnDefinition = "jsonb") private String payload;
    @Column(name = "routing_key", nullable = false) private String routingKey;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private OutboxEvent.Status status;
    @Column(nullable = false) private int attempts;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    @Column(name = "published_at") private Instant publishedAt;
    @Column(name = "last_error") private String lastError;
    public OutboxEventJpaEntity() { }
    public UUID getId() { return id; }
    public void setId(UUID value) { id = value; }
    public String getAggregateType() { return aggregateType; }
    public void setAggregateType(String value) { aggregateType = value; }
    public UUID getAggregateId() { return aggregateId; }
    public void setAggregateId(UUID value) { aggregateId = value; }
    public String getEventType() { return eventType; }
    public void setEventType(String value) { eventType = value; }
    public String getPayload() { return payload; }
    public void setPayload(String value) { payload = value; }
    public String getRoutingKey() { return routingKey; }
    public void setRoutingKey(String value) { routingKey = value; }
    public OutboxEvent.Status getStatus() { return status; }
    public void setStatus(OutboxEvent.Status value) { status = value; }
    public int getAttempts() { return attempts; }
    public void setAttempts(int value) { attempts = value; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant value) { occurredAt = value; }
    public Instant getPublishedAt() { return publishedAt; }
    public void setPublishedAt(Instant value) { publishedAt = value; }
    public String getLastError() { return lastError; }
    public void setLastError(String value) { lastError = value; }
}
