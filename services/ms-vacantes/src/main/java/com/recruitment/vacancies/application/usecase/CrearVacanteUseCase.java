package com.recruitment.vacancies.application.usecase;

import com.recruitment.vacancies.application.command.CrearVacanteCommand;
import com.recruitment.vacancies.domain.exception.EntidadNoEncontradaException;
import com.recruitment.vacancies.domain.model.OutboxEvent;
import com.recruitment.vacancies.domain.model.Vacante;
import com.recruitment.vacancies.domain.repository.DepartamentoRepository;
import com.recruitment.vacancies.domain.repository.OutboxEventRepository;
import com.recruitment.vacancies.domain.repository.VacanteRepository;
import com.recruitment.vacancies.domain.valueobject.CupoPresupuestario;
import com.recruitment.vacancies.domain.valueobject.EstadoVacante;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Currency;
import java.util.Map;
import java.util.UUID;

@Service
public class CrearVacanteUseCase {
    private final VacanteRepository vacantes;
    private final DepartamentoRepository departamentos;
    private final OutboxEventRepository outbox;
    private final EventPayloads payloads;

    public CrearVacanteUseCase(VacanteRepository vacantes, DepartamentoRepository departamentos,
                               OutboxEventRepository outbox, EventPayloads payloads) {
        this.vacantes = vacantes;
        this.departamentos = departamentos;
        this.outbox = outbox;
        this.payloads = payloads;
    }

    @Transactional
    public Vacante execute(CrearVacanteCommand command) {
        departamentos.findById(command.departamentoId())
                .filter(departamento -> departamento.activo())
                .orElseThrow(() -> new EntidadNoEncontradaException("Departamento inexistente o inactivo"));

        UUID id = UUID.randomUUID();
        Vacante vacante = new Vacante(id, command.departamentoId(), command.titulo(), command.descripcion(),
                new CupoPresupuestario(command.cupoTotal(), command.cupoTotal(),
                        command.salarioPresupuestado(), Currency.getInstance(command.moneda())),
                EstadoVacante.ABIERTA, command.habilidadesRequeridas(), command.habilidadesPreferidas(),
                Instant.now(), command.fechaCierre());
        Vacante saved = vacantes.save(vacante);
        outbox.save(OutboxEvent.pending("Vacante", id, "VacancyCreatedEvent",
                payloads.serialize(Map.of("vacancyId", id, "departmentId", command.departamentoId(),
                        "title", command.titulo(), "availableSlots", command.cupoTotal())),
                "vacancy.created"));
        return saved;
    }
}
