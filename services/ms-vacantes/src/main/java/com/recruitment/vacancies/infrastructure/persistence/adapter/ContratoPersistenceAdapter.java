package com.recruitment.vacancies.infrastructure.persistence.adapter;

import com.recruitment.vacancies.domain.model.Contrato;
import com.recruitment.vacancies.domain.repository.ContratoRepository;
import com.recruitment.vacancies.infrastructure.persistence.entity.ContratoJpaEntity;
import com.recruitment.vacancies.infrastructure.persistence.repository.SpringDataContratoRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.UUID;

@Repository
public class ContratoPersistenceAdapter implements ContratoRepository {
    private final SpringDataContratoRepository repository;
    public ContratoPersistenceAdapter(SpringDataContratoRepository repository) { this.repository = repository; }
    @Override public Contrato save(Contrato value) {
        var entity = new ContratoJpaEntity();
        entity.setId(value.id()); entity.setSagaId(value.sagaId()); entity.setVacanteId(value.vacanteId());
        entity.setPostulacionId(value.postulacionId()); entity.setCandidatoId(value.candidatoId());
        entity.setTerminos(value.terminos()); entity.setCreadoEn(value.creadoEn());
        return toDomain(repository.save(entity));
    }
    @Override public Optional<Contrato> findBySagaId(UUID sagaId) { return repository.findBySagaId(sagaId).map(this::toDomain); }
    private Contrato toDomain(ContratoJpaEntity e) {
        return new Contrato(e.getId(), e.getSagaId(), e.getVacanteId(), e.getPostulacionId(),
                e.getCandidatoId(), e.getTerminos(), e.getCreadoEn());
    }
}
