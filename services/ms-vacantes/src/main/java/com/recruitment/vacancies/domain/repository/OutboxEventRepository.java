package com.recruitment.vacancies.domain.repository;

import com.recruitment.vacancies.domain.model.OutboxEvent;
import java.util.List;

public interface OutboxEventRepository {
    OutboxEvent save(OutboxEvent event);
    List<OutboxEvent> findPublishable(int limit);
}
