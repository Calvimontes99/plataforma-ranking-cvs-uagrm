package com.recruitment.vacancies.infrastructure.persistence.entity;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "departamentos")
public class DepartamentoJpaEntity {
    @Id private UUID id;
    @Column(nullable = false, unique = true) private String codigo;
    @Column(nullable = false) private String nombre;
    @Column(nullable = false) private boolean activo;

    protected DepartamentoJpaEntity() { }

    public UUID getId() { return id; }
    public String getCodigo() { return codigo; }
    public String getNombre() { return nombre; }
    public boolean isActivo() { return activo; }
}
