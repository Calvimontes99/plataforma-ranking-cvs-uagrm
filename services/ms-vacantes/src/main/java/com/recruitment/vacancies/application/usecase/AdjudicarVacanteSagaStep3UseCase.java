package com.recruitment.vacancies.application.usecase;

import com.recruitment.vacancies.application.command.AdjudicarVacanteCommand;
import com.recruitment.vacancies.domain.exception.CupoAgotadoException;
import com.recruitment.vacancies.domain.exception.EntidadNoEncontradaException;
import com.recruitment.vacancies.domain.model.Contrato;
import com.recruitment.vacancies.domain.model.OutboxEvent;
import com.recruitment.vacancies.domain.model.Vacante;
import com.recruitment.vacancies.domain.repository.ContratoRepository;
import com.recruitment.vacancies.domain.repository.OutboxEventRepository;
import com.recruitment.vacancies.domain.repository.VacanteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
public class AdjudicarVacanteSagaStep3UseCase {
    public record Result(UUID sagaId, UUID contratoId, int cuposRestantes) { }

    private final VacanteRepository vacantes;
    private final ContratoRepository contratos;
    private final OutboxEventRepository outbox;
    private final EventPayloads payloads;

    public AdjudicarVacanteSagaStep3UseCase(VacanteRepository vacantes, ContratoRepository contratos,
                                            OutboxEventRepository outbox, EventPayloads payloads) {
        this.vacantes = vacantes;
        this.contratos = contratos;
        this.outbox = outbox;
        this.payloads = payloads;
    }

    @Transactional(noRollbackFor = CupoAgotadoException.class)
    public Result execute(AdjudicarVacanteCommand command) {
        var existing = contratos.findBySagaId(command.sagaId());
        if (existing.isPresent()) {
            Contrato contract = existing.get();
            int slots = vacantes.findById(contract.vacanteId()).map(v -> v.cupo().disponible()).orElse(0);
            return new Result(command.sagaId(), contract.id(), slots);
        }

        Vacante vacante = vacantes.findByIdForUpdate(command.vacanteId())
                .orElseThrow(() -> new EntidadNoEncontradaException("Vacante no encontrada"));
        try {
            vacante.adjudicar();
        } catch (CupoAgotadoException exception) {
            outbox.save(OutboxEvent.pending("Vacante", vacante.id(), "VacancyAdjudicationFailedEvent",
                    payloads.serialize(Map.of("sagaId", command.sagaId(), "vacancyId", command.vacanteId(),
                            "applicationId", command.postulacionId(), "candidateId", command.candidatoId(),
                            "reason", "NO_AVAILABLE_SLOTS")), "saga.vacancy.adjudication.failed"));
            throw exception;
        }

        vacantes.save(vacante);
        Contrato contrato = contratos.save(new Contrato(UUID.randomUUID(), command.sagaId(), command.vacanteId(),
                command.postulacionId(), command.candidatoId(), command.terminos(), Instant.now()));
        outbox.save(OutboxEvent.pending("Vacante", vacante.id(), "VacancyAdjudicatedEvent",
                payloads.serialize(Map.of("sagaId", command.sagaId(), "vacancyId", command.vacanteId(),
                        "contractId", contrato.id(), "applicationId", command.postulacionId(),
                        "candidateId", command.candidatoId(), "remainingSlots", vacante.cupo().disponible())),
                "saga.vacancy.adjudicated"));
        return new Result(command.sagaId(), contrato.id(), vacante.cupo().disponible());
    }
}
