package com.recruitment.vacancies.infrastructure.persistence.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "preaprobaciones")
public class PreAprobacionJpaEntity {
    @Id private UUID id;
    @Column(name = "vacante_id", nullable = false) private UUID vacanteId;
    @Column(name = "postulacion_id", nullable = false) private UUID postulacionId;
    @Column(name = "candidato_id", nullable = false) private UUID candidatoId;
    @Column(name = "ranking_id", nullable = false) private UUID rankingId;
    @Column(nullable = false) private double score;
    @Column(name = "creada_en", nullable = false) private Instant creadaEn;
    public PreAprobacionJpaEntity() { }
    public UUID getId() { return id; }
    public void setId(UUID value) { id = value; }
    public UUID getVacanteId() { return vacanteId; }
    public void setVacanteId(UUID value) { vacanteId = value; }
    public UUID getPostulacionId() { return postulacionId; }
    public void setPostulacionId(UUID value) { postulacionId = value; }
    public UUID getCandidatoId() { return candidatoId; }
    public void setCandidatoId(UUID value) { candidatoId = value; }
    public UUID getRankingId() { return rankingId; }
    public void setRankingId(UUID value) { rankingId = value; }
    public double getScore() { return score; }
    public void setScore(double value) { score = value; }
    public Instant getCreadaEn() { return creadaEn; }
    public void setCreadaEn(Instant value) { creadaEn = value; }
}
