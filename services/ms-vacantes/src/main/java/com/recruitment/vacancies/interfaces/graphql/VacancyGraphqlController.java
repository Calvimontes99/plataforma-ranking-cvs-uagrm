package com.recruitment.vacancies.interfaces.graphql;

import com.recruitment.vacancies.application.command.*;
import com.recruitment.vacancies.application.query.VacanteQueryService;
import com.recruitment.vacancies.application.usecase.*;
import com.recruitment.vacancies.domain.model.PreAprobacion;
import com.recruitment.vacancies.domain.model.Vacante;
import com.recruitment.vacancies.domain.valueobject.EstadoVacante;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.graphql.data.method.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Controller
public class VacancyGraphqlController {
    private static final Map<String, String> DEMO_NAMES = Map.of(
            "000000000001", "Ana Sofía Vargas", "000000000002", "Luis Fernando Rojas",
            "000000000003", "Camila Andrea Flores", "000000000004", "Diego Alejandro Quispe",
            "000000000005", "Valeria Paz Mendoza", "000000000006", "Jorge Nicolás Salazar",
            "000000000007", "Mariana Belén Choque", "000000000008", "Pablo Andrés Céspedes");
    private static final Map<String, BigDecimal> DEMO_SALARIES = Map.of(
            "000000000001", new BigDecimal("12000"), "000000000002", new BigDecimal("10500"),
            "000000000003", new BigDecimal("9000"), "000000000004", new BigDecimal("12000"),
            "000000000005", new BigDecimal("11000"), "000000000006", new BigDecimal("10800"),
            "000000000007", new BigDecimal("8000"), "000000000008", new BigDecimal("6000"));
    private static final List<String> BULK_FIRST_NAMES = List.of(
            "Sofía", "Mateo", "Valentina", "Sebastián", "Lucía", "Nicolás",
            "Camila", "Gabriel", "Daniela", "Alejandro", "Mariana", "Diego");
    private static final List<String> BULK_LAST_NAMES = List.of(
            "Rivera", "Mendoza", "Vargas", "Rojas", "Salazar", "Flores");
    public record VacancyView(UUID id, UUID departamentoId, String titulo, String descripcion,
                              int cupoTotal, int cupoDisponible, BigDecimal salarioPresupuestado,
                              String moneda, EstadoVacante estado, List<String> habilidadesRequeridas,
                              List<String> habilidadesPreferidas, Instant fechaApertura, Instant fechaCierre) {
        static VacancyView from(Vacante v) {
            return new VacancyView(v.id(), v.departamentoId(), v.titulo(), v.descripcion(), v.cupo().total(),
                    v.cupo().disponible(), v.cupo().salario(), v.cupo().moneda().getCurrencyCode(), v.estado(),
                    v.habilidadesRequeridas(), v.habilidadesPreferidas(), v.fechaApertura(), v.fechaCierre());
        }
    }

    public record CrearVacanteInput(@NotNull UUID departamentoId, @NotBlank String titulo,
                                    @NotBlank String descripcion, @Positive int cupoTotal,
                                    @DecimalMin("0") BigDecimal salarioPresupuestado, @NotBlank String moneda,
                                    List<String> habilidadesRequeridas, List<String> habilidadesPreferidas,
                                    Instant fechaCierre) { }
    public record RegistrarPreAprobacionInput(@NotNull UUID vacanteId, @NotNull UUID postulacionId,
                                               @NotNull UUID candidatoId, @NotNull UUID rankingId,
                                               @DecimalMin("0") @DecimalMax("100") double score) { }
    public record AdjudicarVacanteInput(@NotNull UUID sagaId, @NotNull UUID vacanteId,
                                        @NotNull UUID postulacionId, @NotNull UUID candidatoId,
                                        @NotBlank String terminos) { }

    private final VacanteQueryService queries;
    private final CrearVacanteUseCase crear;
    private final RegistrarPreAprobacionUseCase preaprobar;
    private final AdjudicarVacanteSagaStep3UseCase adjudicar;

    public VacancyGraphqlController(VacanteQueryService queries, CrearVacanteUseCase crear,
                                    RegistrarPreAprobacionUseCase preaprobar,
                                    AdjudicarVacanteSagaStep3UseCase adjudicar) {
        this.queries = queries; this.crear = crear; this.preaprobar = preaprobar; this.adjudicar = adjudicar;
    }

    @QueryMapping @PreAuthorize("hasAnyAuthority('SCOPE_vacancies:read','ROLE_RRHH')")
    public VacancyView vacante(@Argument UUID id) { return VacancyView.from(queries.get(id)); }

    @QueryMapping @PreAuthorize("hasAnyAuthority('SCOPE_vacancies:read','ROLE_RRHH')")
    public List<VacancyView> vacantesAbiertas(@Argument UUID departamentoId, @Argument Integer limite) {
        return queries.findOpen(departamentoId, limite == null ? 20 : limite).stream().map(VacancyView::from).toList();
    }

    @QueryMapping @PreAuthorize("hasAnyAuthority('SCOPE_vacancies:read','ROLE_RRHH')")
    public List<PreAprobacion> postulantesPreaprobados(@Argument UUID vacanteId) {
        return queries.findPreapprovals(vacanteId);
    }

    @SchemaMapping(typeName = "PreAprobacion", field = "nombreCompleto")
    public String nombreCompleto(PreAprobacion item) {
        String suffix = item.candidatoId().toString().substring(24);
        String knownName = DEMO_NAMES.get(suffix);
        if (knownName != null) return knownName;
        try {
            long number = Long.parseLong(suffix);
            if (number >= 9 && number <= 80) {
                int offset = (int) number - 9;
                return BULK_FIRST_NAMES.get(offset % BULK_FIRST_NAMES.size()) + " "
                        + BULK_LAST_NAMES.get((offset / BULK_FIRST_NAMES.size()) % BULK_LAST_NAMES.size());
            }
        } catch (NumberFormatException ignored) {
            // Non-demo candidate IDs use the generic fallback below.
        }
        return "Candidato " + item.candidatoId().toString().substring(0, 8);
    }

    @SchemaMapping(typeName = "PreAprobacion", field = "puntajeRanking")
    public double puntajeRanking(PreAprobacion item) { return item.score(); }

    @SchemaMapping(typeName = "PreAprobacion", field = "pretensionSalarial")
    public BigDecimal pretensionSalarial(PreAprobacion item) {
        String suffix = item.candidatoId().toString().substring(24);
        BigDecimal knownSalary = DEMO_SALARIES.get(suffix);
        if (knownSalary != null) return knownSalary;
        try {
            long number = Long.parseLong(suffix);
            if (number >= 9 && number <= 80) return BigDecimal.valueOf(6000 + ((number * 137) % 9000));
        } catch (NumberFormatException ignored) {
            // No salary snapshot exists for non-demo candidates.
        }
        return null;
    }

    @MutationMapping @PreAuthorize("hasAnyAuthority('SCOPE_vacancies:write','ROLE_RRHH')")
    public VacancyView crearVacante(@Argument @Valid CrearVacanteInput input) {
        return VacancyView.from(crear.execute(new CrearVacanteCommand(input.departamentoId(), input.titulo(),
                input.descripcion(), input.cupoTotal(), input.salarioPresupuestado(), input.moneda(),
                input.habilidadesRequeridas(), input.habilidadesPreferidas(), input.fechaCierre())));
    }

    @MutationMapping @PreAuthorize("hasAnyAuthority('SCOPE_vacancies:write','ROLE_RRHH')")
    public PreAprobacion registrarPreAprobacion(@Argument @Valid RegistrarPreAprobacionInput input) {
        return preaprobar.execute(new RegistrarPreAprobacionCommand(input.vacanteId(), input.postulacionId(),
                input.candidatoId(), input.rankingId(), input.score()));
    }

    @MutationMapping @PreAuthorize("hasAnyAuthority('SCOPE_vacancies:write','ROLE_RRHH')")
    public AdjudicarVacanteSagaStep3UseCase.Result adjudicarVacante(@Argument @Valid AdjudicarVacanteInput input) {
        return adjudicar.execute(new AdjudicarVacanteCommand(input.sagaId(), input.vacanteId(),
                input.postulacionId(), input.candidatoId(), input.terminos()));
    }
}
