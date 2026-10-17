package com.recruitment.vacancies.application.query;

import com.recruitment.vacancies.domain.exception.EntidadNoEncontradaException;
import com.recruitment.vacancies.domain.model.PreAprobacion;
import com.recruitment.vacancies.domain.model.Vacante;
import com.recruitment.vacancies.domain.repository.PreAprobacionRepository;
import com.recruitment.vacancies.domain.repository.VacanteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class VacanteQueryService {
    private final VacanteRepository vacantes;
    private final PreAprobacionRepository preAprobaciones;

    public VacanteQueryService(VacanteRepository vacantes, PreAprobacionRepository preAprobaciones) {
        this.vacantes = vacantes;
        this.preAprobaciones = preAprobaciones;
    }

    public Vacante get(UUID id) {
        return vacantes.findById(id).orElseThrow(() -> new EntidadNoEncontradaException("Vacante no encontrada"));
    }

    public List<Vacante> findOpen(UUID departamentoId, int limit) {
        return vacantes.findOpen(departamentoId, Math.max(1, Math.min(limit, 100)));
    }

    public List<PreAprobacion> findPreapprovals(UUID vacanteId) {
        return preAprobaciones.findByVacanteId(vacanteId);
    }
}
