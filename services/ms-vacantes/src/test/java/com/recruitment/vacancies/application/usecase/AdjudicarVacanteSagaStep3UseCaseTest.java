package com.recruitment.vacancies.application.usecase;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.recruitment.vacancies.application.command.AdjudicarVacanteCommand;
import com.recruitment.vacancies.domain.exception.CupoAgotadoException;
import com.recruitment.vacancies.domain.model.OutboxEvent;
import com.recruitment.vacancies.domain.model.Vacante;
import com.recruitment.vacancies.domain.repository.*;
import com.recruitment.vacancies.domain.valueobject.CupoPresupuestario;
import com.recruitment.vacancies.domain.valueobject.EstadoVacante;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;

class AdjudicarVacanteSagaStep3UseCaseTest {
    @Test
    void persisteEventoDeFalloCuandoNoHayCupo() {
        VacanteRepository vacancies = mock(VacanteRepository.class);
        ContratoRepository contracts = mock(ContratoRepository.class);
        OutboxEventRepository outbox = mock(OutboxEventRepository.class);
        UUID vacancyId = UUID.randomUUID();
        UUID sagaId = UUID.randomUUID();
        Vacante vacancy = new Vacante(vacancyId, UUID.randomUUID(), "QA", "Quality Assurance",
                new CupoPresupuestario(1, 0, BigDecimal.TEN, Currency.getInstance("USD")),
                EstadoVacante.ABIERTA, List.of(), List.of(), Instant.now(), null);
        when(contracts.findBySagaId(sagaId)).thenReturn(Optional.empty());
        when(vacancies.findByIdForUpdate(vacancyId)).thenReturn(Optional.of(vacancy));

        var useCase = new AdjudicarVacanteSagaStep3UseCase(vacancies, contracts, outbox,
                new EventPayloads(new ObjectMapper()));
        var command = new AdjudicarVacanteCommand(sagaId, vacancyId, UUID.randomUUID(), UUID.randomUUID(), "{}");

        assertThatThrownBy(() -> useCase.execute(command)).isInstanceOf(CupoAgotadoException.class);
        verify(outbox).save(argThat(event -> event.eventType().equals("VacancyAdjudicationFailedEvent")
                && event.status() == OutboxEvent.Status.PENDING));
        verify(contracts, never()).save(any());
    }
}
