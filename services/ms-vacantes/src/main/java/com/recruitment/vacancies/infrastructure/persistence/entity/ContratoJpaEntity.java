package com.recruitment.vacancies.infrastructure.persistence.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "contratos")
public class ContratoJpaEntity {
    @Id private UUID id;
    @Column(name = "saga_id", nullable = false, unique = true) private UUID sagaId;
    @Column(name = "vacante_id", nullable = false) private UUID vacanteId;
    @Column(name = "postulacion_id", nullable = false) private UUID postulacionId;
    @Column(name = "candidato_id", nullable = false) private UUID candidatoId;
    @Column(nullable = false, columnDefinition = "text") private String terminos;
    @Column(name = "creado_en", nullable = false) private Instant creadoEn;
    public ContratoJpaEntity() { }
    public UUID getId() { return id; }
    public void setId(UUID value) { id = value; }
    public UUID getSagaId() { return sagaId; }
    public void setSagaId(UUID value) { sagaId = value; }
    public UUID getVacanteId() { return vacanteId; }
    public void setVacanteId(UUID value) { vacanteId = value; }
    public UUID getPostulacionId() { return postulacionId; }
    public void setPostulacionId(UUID value) { postulacionId = value; }
    public UUID getCandidatoId() { return candidatoId; }
    public void setCandidatoId(UUID value) { candidatoId = value; }
    public String getTerminos() { return terminos; }
    public void setTerminos(String value) { terminos = value; }
    public Instant getCreadoEn() { return creadoEn; }
    public void setCreadoEn(Instant value) { creadoEn = value; }
}
