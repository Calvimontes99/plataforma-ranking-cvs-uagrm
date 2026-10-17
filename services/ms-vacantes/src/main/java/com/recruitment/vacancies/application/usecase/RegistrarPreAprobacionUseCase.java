package com.recruitment.vacancies.application.usecase;

import com.recruitment.vacancies.application.command.RegistrarPreAprobacionCommand;
import com.recruitment.vacancies.domain.exception.EntidadNoEncontradaException;
import com.recruitment.vacancies.domain.model.OutboxEvent;
import com.recruitment.vacancies.domain.model.PreAprobacion;
import com.recruitment.vacancies.domain.repository.OutboxEventRepository;
import com.recruitment.vacancies.domain.repository.PreAprobacionRepository;
import com.recruitment.vacancies.domain.repository.VacanteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
public class RegistrarPreAprobacionUseCase {
    private final VacanteRepository vacantes;
    private final PreAprobacionRepository preAprobaciones;
    private final OutboxEventRepository outbox;
    private final EventPayloads payloads;

    public RegistrarPreAprobacionUseCase(VacanteRepository vacantes, PreAprobacionRepository preAprobaciones,
                                         OutboxEventRepository outbox, EventPayloads payloads) {
        this.vacantes = vacantes;
        this.preAprobaciones = preAprobaciones;
        this.outbox = outbox;
        this.payloads = payloads;
    }

    @Transactional
    public PreAprobacion execute(RegistrarPreAprobacionCommand command) {
        vacantes.findById(command.vacanteId())
                .orElseThrow(() -> new EntidadNoEncontradaException("Vacante no encontrada"));
        return preAprobaciones.findByVacanteIdAndPostulacionId(command.vacanteId(), command.postulacionId())
                .orElseGet(() -> create(command));
    }

    private PreAprobacion create(RegistrarPreAprobacionCommand command) {
        PreAprobacion item = new PreAprobacion(UUID.randomUUID(), command.vacanteId(), command.postulacionId(),
                command.candidatoId(), command.rankingId(), command.score(), Instant.now());
        PreAprobacion saved = preAprobaciones.save(item);
        outbox.save(OutboxEvent.pending("PreAprobacion", saved.id(), "CandidatePreapprovedEvent",
                payloads.serialize(Map.of("preapprovalId", saved.id(), "vacancyId", saved.vacanteId(),
                        "applicationId", saved.postulacionId(), "candidateId", saved.candidatoId(),
                        "score", saved.score())), "candidate.preapproved"));
        return saved;
    }
}
