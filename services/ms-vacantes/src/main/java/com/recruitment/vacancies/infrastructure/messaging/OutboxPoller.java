package com.recruitment.vacancies.infrastructure.messaging;

import com.recruitment.vacancies.domain.repository.OutboxEventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;

@Component
public class OutboxPoller {
    private static final Logger log = LoggerFactory.getLogger(OutboxPoller.class);
    private final OutboxEventRepository repository;
    private final RabbitTemplate rabbitTemplate;
    private final String exchange;
    private final int batchSize;

    public OutboxPoller(OutboxEventRepository repository, RabbitTemplate rabbitTemplate,
                        @Value("${outbox.exchange}") String exchange,
                        @Value("${outbox.batch-size}") int batchSize) {
        this.repository = repository;
        this.rabbitTemplate = rabbitTemplate;
        this.exchange = exchange;
        this.batchSize = batchSize;
    }

    @Scheduled(fixedDelayString = "${outbox.poll-delay-ms}")
    @Transactional
    public void publishPendingEvents() {
        repository.findPublishable(batchSize).forEach(event -> {
            try {
                MessageProperties properties = new MessageProperties();
                properties.setContentType(MessageProperties.CONTENT_TYPE_JSON);
                properties.setMessageId(event.id().toString());
                properties.setTimestamp(java.util.Date.from(event.occurredAt()));
                properties.setHeader("eventType", event.eventType());
                properties.setHeader("aggregateType", event.aggregateType());
                properties.setHeader("aggregateId", event.aggregateId().toString());
                rabbitTemplate.send(exchange, event.routingKey(),
                        new Message(event.payload().getBytes(StandardCharsets.UTF_8), properties));
                event.markPublished();
            } catch (RuntimeException exception) {
                log.warn("No se pudo publicar outbox event {}: {}", event.id(), exception.getMessage());
                event.markFailed(exception.getMessage());
            }
            repository.save(event);
        });
    }
}
