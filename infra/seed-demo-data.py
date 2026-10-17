#!/usr/bin/env python3
"""Seed idempotente del escenario de defensa. Solo usa Python stdlib y Docker Compose."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

INFRA = Path(__file__).resolve().parent
COMPOSE = ["docker", "compose", "-f", str(INFRA / "docker-compose.yml")]
GATEWAY = os.getenv("DEMO_GATEWAY_URL", "http://localhost:8080").rstrip("/")
DYNAMO = os.getenv("DEMO_DYNAMODB_URL", "http://localhost:8000").rstrip("/")

VACANCIES = [
    ("11111111-1111-4111-8111-111111111101", "Ingeniero de Sistemas Senior", 3, 2, 12000, -4,
     ["Java 21", "Spring Boot", "PostgreSQL", "Arquitectura DDD"]),
    ("11111111-1111-4111-8111-111111111102", "Arquitecto Cloud & IA", 1, 0, 15000, -8,
     ["AWS", "Kubernetes", "Python", "Inteligencia Artificial"]),
    ("11111111-1111-4111-8111-111111111103", "Especialista DevSecOps", 2, 2, 11500, -21,
     ["DevSecOps", "Terraform", "Kubernetes", "OWASP"]),
]

CANDIDATES = [
    ("Ana Sofía Vargas", "ana.vargas@example.com", "+591 70101001", 1, 95, 12000, ["Java 21", "Spring Boot", "PostgreSQL"]),
    ("Luis Fernando Rojas", "luis.rojas@example.com", "+591 70101002", 1, 89, 10500, ["Java", "DDD", "RabbitMQ"]),
    ("Camila Andrea Flores", "camila.flores@example.com", "+591 70101003", 1, 82, 9000, ["Spring Boot", "GraphQL", "PostgreSQL"]),
    ("Diego Alejandro Quispe", "diego.quispe@example.com", "+591 70101004", 2, 93, 12000, ["AWS", "Kubernetes", "Python", "LLM"]),
    ("Valeria Paz Mendoza", "valeria.mendoza@example.com", "+591 70101005", 2, 86, 11000, ["Azure", "MLOps", "Terraform"]),
    ("Jorge Nicolás Salazar", "jorge.salazar@example.com", "+591 70101006", 3, 91, 10800, ["DevSecOps", "OWASP", "Kubernetes"]),
    ("Mariana Belén Choque", "mariana.choque@example.com", "+591 70101007", 3, 78, 8000, ["SAST", "Docker", "GitHub Actions"]),
    ("Pablo Andrés Céspedes", "pablo.cespedes@example.com", "+591 70101008", 3, 65, 6000, ["Linux", "CI/CD", "Docker"]),
]


def run(args: list[str], *, stdin: str | None = None) -> None:
    subprocess.run(args, cwd=INFRA, input=stdin.encode("utf-8") if stdin is not None else None, check=True)


def wait_for_stack(timeout: int = 240) -> None:
    print("[1/5] Esperando al API Gateway y a los servicios...")
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{GATEWAY}/health", timeout=3) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(3)
    raise RuntimeError("El stack no quedó listo. Revise: docker compose -f infra/docker-compose.yml ps")


def seed_postgres() -> None:
    print("[2/5] Sembrando vacantes y preaprobaciones en PostgreSQL...")
    vacancy_values = []
    skills_values = []
    preapprovals = []
    for vacancy_id, title, total, available, salary, age_days, skills in VACANCIES:
        description = {
            1: "Liderazgo técnico de plataformas empresariales, microservicios y equipos ágiles.",
            2: "Diseño de plataformas cloud-native y soluciones responsables de inteligencia artificial.",
            3: "Automatización de seguridad, observabilidad y controles shift-left para CI/CD.",
        }[len(vacancy_values) + 1]
        vacancy_values.append(
            f"('{vacancy_id}','00000000-0000-0000-0000-000000000001',$${title}$$,$${description}$$,"
            f"{total},{available},{salary},'BOB','ABIERTA',now()+interval '{age_days} days',now()+interval '45 days',0)"
        )
        skills_values.extend(f"('{vacancy_id}',$${skill}$$)" for skill in skills)
    for index, (_, _, _, vacancy_no, score, _, _) in enumerate(CANDIDATES, 1):
        preapprovals.append(
            f"('66666666-6666-4666-8666-{index:012d}','{VACANCIES[vacancy_no-1][0]}',"
            f"'44444444-4444-4444-8444-{index:012d}','22222222-2222-4222-8222-{index:012d}',"
            f"'55555555-5555-4555-8555-{index:012d}',{score},now())"
        )
    sql = f"""
BEGIN;
DELETE FROM contratos WHERE vacante_id IN ({','.join(repr(v[0]) for v in VACANCIES)});
DELETE FROM preaprobaciones WHERE vacante_id IN ({','.join(repr(v[0]) for v in VACANCIES)});
DELETE FROM vacante_habilidades_requeridas WHERE vacante_id IN ({','.join(repr(v[0]) for v in VACANCIES)});
INSERT INTO vacantes (id,departamento_id,titulo,descripcion,cupo_total,cupo_disponible,salario_presupuestado,moneda,estado,fecha_apertura,fecha_cierre,version)
VALUES {','.join(vacancy_values)}
ON CONFLICT (id) DO UPDATE SET titulo=EXCLUDED.titulo,descripcion=EXCLUDED.descripcion,cupo_total=EXCLUDED.cupo_total,
cupo_disponible=EXCLUDED.cupo_disponible,salario_presupuestado=EXCLUDED.salario_presupuestado,estado='ABIERTA',
fecha_apertura=EXCLUDED.fecha_apertura,fecha_cierre=EXCLUDED.fecha_cierre,version=0;
INSERT INTO vacante_habilidades_requeridas (vacante_id,habilidad) VALUES {','.join(skills_values)} ON CONFLICT DO NOTHING;
INSERT INTO preaprobaciones (id,vacante_id,postulacion_id,candidato_id,ranking_id,score,creada_en)
VALUES {','.join(preapprovals)} ON CONFLICT (vacante_id,postulacion_id) DO UPDATE SET score=EXCLUDED.score,creada_en=EXCLUDED.creada_en;
COMMIT;
"""
    run(COMPOSE + ["exec", "-T", "postgres", "sh", "-lc", 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$VACANCIES_DB"'], stdin=sql)

    rows = []
    for index, (name, email, phone, vacancy_no, score, salary, skills) in enumerate(CANDIDATES, 1):
        vacancy = VACANCIES[vacancy_no - 1]
        rows.append(
            f"('demo-{index}','44444444-4444-4444-8444-{index:012d}','{vacancy[0]}',"
            f"'22222222-2222-4222-8222-{index:012d}','33333333-3333-4333-8333-{index:012d}',"
            f"$${name}$$,$${email}$$,$${phone}$$,{salary},'evaluated',{score},{index},'PRE_APROBADO',"
            f"$json${json.dumps(skills, ensure_ascii=False)}$json$::jsonb,'web',$${vacancy[1]}$$,"
            f"'00000000-0000-0000-0000-000000000001','ABIERTA',{vacancy[3]},now(),now(),now(),now())"
        )
    cqrs_sql = f"""
INSERT INTO read_model_candidaturas_vacantes
(projection_id,application_id,vacancy_id,candidate_id,resume_id,candidate_name,candidate_email,candidate_phone,
salary_expectation,application_status,score,ranking_position,ranking_status,skills,channel,vacancy_title,
vacancy_department_id,vacancy_status,vacancy_available_slots,created_at,updated_at,evaluated_at,projected_at)
VALUES {','.join(rows)}
ON CONFLICT (projection_id) DO UPDATE SET candidate_name=EXCLUDED.candidate_name,candidate_email=EXCLUDED.candidate_email,
candidate_phone=EXCLUDED.candidate_phone,salary_expectation=EXCLUDED.salary_expectation,score=EXCLUDED.score,
ranking_position=EXCLUDED.ranking_position,ranking_status=EXCLUDED.ranking_status,skills=EXCLUDED.skills,
vacancy_title=EXCLUDED.vacancy_title,vacancy_status=EXCLUDED.vacancy_status,
vacancy_available_slots=EXCLUDED.vacancy_available_slots,updated_at=now(),evaluated_at=now(),projected_at=now();
"""
    run(COMPOSE + ["exec", "-T", "postgres", "sh", "-lc", 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$CQRS_DB"'], stdin=cqrs_sql)


def seed_mongo() -> None:
    print("[3/5] Sembrando CVs y postulaciones en MongoDB...")
    script = ["const d=db.getSiblingDB(process.env.MONGO_INITDB_DATABASE);"]
    for index, (name, email, phone, vacancy_no, score, salary, skills) in enumerate(CANDIDATES, 1):
        cid = f"22222222-2222-4222-8222-{index:012d}"
        rid = f"33333333-3333-4333-8333-{index:012d}"
        aid = f"44444444-4444-4444-8444-{index:012d}"
        cv = {"resumeId": rid, "candidateId": cid, "channel": "web", "status": "evaluated", "locked": False,
              "applicant": {"name": name, "email": email, "phone": phone, "salaryExpectation": salary},
              "rawData": {"fileName": f"cv-{name.lower().replace(' ', '-')}.pdf", "demo": True},
              "plainText": f"CV de {name}. Experiencia en {', '.join(skills)}.",
              "skills": [{"name": skill, "level": "advanced"} for skill in skills],
              "experience": [{"role": VACANCIES[vacancy_no-1][1], "years": 3 + index % 6}], "education": [{"degree": "Licenciatura"}], "warnings": []}
        app = {"applicationId": aid, "candidateId": cid, "resumeId": rid, "vacancyId": VACANCIES[vacancy_no-1][0], "status": "evaluated"}
        script.append(f"d.curricula.updateOne({{resumeId:{json.dumps(rid)}}},{{$set:{json.dumps(cv, ensure_ascii=False)},$unset:{{selectedApplicationId:'',lockedAt:''}}}},{{upsert:true}});")
        script.append(f"d.postulaciones.updateOne({{applicationId:{json.dumps(aid)}}},{{$set:{json.dumps(app, ensure_ascii=False)},$unset:{{sagaId:''}}}},{{upsert:true}});")
    run(COMPOSE + ["exec", "-T", "mongodb", "sh", "-lc",
                   'mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "$(cat)"'], stdin="".join(script))


def dynamo_call(operation: str, payload: dict) -> dict:
    body = json.dumps(payload).encode()
    now = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    request = urllib.request.Request(DYNAMO, data=body, method="POST", headers={
        "Content-Type": "application/x-amz-json-1.0", "X-Amz-Target": f"DynamoDB_20120810.{operation}",
        "X-Amz-Date": now, "Authorization": "AWS4-HMAC-SHA256 Credential=local/20200101/us-east-1/dynamodb/aws4_request, SignedHeaders=host;x-amz-date;x-amz-target, Signature=" + "0" * 64,
    })
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read() or b"{}")


def seed_dynamo() -> None:
    print("[4/5] Sembrando rankings en DynamoDB Local...")
    table = os.getenv("DYNAMODB_RANKING_TABLE", "recruitment_rankings")
    items = []
    for index, (_, _, _, vacancy_no, score, _, skills) in enumerate(CANDIDATES, 1):
        now = datetime.now(timezone.utc).isoformat()
        items.append({
            "vacancyId": VACANCIES[vacancy_no-1][0], "candidateId": f"22222222-2222-4222-8222-{index:012d}",
            "resumeId": f"33333333-3333-4333-8333-{index:012d}", "applicationId": f"44444444-4444-4444-8444-{index:012d}",
            "rankingId": f"55555555-5555-4555-8555-{index:012d}", "score": score,
            "breakdown": {skill: round(score / 100, 2) for skill in skills}, "status": "PRE_APROBADO",
            "version": 1, "modelVersion": "demo-seed-v1", "evaluationsFrozen": False,
            "createdAt": now, "updatedAt": now,
        })
    php = """<?php
require '/var/www/vendor/autoload.php';
$client = new Aws\\DynamoDb\\DynamoDbClient([
  'version'=>'latest','region'=>getenv('AWS_DEFAULT_REGION') ?: 'us-east-1',
  'endpoint'=>getenv('DYNAMODB_ENDPOINT'),
  'credentials'=>['key'=>getenv('AWS_ACCESS_KEY_ID') ?: 'local','secret'=>getenv('AWS_SECRET_ACCESS_KEY') ?: 'local']
]);
$marshaler = new Aws\\DynamoDb\\Marshaler();
$items = json_decode(<<<'JSON'
""" + json.dumps(items, ensure_ascii=False) + """
JSON, true, 512, JSON_THROW_ON_ERROR);
foreach ($items as $item) {
  $client->putItem(['TableName'=>getenv('DYNAMODB_RANKING_TABLE') ?: 'recruitment_rankings','Item'=>$marshaler->marshalItem($item)]);
}
echo 'rankings sembrados=' . count($items) . PHP_EOL;
"""
    run(COMPOSE + ["exec", "-T", "ms-ranking", "php"], stdin=php)


def verify() -> None:
    print("[5/5] Verificando conteos del escenario...")
    verify_sql = "SELECT 'vacantes='||count(*) FROM vacantes WHERE id::text LIKE '11111111-1111-4111-8111-1111111111%';"
    run(COMPOSE + ["exec", "-T", "postgres", "sh", "-lc", 'psql -At -U "$POSTGRES_USER" -d "$VACANCIES_DB"'], stdin=verify_sql)
    verify_php = """<?php
require '/var/www/vendor/autoload.php';
$c=new Aws\\DynamoDb\\DynamoDbClient(['version'=>'latest','region'=>getenv('AWS_DEFAULT_REGION') ?: 'us-east-1','endpoint'=>getenv('DYNAMODB_ENDPOINT'),'credentials'=>['key'=>getenv('AWS_ACCESS_KEY_ID') ?: 'local','secret'=>getenv('AWS_SECRET_ACCESS_KEY') ?: 'local']]);
$r=$c->scan(['TableName'=>getenv('DYNAMODB_RANKING_TABLE') ?: 'recruitment_rankings','Select'=>'COUNT']); echo 'rankings='.$r['Count'].PHP_EOL;
"""
    run(COMPOSE + ["exec", "-T", "ms-ranking", "php"], stdin=verify_php)
    print("\nDemo lista. IDs: éxito=...1101, rollback=...1102, crítica=...1103")


def main() -> int:
    try:
        wait_for_stack(); seed_postgres(); seed_mongo(); seed_dynamo(); verify()
        return 0
    except (subprocess.CalledProcessError, urllib.error.URLError, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
