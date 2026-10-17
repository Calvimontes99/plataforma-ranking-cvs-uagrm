package com.recruitment.vacancies.application.usecase;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
final class EventPayloads {
    private final ObjectMapper objectMapper;

    EventPayloads(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    String serialize(Map<String, ?> values) {
        try {
            return objectMapper.writeValueAsString(values);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("No se pudo serializar el evento de dominio", exception);
        }
    }
}
