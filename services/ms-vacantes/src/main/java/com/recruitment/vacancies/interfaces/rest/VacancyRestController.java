package com.recruitment.vacancies.interfaces.rest;

import com.recruitment.vacancies.application.command.CrearVacanteCommand;
import com.recruitment.vacancies.application.query.VacanteQueryService;
import com.recruitment.vacancies.application.usecase.CrearVacanteUseCase;
import com.recruitment.vacancies.domain.model.Vacante;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/vacancies")
public class VacancyRestController {
    private final VacanteQueryService queries;
    private final CrearVacanteUseCase createVacancy;

    public VacancyRestController(VacanteQueryService queries, CrearVacanteUseCase createVacancy) {
        this.queries = queries;
        this.createVacancy = createVacancy;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "UP", "service", "ms-vacantes", "timestamp", Instant.now().toString());
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('SCOPE_vacancies:read','ROLE_RRHH')")
    public List<VacanteResponse> list(
            @RequestParam(required = false) UUID departamentoId,
            @RequestParam(defaultValue = "20") int limite) {
        return queries.findOpen(departamentoId, limite).stream().map(VacanteResponse::from).toList();
    }

    @PostMapping
    @PreAuthorize("hasAnyAuthority('SCOPE_vacancies:write','ROLE_RRHH')")
    public ResponseEntity<VacanteResponse> create(@Valid @RequestBody CrearVacanteRequest request) {
        Vacante created = createVacancy.execute(new CrearVacanteCommand(
                request.departamentoId(), request.titulo(), request.descripcion(), request.cupoTotal(),
                request.salarioPresupuestado(), request.moneda(), request.habilidadesRequeridas(),
                request.habilidadesPreferidas(), request.fechaCierre()));
        return ResponseEntity.created(URI.create("/api/v1/vacancies/" + created.id()))
                .body(VacanteResponse.from(created));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('SCOPE_vacancies:read','ROLE_RRHH')")
    public VacanteResponse get(@PathVariable UUID id) { return VacanteResponse.from(queries.get(id)); }

    public record VacanteResponse(UUID id, UUID departamentoId, String titulo, String descripcion,
                                  int cupoTotal, int cupoDisponible, String estado) {
        static VacanteResponse from(Vacante value) {
            return new VacanteResponse(value.id(), value.departamentoId(), value.titulo(), value.descripcion(),
                    value.cupo().total(), value.cupo().disponible(), value.estado().name());
        }
    }

    public record CrearVacanteRequest(
            @NotNull UUID departamentoId,
            @NotBlank String titulo,
            @NotBlank String descripcion,
            @Positive int cupoTotal,
            @DecimalMin("0") BigDecimal salarioPresupuestado,
            @NotBlank String moneda,
            List<String> habilidadesRequeridas,
            List<String> habilidadesPreferidas,
            Instant fechaCierre) { }
}
