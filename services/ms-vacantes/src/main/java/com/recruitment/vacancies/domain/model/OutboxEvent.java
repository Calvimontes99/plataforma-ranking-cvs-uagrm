package com.recruitment.vacancies.domain.model;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public final class OutboxEvent {
    public enum Status { PENDING, PUBLISHED, FAILED }

    private final UUID id;
    private final String aggregateType;
    private final UUID aggregateId;
    private final String eventType;
    private final String payload;
    private final String routingKey;
    private Status status;
    private int attempts;
    private final Instant occurredAt;
    private Instant publishedAt;
    private String lastError;

    public OutboxEvent(UUID id, String aggregateType, UUID aggregateId, String eventType,
                       String payload, String routingKey, Status status, int attempts,
                       Instant occurredAt, Instant publishedAt, String lastError) {
        this.id = Objects.requireNonNull(id);
        this.aggregateType = Objects.requireNonNull(aggregateType);
        this.aggregateId = Objects.requireNonNull(aggregateId);
        this.eventType = Objects.requireNonNull(eventType);
        this.payload = Objects.requireNonNull(payload);
        this.routingKey = Objects.requireNonNull(routingKey);
        this.status = Objects.requireNonNull(status);
        this.attempts = attempts;
        this.occurredAt = Objects.requireNonNull(occurredAt);
        this.publishedAt = publishedAt;
        this.lastError = lastError;
    }

    public static OutboxEvent pending(String aggregateType, UUID aggregateId, String eventType,
                                      String payload, String routingKey) {
        return new OutboxEvent(UUID.randomUUID(), aggregateType, aggregateId, eventType, payload,
                routingKey, Status.PENDING, 0, Instant.now(), null, null);
    }

    public void markPublished() {
        status = Status.PUBLISHED;
        publishedAt = Instant.now();
        attempts++;
        lastError = null;
    }

    public void markFailed(String error) {
        status = Status.FAILED;
        attempts++;
        lastError = error == null ? "Error desconocido" : error.substring(0, Math.min(error.length(), 1000));
    }

    public UUID id() { return id; }
    public String aggregateType() { return aggregateType; }
    public UUID aggregateId() { return aggregateId; }
    public String eventType() { return eventType; }
    public String payload() { return payload; }
    public String routingKey() { return routingKey; }
    public Status status() { return status; }
    public int attempts() { return attempts; }
    public Instant occurredAt() { return occurredAt; }
    public Instant publishedAt() { return publishedAt; }
    public String lastError() { return lastError; }
}
