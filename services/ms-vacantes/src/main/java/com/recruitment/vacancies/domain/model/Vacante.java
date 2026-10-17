package com.recruitment.vacancies.domain.model;

import com.recruitment.vacancies.domain.exception.ReglaDeNegocioException;
import com.recruitment.vacancies.domain.valueobject.CupoPresupuestario;
import com.recruitment.vacancies.domain.valueobject.EstadoVacante;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public final class Vacante {
    private final UUID id;
    private final UUID departamentoId;
    private final String titulo;
    private final String descripcion;
    private CupoPresupuestario cupo;
    private EstadoVacante estado;
    private final List<String> habilidadesRequeridas;
    private final List<String> habilidadesPreferidas;
    private final Instant fechaApertura;
    private final Instant fechaCierre;

    public Vacante(UUID id, UUID departamentoId, String titulo, String descripcion,
                   CupoPresupuestario cupo, EstadoVacante estado,
                   List<String> habilidadesRequeridas, List<String> habilidadesPreferidas,
                   Instant fechaApertura, Instant fechaCierre) {
        this.id = Objects.requireNonNull(id);
        this.departamentoId = Objects.requireNonNull(departamentoId);
        if (titulo == null || titulo.isBlank() || descripcion == null || descripcion.isBlank()) {
            throw new IllegalArgumentException("Título y descripción son requeridos");
        }
        this.titulo = titulo.trim();
        this.descripcion = descripcion.trim();
        this.cupo = Objects.requireNonNull(cupo);
        this.estado = Objects.requireNonNull(estado);
        this.habilidadesRequeridas = List.copyOf(habilidadesRequeridas == null ? List.of() : habilidadesRequeridas);
        this.habilidadesPreferidas = List.copyOf(habilidadesPreferidas == null ? List.of() : habilidadesPreferidas);
        this.fechaApertura = fechaApertura;
        this.fechaCierre = fechaCierre;
    }

    public void adjudicar() {
        if (cupo.disponible() == 0) {
            throw new com.recruitment.vacancies.domain.exception.CupoAgotadoException(
                    "La vacante no tiene cupos disponibles");
        }
        if (estado != EstadoVacante.ABIERTA) {
            throw new ReglaDeNegocioException("Solo se puede adjudicar una vacante abierta");
        }
        cupo = cupo.descontarUno();
        if (cupo.disponible() == 0) {
            estado = EstadoVacante.CUBIERTA;
        }
    }

    public UUID id() { return id; }
    public UUID departamentoId() { return departamentoId; }
    public String titulo() { return titulo; }
    public String descripcion() { return descripcion; }
    public CupoPresupuestario cupo() { return cupo; }
    public EstadoVacante estado() { return estado; }
    public List<String> habilidadesRequeridas() { return habilidadesRequeridas; }
    public List<String> habilidadesPreferidas() { return habilidadesPreferidas; }
    public Instant fechaApertura() { return fechaApertura; }
    public Instant fechaCierre() { return fechaCierre; }
}
