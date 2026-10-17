package com.recruitment.vacancies.infrastructure.grpc;

import com.google.protobuf.Empty;
import com.google.protobuf.Timestamp;
import com.google.protobuf.util.JsonFormat;
import com.recruitment.platform.grpc.v1.*;
import com.recruitment.vacancies.application.command.AdjudicarVacanteCommand;
import com.recruitment.vacancies.application.command.RegistrarPreAprobacionCommand;
import com.recruitment.vacancies.application.query.VacanteQueryService;
import com.recruitment.vacancies.application.usecase.AdjudicarVacanteSagaStep3UseCase;
import com.recruitment.vacancies.application.usecase.RegistrarPreAprobacionUseCase;
import com.recruitment.vacancies.domain.exception.CupoAgotadoException;
import com.recruitment.vacancies.domain.exception.EntidadNoEncontradaException;
import com.recruitment.vacancies.domain.model.PreAprobacion;
import com.recruitment.vacancies.domain.model.Vacante;
import io.grpc.Status;
import io.grpc.stub.StreamObserver;
import net.devh.boot.grpc.server.service.GrpcService;

import java.time.Instant;
import java.util.UUID;

@GrpcService
public class VacancyServiceGrpcImpl extends VacancyServiceGrpc.VacancyServiceImplBase {
    private final VacanteQueryService queries;
    private final RegistrarPreAprobacionUseCase preapprove;
    private final AdjudicarVacanteSagaStep3UseCase adjudicate;

    public VacancyServiceGrpcImpl(VacanteQueryService queries, RegistrarPreAprobacionUseCase preapprove,
                                  AdjudicarVacanteSagaStep3UseCase adjudicate) {
        this.queries = queries; this.preapprove = preapprove; this.adjudicate = adjudicate;
    }

    @Override
    public void getVacancy(GetVacancyRequest request, StreamObserver<com.recruitment.platform.grpc.v1.Vacancy> observer) {
        unary(observer, () -> toProto(queries.get(UUID.fromString(request.getVacancyId()))));
    }

    @Override
    public void listOpenVacancies(ListOpenVacanciesRequest request, StreamObserver<ListOpenVacanciesResponse> observer) {
        unary(observer, () -> {
            UUID departmentId = request.getDepartmentId().isBlank() ? null : UUID.fromString(request.getDepartmentId());
            int limit = request.hasPage() && request.getPage().getPageSize() > 0 ? request.getPage().getPageSize() : 20;
            return ListOpenVacanciesResponse.newBuilder()
                    .addAllVacancies(queries.findOpen(departmentId, limit).stream().map(this::toProto).toList()).build();
        });
    }

    @Override
    public void preapproveCandidate(PreapproveCandidateRequest request, StreamObserver<PreapproveCandidateResponse> observer) {
        unary(observer, () -> {
            PreAprobacion item = preapprove.execute(new RegistrarPreAprobacionCommand(
                    UUID.fromString(request.getVacancyId()), UUID.fromString(request.getApplicationId()),
                    UUID.fromString(request.getCandidateId()), UUID.fromString(request.getRankingId()), request.getScore()));
            return PreapproveCandidateResponse.newBuilder().setPreapprovalId(item.id().toString())
                    .setStatus(ApplicationStatus.APPLICATION_STATUS_PREAPPROVED)
                    .setCreatedAt(timestamp(item.creadaEn())).build();
        });
    }

    @Override
    public void createContract(CreateContractRequest request, StreamObserver<CreateContractResponse> observer) {
        try {
            var result = adjudicate.execute(new AdjudicarVacanteCommand(UUID.fromString(request.getSagaId()),
                    UUID.fromString(request.getVacancyId()), UUID.fromString(request.getApplicationId()),
                    UUID.fromString(request.getCandidateId()), JsonFormat.printer().print(request.getContractTerms())));
            observer.onNext(CreateContractResponse.newBuilder().setSagaId(result.sagaId().toString())
                    .setContractId(result.contratoId().toString()).setRemainingSlots(result.cuposRestantes())
                    .setStatus(SagaStepStatus.SAGA_STEP_STATUS_COMPLETED).setCreatedAt(timestamp(Instant.now())).build());
            observer.onCompleted();
        } catch (CupoAgotadoException exception) {
            observer.onNext(CreateContractResponse.newBuilder().setSagaId(request.getSagaId())
                    .setStatus(SagaStepStatus.SAGA_STEP_STATUS_REJECTED)
                    .addErrors(ErrorDetail.newBuilder().setCode("NO_AVAILABLE_SLOTS").setMessage(exception.getMessage()))
                    .setCreatedAt(timestamp(Instant.now())).build());
            observer.onCompleted();
        } catch (Exception exception) {
            observer.onError(toStatus(exception).asRuntimeException());
        }
    }

    @Override
    public void health(Empty request, StreamObserver<HealthResponse> observer) {
        observer.onNext(HealthResponse.newBuilder().setService("ms-vacantes").setStatus("UP")
                .setVersion("1.0.0").setCheckedAt(timestamp(Instant.now())).build());
        observer.onCompleted();
    }

    private com.recruitment.platform.grpc.v1.Vacancy toProto(Vacante value) {
        var builder = com.recruitment.platform.grpc.v1.Vacancy.newBuilder()
                .setVacancyId(value.id().toString()).setDepartmentId(value.departamentoId().toString())
                .setTitle(value.titulo()).setDescription(value.descripcion())
                .setTotalSlots(value.cupo().total()).setAvailableSlots(value.cupo().disponible())
                .setStatus(switch (value.estado()) {
                    case BORRADOR -> VacancyStatus.VACANCY_STATUS_DRAFT;
                    case ABIERTA -> VacancyStatus.VACANCY_STATUS_OPEN;
                    case PAUSADA -> VacancyStatus.VACANCY_STATUS_PAUSED;
                    case CUBIERTA -> VacancyStatus.VACANCY_STATUS_FILLED;
                    case CERRADA -> VacancyStatus.VACANCY_STATUS_CLOSED;
                }).addAllPreferredSkills(value.habilidadesPreferidas());
        value.habilidadesRequeridas().forEach(skill -> builder.addRequiredSkills(
                Skill.newBuilder().setName(skill).build()));
        if (value.fechaApertura() != null) builder.setOpenedAt(timestamp(value.fechaApertura()));
        if (value.fechaCierre() != null) builder.setClosesAt(timestamp(value.fechaCierre()));
        return builder.build();
    }

    private Timestamp timestamp(Instant value) {
        return Timestamp.newBuilder().setSeconds(value.getEpochSecond()).setNanos(value.getNano()).build();
    }

    private <T> void unary(StreamObserver<T> observer, java.util.concurrent.Callable<T> action) {
        try { observer.onNext(action.call()); observer.onCompleted(); }
        catch (Exception exception) { observer.onError(toStatus(exception).asRuntimeException()); }
    }

    private Status toStatus(Exception exception) {
        if (exception instanceof EntidadNoEncontradaException) return Status.NOT_FOUND.withDescription(exception.getMessage());
        if (exception instanceof IllegalArgumentException) return Status.INVALID_ARGUMENT.withDescription(exception.getMessage());
        return Status.INTERNAL.withDescription(exception.getMessage()).withCause(exception);
    }
}
