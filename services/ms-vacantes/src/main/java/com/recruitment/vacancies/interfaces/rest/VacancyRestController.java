package com.recruitment.vacancies.interfaces.rest;

import com.recruitment.vacancies.application.query.VacanteQueryService;
import com.recruitment.vacancies.domain.model.Vacante;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/vacancies")
public class VacancyRestController {
    private final VacanteQueryService queries;
    public VacancyRestController(VacanteQueryService queries) { this.queries = queries; }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "UP", "service", "ms-vacantes", "timestamp", Instant.now().toString());
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
}
