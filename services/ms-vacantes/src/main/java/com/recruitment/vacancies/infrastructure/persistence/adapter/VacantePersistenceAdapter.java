package com.recruitment.vacancies.infrastructure.persistence.adapter;

import com.recruitment.vacancies.domain.model.Vacante;
import com.recruitment.vacancies.domain.repository.VacanteRepository;
import com.recruitment.vacancies.domain.valueobject.CupoPresupuestario;
import com.recruitment.vacancies.domain.valueobject.EstadoVacante;
import com.recruitment.vacancies.infrastructure.persistence.entity.VacanteJpaEntity;
import com.recruitment.vacancies.infrastructure.persistence.repository.SpringDataVacanteRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Repository;

import java.util.Currency;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class VacantePersistenceAdapter implements VacanteRepository {
    private final SpringDataVacanteRepository repository;

    public VacantePersistenceAdapter(SpringDataVacanteRepository repository) {
        this.repository = repository;
    }

    @Override
    public Vacante save(Vacante domain) {
        VacanteJpaEntity entity = repository.findById(domain.id()).orElseGet(VacanteJpaEntity::new);
        copy(domain, entity);
        return toDomain(repository.save(entity));
    }

    @Override
    public Optional<Vacante> findById(UUID id) {
        return repository.findById(id).map(this::toDomain);
    }

    @Override
    public Optional<Vacante> findByIdForUpdate(UUID id) {
        return repository.findByIdForUpdate(id).map(this::toDomain);
    }

    @Override
    public List<Vacante> findOpen(UUID departamentoId, int limit) {
        var page = PageRequest.of(0, limit);
        var entities = departamentoId == null
                ? repository.findByEstadoOrderByFechaAperturaDesc(EstadoVacante.ABIERTA, page)
                : repository.findByEstadoAndDepartamentoIdOrderByFechaAperturaDesc(
                        EstadoVacante.ABIERTA, departamentoId, page);
        return entities.stream().map(this::toDomain).toList();
    }

    private void copy(Vacante source, VacanteJpaEntity target) {
        target.setId(source.id());
        target.setDepartamentoId(source.departamentoId());
        target.setTitulo(source.titulo());
        target.setDescripcion(source.descripcion());
        target.setCupoTotal(source.cupo().total());
        target.setCupoDisponible(source.cupo().disponible());
        target.setSalarioPresupuestado(source.cupo().salario());
        target.setMoneda(source.cupo().moneda().getCurrencyCode());
        target.setEstado(source.estado());
        target.setFechaApertura(source.fechaApertura());
        target.setFechaCierre(source.fechaCierre());
        target.getHabilidadesRequeridas().clear();
        target.getHabilidadesRequeridas().addAll(source.habilidadesRequeridas());
        target.getHabilidadesPreferidas().clear();
        target.getHabilidadesPreferidas().addAll(source.habilidadesPreferidas());
    }

    private Vacante toDomain(VacanteJpaEntity entity) {
        return new Vacante(entity.getId(), entity.getDepartamentoId(), entity.getTitulo(), entity.getDescripcion(),
                new CupoPresupuestario(entity.getCupoTotal(), entity.getCupoDisponible(),
                        entity.getSalarioPresupuestado(), Currency.getInstance(entity.getMoneda())),
                entity.getEstado(), List.copyOf(entity.getHabilidadesRequeridas()),
                List.copyOf(entity.getHabilidadesPreferidas()), entity.getFechaApertura(), entity.getFechaCierre());
    }
}
