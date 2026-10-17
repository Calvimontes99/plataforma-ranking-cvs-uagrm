package com.recruitment.vacancies.infrastructure.persistence.adapter;

import com.recruitment.vacancies.domain.model.EtapaSeleccion;
import com.recruitment.vacancies.domain.repository.EtapaSeleccionRepository;
import com.recruitment.vacancies.infrastructure.persistence.entity.EtapaSeleccionJpaEntity;
import com.recruitment.vacancies.infrastructure.persistence.repository.SpringDataEtapaSeleccionRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
public class EtapaSeleccionPersistenceAdapter implements EtapaSeleccionRepository {
    private final SpringDataEtapaSeleccionRepository repository;
    public EtapaSeleccionPersistenceAdapter(SpringDataEtapaSeleccionRepository repository) { this.repository = repository; }
    @Override public EtapaSeleccion save(EtapaSeleccion value) {
        var entity = new EtapaSeleccionJpaEntity();
        entity.setId(value.id()); entity.setVacanteId(value.vacanteId()); entity.setNombre(value.nombre());
        entity.setOrden(value.orden()); entity.setObligatoria(value.obligatoria());
        return toDomain(repository.save(entity));
    }
    @Override public List<EtapaSeleccion> findByVacanteId(UUID id) {
        return repository.findByVacanteIdOrderByOrden(id).stream().map(this::toDomain).toList();
    }
    private EtapaSeleccion toDomain(EtapaSeleccionJpaEntity entity) {
        return new EtapaSeleccion(entity.getId(), entity.getVacanteId(), entity.getNombre(),
                entity.getOrden(), entity.isObligatoria());
    }
}
