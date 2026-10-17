package com.recruitment.vacancies.infrastructure.persistence.entity;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "etapas_seleccion")
public class EtapaSeleccionJpaEntity {
    @Id private UUID id;
    @Column(name = "vacante_id", nullable = false) private UUID vacanteId;
    @Column(nullable = false) private String nombre;
    @Column(nullable = false) private int orden;
    @Column(nullable = false) private boolean obligatoria;
    public EtapaSeleccionJpaEntity() { }
    public UUID getId() { return id; }
    public void setId(UUID value) { id = value; }
    public UUID getVacanteId() { return vacanteId; }
    public void setVacanteId(UUID value) { vacanteId = value; }
    public String getNombre() { return nombre; }
    public void setNombre(String value) { nombre = value; }
    public int getOrden() { return orden; }
    public void setOrden(int value) { orden = value; }
    public boolean isObligatoria() { return obligatoria; }
    public void setObligatoria(boolean value) { obligatoria = value; }
}
