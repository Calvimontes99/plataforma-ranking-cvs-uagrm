package com.recruitment.vacancies;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
public class VacanciesApplication {
    public static void main(String[] args) {
        SpringApplication.run(VacanciesApplication.class, args);
    }
}
