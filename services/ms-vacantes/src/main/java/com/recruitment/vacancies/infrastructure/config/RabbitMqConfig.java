package com.recruitment.vacancies.infrastructure.config;

import org.springframework.amqp.core.TopicExchange;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMqConfig {
    @Bean
    TopicExchange recruitmentEventsExchange(@Value("${outbox.exchange}") String name) {
        return new TopicExchange(name, true, false);
    }
}
