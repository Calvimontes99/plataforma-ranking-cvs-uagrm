package com.recruitment.vacancies.infrastructure.persistence.adapter;

import com.recruitment.vacancies.domain.model.PreAprobacion;
import com.recruitment.vacancies.domain.repository.PreAprobacionRepository;
import com.recruitment.vacancies.infrastructure.persistence.entity.PreAprobacionJpaEntity;
import com.recruitment.vacancies.infrastructure.persistence.repository.SpringDataPreAprobacionRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class PreAprobacionPersistenceAdapter implements PreAprobacionRepository {
    private final SpringDataPreAprobacionRepository repository;
    public PreAprobacionPersistenceAdapter(SpringDataPreAprobacionRepository repository) { this.repository = repository; }
    @Override public PreAprobacion save(PreAprobacion value) {
        var entity = new PreAprobacionJpaEntity();
        entity.setId(value.id()); entity.setVacanteId(value.vacanteId()); entity.setPostulacionId(value.postulacionId());
        entity.setCandidatoId(value.candidatoId()); entity.setRankingId(value.rankingId());
        entity.setScore(value.score()); entity.setCreadaEn(value.creadaEn());
        return toDomain(repository.save(entity));
    }
    @Override public Optional<PreAprobacion> findByVacanteIdAndPostulacionId(UUID v, UUID p) {
        return repository.findByVacanteIdAndPostulacionId(v, p).map(this::toDomain);
    }
    @Override public List<PreAprobacion> findByVacanteId(UUID id) {
        return repository.findByVacanteIdOrderByScoreDesc(id).stream().map(this::toDomain).toList();
    }
    private PreAprobacion toDomain(PreAprobacionJpaEntity e) {
        return new PreAprobacion(e.getId(), e.getVacanteId(), e.getPostulacionId(), e.getCandidatoId(),
                e.getRankingId(), e.getScore(), e.getCreadaEn());
    }
}
