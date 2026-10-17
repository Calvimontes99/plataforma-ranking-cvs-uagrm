package com.recruitment.vacancies.infrastructure.persistence.adapter;

import com.recruitment.vacancies.domain.model.Departamento;
import com.recruitment.vacancies.domain.repository.DepartamentoRepository;
import com.recruitment.vacancies.infrastructure.persistence.repository.SpringDataDepartamentoRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.UUID;

@Repository
public class DepartamentoPersistenceAdapter implements DepartamentoRepository {
    private final SpringDataDepartamentoRepository repository;
    public DepartamentoPersistenceAdapter(SpringDataDepartamentoRepository repository) { this.repository = repository; }
    @Override public Optional<Departamento> findById(UUID id) {
        return repository.findById(id).map(e -> new Departamento(e.getId(), e.getCodigo(), e.getNombre(), e.isActivo()));
    }
}
