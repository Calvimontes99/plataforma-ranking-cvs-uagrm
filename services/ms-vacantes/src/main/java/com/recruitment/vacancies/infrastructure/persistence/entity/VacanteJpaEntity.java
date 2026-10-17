package com.recruitment.vacancies.infrastructure.persistence.entity;

import com.recruitment.vacancies.domain.valueobject.EstadoVacante;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "vacantes")
public class VacanteJpaEntity {
    @Id private UUID id;
    @Column(name = "departamento_id", nullable = false) private UUID departamentoId;
    @Column(nullable = false) private String titulo;
    @Column(nullable = false, columnDefinition = "text") private String descripcion;
    @Column(name = "cupo_total", nullable = false) private int cupoTotal;
    @Column(name = "cupo_disponible", nullable = false) private int cupoDisponible;
    @Column(name = "salario_presupuestado", nullable = false) private BigDecimal salarioPresupuestado;
    @Column(nullable = false, length = 3) private String moneda;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private EstadoVacante estado;
    @Column(name = "fecha_apertura") private Instant fechaApertura;
    @Column(name = "fecha_cierre") private Instant fechaCierre;
    @Version private long version;

    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "vacante_habilidades_requeridas", joinColumns = @JoinColumn(name = "vacante_id"))
    @Column(name = "habilidad")
    private Set<String> habilidadesRequeridas = new LinkedHashSet<>();

    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "vacante_habilidades_preferidas", joinColumns = @JoinColumn(name = "vacante_id"))
    @Column(name = "habilidad")
    private Set<String> habilidadesPreferidas = new LinkedHashSet<>();

    public VacanteJpaEntity() { }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getDepartamentoId() { return departamentoId; }
    public void setDepartamentoId(UUID value) { departamentoId = value; }
    public String getTitulo() { return titulo; }
    public void setTitulo(String value) { titulo = value; }
    public String getDescripcion() { return descripcion; }
    public void setDescripcion(String value) { descripcion = value; }
    public int getCupoTotal() { return cupoTotal; }
    public void setCupoTotal(int value) { cupoTotal = value; }
    public int getCupoDisponible() { return cupoDisponible; }
    public void setCupoDisponible(int value) { cupoDisponible = value; }
    public BigDecimal getSalarioPresupuestado() { return salarioPresupuestado; }
    public void setSalarioPresupuestado(BigDecimal value) { salarioPresupuestado = value; }
    public String getMoneda() { return moneda; }
    public void setMoneda(String value) { moneda = value; }
    public EstadoVacante getEstado() { return estado; }
    public void setEstado(EstadoVacante value) { estado = value; }
    public Instant getFechaApertura() { return fechaApertura; }
    public void setFechaApertura(Instant value) { fechaApertura = value; }
    public Instant getFechaCierre() { return fechaCierre; }
    public void setFechaCierre(Instant value) { fechaCierre = value; }
    public Set<String> getHabilidadesRequeridas() { return habilidadesRequeridas; }
    public Set<String> getHabilidadesPreferidas() { return habilidadesPreferidas; }
}
