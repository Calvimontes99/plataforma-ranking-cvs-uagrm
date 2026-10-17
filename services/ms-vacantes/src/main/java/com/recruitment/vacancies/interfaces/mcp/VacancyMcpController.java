package com.recruitment.vacancies.interfaces.mcp;

import com.recruitment.vacancies.application.query.VacanteQueryService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@RestController
@RequestMapping("/mcp")
@PreAuthorize("hasAnyAuthority('SCOPE_mcp:execute','ROLE_AI_AGENT','ROLE_RRHH')")
public class VacancyMcpController {
    private final VacanteQueryService queries;
    public VacancyMcpController(VacanteQueryService queries) { this.queries = queries; }

    @GetMapping("/tools")
    public Map<String, Object> tools() {
        return Map.of("tools", List.of(
                tool("diagnosticar_vacantes_criticas",
                        "Lista vacantes abiertas por más de 15 días, con cupo crítico o cierre próximo",
                        Map.of("type", "object", "properties", Map.of("limite", Map.of("type", "integer", "minimum", 1, "maximum", 100)))),
                tool("obtener_cupos_vacante", "Obtiene los cupos totales y disponibles de una vacante",
                        Map.of("type", "object", "properties", Map.of("vacanteId", Map.of("type", "string", "format", "uuid")),
                                "required", List.of("vacanteId")))));
    }

    @PostMapping("/execute")
    public Map<String, Object> execute(@RequestBody @Valid ExecuteRequest request) {
        Map<String, Object> result = switch (request.name()) {
            case "diagnosticar_vacantes_criticas" -> critical(request.arguments());
            case "obtener_cupos_vacante" -> slots(request.arguments());
            default -> throw new IllegalArgumentException("Tool MCP no soportada: " + request.name());
        };
        return Map.of("content", List.of(Map.of("type", "json", "json", result)), "isError", false);
    }

    private Map<String, Object> critical(Map<String, Object> arguments) {
        int limit = arguments.get("limite") instanceof Number number ? number.intValue() : 20;
        Instant closingThreshold = Instant.now().plus(7, ChronoUnit.DAYS);
        Instant staleThreshold = Instant.now().minus(15, ChronoUnit.DAYS);
        var items = queries.findOpen(null, limit).stream()
                .filter(v -> v.cupo().disponible() <= 1
                        || (v.fechaCierre() != null && !v.fechaCierre().isAfter(closingThreshold))
                        || (v.fechaApertura() != null && v.fechaApertura().isBefore(staleThreshold)))
                .map(v -> Map.<String, Object>of("vacanteId", v.id().toString(), "titulo", v.titulo(),
                        "cuposDisponibles", v.cupo().disponible(),
                        "requiredSkills", v.habilidadesRequeridas(),
                        "preferredSkills", v.habilidadesPreferidas(),
                        "fechaCierre",
                        v.fechaCierre() == null ? "sin fecha" : v.fechaCierre().toString()))
                .toList();
        return Map.of("vacantesCriticas", items, "total", items.size());
    }

    private Map<String, Object> slots(Map<String, Object> arguments) {
        Object raw = arguments.get("vacanteId");
        if (!(raw instanceof String value)) throw new IllegalArgumentException("vacanteId es requerido");
        var vacancy = queries.get(UUID.fromString(value));
        return Map.of("vacanteId", value, "titulo", vacancy.titulo(),
                "requiredSkills", vacancy.habilidadesRequeridas(),
                "preferredSkills", vacancy.habilidadesPreferidas(),
                "cupoTotal", vacancy.cupo().total(),
                "cupoDisponible", vacancy.cupo().disponible(), "estado", vacancy.estado().name());
    }

    private Map<String, Object> tool(String name, String description, Map<String, Object> schema) {
        return Map.of("name", name, "description", description, "inputSchema", schema);
    }

    public record ExecuteRequest(@NotBlank String name, Map<String, Object> arguments) {
        public ExecuteRequest {
            arguments = arguments == null ? Map.of() : Map.copyOf(arguments);
        }
    }
}
