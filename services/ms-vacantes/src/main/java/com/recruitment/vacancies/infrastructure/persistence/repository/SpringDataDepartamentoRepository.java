package com.recruitment.vacancies.infrastructure.persistence.repository;
import com.recruitment.vacancies.infrastructure.persistence.entity.DepartamentoJpaEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
public interface SpringDataDepartamentoRepository extends JpaRepository<DepartamentoJpaEntity, UUID> { }
