#!/usr/bin/env python3
"""Add 72 deterministic, fictional candidate profiles across the local services."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

INFRA = Path(__file__).resolve().parent
COMPOSE = ["docker", "compose", "-f", str(INFRA / "docker-compose.yml")]
GATEWAY = os.getenv("DEMO_GATEWAY_URL", "http://localhost:8080").rstrip("/")
VACANCIES = [
    ("11111111-1111-4111-8111-111111111101", "Ingeniero de Sistemas Senior", 3, 2, -4),
    ("11111111-1111-4111-8111-111111111102", "Arquitecto Cloud & IA", 1, 0, -8),
    ("11111111-1111-4111-8111-111111111103", "Especialista DevSecOps", 2, 2, -21),
]
FIRST_NAMES = [
    "Sofía", "Mateo", "Valentina", "Sebastián", "Lucía", "Nicolás",
    "Camila", "Gabriel", "Daniela", "Alejandro", "Mariana", "Diego",
]
LAST_NAMES = [
    "Rivera", "Mendoza", "Vargas", "Rojas", "Salazar", "Flores",
]
SKILL_PROFILES = [
    ["Java", "Spring Boot", "PostgreSQL", "Docker"],
    ["Python", "AWS", "Kubernetes", "Terraform"],
    ["TypeScript", "Angular", "Node.js", "GraphQL"],
    ["SQL", "Power BI", "ETL", "Machine Learning"],
    ["Linux", "OWASP", "CI/CD", "Kubernetes"],
    ["Flutter", "Firebase", "SQLite", "REST APIs"],
]
EDUCATION = [
    "Ingeniería de Sistemas", "Ingeniería Informática", "Ciencias de la Computación",
    "Ingeniería Electrónica", "Estadística", "Ingeniería Industrial",
]
CHANNELS = ["web", "mobile", "whatsapp"]
APPLICATION_STATUSES = ["evaluated", "preapproved", "selected", "rejected"]
RANKING_STATUSES = ["EN_CONCURSO", "PRE_APROBADO", "SELECCIONADO", "DESCARTADO"]


def run(args: list[str], *, stdin: str | None = None, capture: bool = False) -> str:
    result = subprocess.run(
        args,
        cwd=INFRA,
        input=stdin.encode("utf-8") if stdin is not None else None,
        check=True,
        capture_output=capture,
    )
    return result.stdout.decode("utf-8").strip() if capture else ""


def wait_for_stack(timeout: int = 240) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{GATEWAY}/health", timeout=3) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.URLError):
            time.sleep(3)
    raise RuntimeError("El API Gateway no quedó listo; revise el perfil demo de Docker Compose.")


def sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def build_candidates() -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    candidates: list[dict[str, Any]] = []
    for index in range(9, 81):
        offset = index - 9
        vacancy_index = offset % len(VACANCIES)
        vacancy_id, vacancy_title, _, available_slots, vacancy_age_days = VACANCIES[vacancy_index]
        status_index = offset % len(APPLICATION_STATUSES)
        first_name = FIRST_NAMES[offset % len(FIRST_NAMES)]
        last_name = LAST_NAMES[(offset // len(FIRST_NAMES)) % len(LAST_NAMES)]
        name = f"{first_name} {last_name}"
        candidate_id = f"22222222-2222-4222-8222-{index:012d}"
        resume_id = f"33333333-3333-4333-8333-{index:012d}"
        application_id = f"44444444-4444-4444-8444-{index:012d}"
        ranking_id = f"55555555-5555-4555-8555-{index:012d}"
        preapproval_id = f"66666666-6666-4666-8666-{index:012d}"
        score = 55 + ((index * 17) % 45)
        salary = 6000 + ((index * 137) % 9000)
        # Keep application timestamps after the corresponding demo vacancy opened.
        vacancy_open_age = abs(vacancy_age_days)
        days_ago = 1 + ((index * 7) % max(1, vacancy_open_age - 1))
        created_at = now - timedelta(days=days_ago)
        evaluated_at = created_at + timedelta(hours=2 + index % 48)
        skills = SKILL_PROFILES[offset % len(SKILL_PROFILES)]
        status = APPLICATION_STATUSES[status_index]
        candidates.append({
            "index": index,
            "name": name,
            "email": f"candidato.{index:04d}@example.com",
            "phone": f"+591 70{index:06d}",
            "candidate_id": candidate_id,
            "resume_id": resume_id,
            "application_id": application_id,
            "ranking_id": ranking_id,
            "preapproval_id": preapproval_id,
            "vacancy_id": vacancy_id,
            "vacancy_title": vacancy_title,
            "vacancy_index": vacancy_index,
            "available_slots": available_slots,
            "score": score,
            "salary": salary,
            "status": status,
            "ranking_status": RANKING_STATUSES[status_index],
            "channel": CHANNELS[offset % len(CHANNELS)],
            "skills": skills,
            "experience_years": 1 + (index % 14),
            "education": EDUCATION[offset % len(EDUCATION)],
            "created_at": created_at.isoformat(),
            "evaluated_at": evaluated_at.isoformat(),
            "locked": status == "selected",
        })

    by_vacancy: dict[str, list[dict[str, Any]]] = {}
    for candidate in candidates:
        by_vacancy.setdefault(candidate["vacancy_id"], []).append(candidate)
    for group in by_vacancy.values():
        for position, candidate in enumerate(sorted(group, key=lambda row: row["score"], reverse=True), 1):
            candidate["ranking_position"] = position
    return candidates


def ensure_demo_vacancies() -> None:
    ids = ",".join(sql_literal(vacancy[0]) for vacancy in VACANCIES)
    count = run(
        COMPOSE + ["exec", "-T", "postgres", "sh", "-lc",
                   'psql -At -U "$POSTGRES_USER" -d "$VACANCIES_DB"'],
        stdin=f"SELECT count(*) FROM vacantes WHERE id IN ({ids});",
        capture=True,
    )
    if int(count) != len(VACANCIES):
        raise RuntimeError("Faltan las tres vacantes demo. Ejecute primero python infra/seed-demo-data.py.")


def seed_postgres(candidates: list[dict[str, Any]]) -> None:
    # Only currently preapproved candidates belong in the ERP's actionable shortlist.
    preapprovals = [candidate for candidate in candidates if candidate["status"] == "preapproved"]
    preapproval_values = ",\n".join(
        "(" + ",".join(sql_literal(value) for value in (
            candidate["preapproval_id"], candidate["vacancy_id"], candidate["application_id"],
            candidate["candidate_id"], candidate["ranking_id"], candidate["score"], candidate["created_at"],
        )) + ")"
        for candidate in preapprovals
    )
    preapproval_sql = ""
    if preapprovals:
        preapproval_sql = f"""
INSERT INTO preaprobaciones (id,vacante_id,postulacion_id,candidato_id,ranking_id,score,creada_en)
VALUES {preapproval_values}
ON CONFLICT (vacante_id,postulacion_id) DO UPDATE
SET score=EXCLUDED.score, ranking_id=EXCLUDED.ranking_id, creada_en=EXCLUDED.creada_en;
"""

    projection_values = []
    for candidate in candidates:
        values = [
            f"application:{candidate['application_id']}", candidate["application_id"], candidate["vacancy_id"],
            candidate["candidate_id"], candidate["resume_id"], candidate["name"], candidate["email"],
            candidate["phone"], candidate["salary"], candidate["status"], candidate["score"],
            candidate["ranking_position"], candidate["ranking_status"], json.dumps(candidate["skills"], ensure_ascii=False),
            candidate["channel"], candidate["vacancy_title"],
            "00000000-0000-0000-0000-000000000001", "ABIERTA", candidate["available_slots"],
            candidate["created_at"], candidate["created_at"], candidate["evaluated_at"], candidate["evaluated_at"],
        ]
        projection_values.append("(" + ",".join(
            sql_literal(value) + ("::jsonb" if position == 13 else "")
            for position, value in enumerate(values)
        ) + ")")

    columns = (
        "projection_id,application_id,vacancy_id,candidate_id,resume_id,candidate_name,candidate_email,candidate_phone,"
        "salary_expectation,application_status,score,ranking_position,ranking_status,skills,channel,vacancy_title,"
        "vacancy_department_id,vacancy_status,vacancy_available_slots,created_at,updated_at,evaluated_at,projected_at"
    )
    updates = ",".join(
        f"{column}=EXCLUDED.{column}"
        for column in columns.split(",")
        if column not in {"projection_id", "application_id"}
    )
    projection_sql = f"""
INSERT INTO read_model_candidaturas_vacantes ({columns})
VALUES {',\n'.join(projection_values)}
ON CONFLICT (projection_id) DO UPDATE SET {updates};
"""
    if preapproval_sql:
        run(COMPOSE + ["exec", "-T", "postgres", "sh", "-lc",
                       'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$VACANCIES_DB"'], stdin=f"BEGIN;\n{preapproval_sql}\nCOMMIT;\n")
    run(COMPOSE + ["exec", "-T", "postgres", "sh", "-lc",
                   'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$CQRS_DB"'], stdin=projection_sql)


def seed_mongo(candidates: list[dict[str, Any]]) -> None:
    commands = ["const dbi=db.getSiblingDB(process.env.MONGO_INITDB_DATABASE);"]
    for candidate in candidates:
        if candidate["locked"]:
            curriculum["selectedApplicationId"] = candidate["application_id"]
            curriculum["lockedAt"] = candidate["evaluated_at"]
        curriculum = {
            "resumeId": candidate["resume_id"],
            "candidateId": candidate["candidate_id"],
            "channel": candidate["channel"],
            "status": "locked" if candidate["locked"] else "evaluated",
            "locked": candidate["locked"],
            "applicant": {
                "candidateId": candidate["candidate_id"], "fullName": candidate["name"],
                "email": candidate["email"], "phone": candidate["phone"],
                "salaryExpectation": candidate["salary"],
            },
            "rawData": {"fileName": f"cv-{candidate['index']:04d}.pdf", "seed": "bulk-demo-v1"},
            "plainText": f"Perfil profesional de {candidate['name']}. Habilidades: {', '.join(candidate['skills'])}.",
            "skills": [{"name": skill, "level": 1 + (candidate["index"] % 5)} for skill in candidate["skills"]],
            "experience": [{"role": candidate["vacancy_title"], "years": candidate["experience_years"]}],
            "education": [{"degree": candidate["education"], "institution": "Universidad Gabriel René Moreno"}],
            "warnings": [],
            "createdAt": candidate["created_at"],
            "updatedAt": candidate["evaluated_at"],
        }
        application = {
            "applicationId": candidate["application_id"], "candidateId": candidate["candidate_id"],
            "resumeId": candidate["resume_id"], "vacancyId": candidate["vacancy_id"],
            "status": candidate["status"], "createdAt": candidate["created_at"],
            "updatedAt": candidate["evaluated_at"],
        }
        document_name = f"cv{candidate['index']}"
        unset_fields = {"selectedApplicationId": "", "lockedAt": ""} if not candidate["locked"] else None
        unset_clause = ",$unset:{selectedApplicationId:'',lockedAt:''}" if unset_fields else ""
        commands.append(
            f"{{const {document_name}={json.dumps(curriculum, ensure_ascii=False)};"
            f"{document_name}.createdAt=new Date({document_name}.createdAt);"
            f"{document_name}.updatedAt=new Date({document_name}.updatedAt);"
            f"if({document_name}.lockedAt){document_name}.lockedAt=new Date({document_name}.lockedAt);"
            f"dbi.curricula.updateOne({{resumeId:{json.dumps(candidate['resume_id'])}}},"
            f"{{$set:{document_name}{unset_clause}}},{{upsert:true}});}}"
        )
        application_name = f"app{candidate['index']}"
        commands.append(
            f"{{const {application_name}={json.dumps(application, ensure_ascii=False)};"
            f"{application_name}.createdAt=new Date({application_name}.createdAt);"
            f"{application_name}.updatedAt=new Date({application_name}.updatedAt);"
            f"dbi.postulaciones.updateOne({{applicationId:{json.dumps(candidate['application_id'])}}},"
            f"{{$set:{application_name},$unset:{{sagaId:''}}}},{{upsert:true}});}}"
        )
    run(COMPOSE + ["exec", "-T", "mongodb", "sh", "-lc",
                   'mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "$(cat)"'],
        stdin="".join(commands))


def seed_dynamodb(candidates: list[dict[str, Any]]) -> None:
    items = []
    for candidate in candidates:
        items.append({
            "vacancyId": candidate["vacancy_id"], "candidateId": candidate["candidate_id"],
            "resumeId": candidate["resume_id"], "applicationId": candidate["application_id"],
            "score": candidate["score"],
            "breakdown": {skill: round(candidate["score"] / 100, 2) for skill in candidate["skills"]},
            "status": candidate["ranking_status"], "version": 1,
            "modelVersion": "bulk-demo-v1", "evaluationsFrozen": False,
            "rankingId": candidate["ranking_id"], "position": candidate["ranking_position"],
            "createdAt": candidate["created_at"], "updatedAt": candidate["evaluated_at"],
        })
    php = f"""<?php
require '/var/www/vendor/autoload.php';
use Aws\\DynamoDb\\DynamoDbClient;
use Aws\\DynamoDb\\Marshaler;
$client = new DynamoDbClient([
  'version'=>'latest', 'region'=>getenv('AWS_DEFAULT_REGION') ?: 'us-east-1',
  'endpoint'=>getenv('DYNAMODB_ENDPOINT'),
  'credentials'=>['key'=>getenv('AWS_ACCESS_KEY_ID') ?: 'local','secret'=>getenv('AWS_SECRET_ACCESS_KEY') ?: 'local']
]);
$marshaler = new Marshaler();
$items = json_decode(<<<'JSON'
{json.dumps(items, ensure_ascii=False)}
JSON, true, 512, JSON_THROW_ON_ERROR);
$table = getenv('DYNAMODB_RANKING_TABLE') ?: 'recruitment_rankings';
foreach ($items as $item) {{
  $client->putItem(['TableName'=>$table, 'Item'=>$marshaler->marshalItem($item)]);
}}
echo 'DynamoDB rankings upserted=' . count($items) . PHP_EOL;
"""
    run(COMPOSE + ["exec", "-T", "ms-ranking", "php"], stdin=php)


def verify(candidates: list[dict[str, Any]]) -> None:
    ids = ",".join(sql_literal(candidate["candidate_id"]) for candidate in candidates)
    query = f"SELECT count(*) FROM read_model_candidaturas_vacantes WHERE candidate_id IN ({ids});"
    count = run(COMPOSE + ["exec", "-T", "postgres", "sh", "-lc",
                           'psql -At -U "$POSTGRES_USER" -d "$CQRS_DB"'], stdin=query, capture=True)
    if int(count) != len(candidates):
        raise RuntimeError(f"Read Model tiene {count} de {len(candidates)} filas del lote")
    print(f"Read Model: {count} postulaciones verificadas.")

    first = candidates[0]
    last = candidates[-1]
    mongo_script = f"""
const d=db.getSiblingDB(process.env.MONGO_INITDB_DATABASE);
const resumes=d.curricula.countDocuments({{resumeId:{{$gte:{json.dumps(first['resume_id'])},$lte:{json.dumps(last['resume_id'])}}}}});
const applications=d.postulaciones.countDocuments({{applicationId:{{$gte:{json.dumps(first['application_id'])},$lte:{json.dumps(last['application_id'])}}}}});
print('MongoDB curricula=' + resumes + ' applications=' + applications);
if(resumes !== {len(candidates)} || applications !== {len(candidates)}) quit(7);
"""
    run(COMPOSE + ["exec", "-T", "mongodb", "sh", "-lc",
                   'mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "$(cat)"'],
        stdin=mongo_script)

    expected_ids = json.dumps([candidate["candidate_id"] for candidate in candidates])
    php = f"""<?php
require '/var/www/vendor/autoload.php';
use Aws\\DynamoDb\\DynamoDbClient;
use Aws\\DynamoDb\\Marshaler;
$client=new DynamoDbClient(['version'=>'latest','region'=>getenv('AWS_DEFAULT_REGION') ?: 'us-east-1','endpoint'=>getenv('DYNAMODB_ENDPOINT'),'credentials'=>['key'=>getenv('AWS_ACCESS_KEY_ID') ?: 'local','secret'=>getenv('AWS_SECRET_ACCESS_KEY') ?: 'local']]);
$mapper=new Marshaler(); $expected=json_decode(<<<'JSON'
{expected_ids}
JSON, true, 512, JSON_THROW_ON_ERROR); $expected=array_fill_keys($expected,true);
$table=getenv('DYNAMODB_RANKING_TABLE') ?: 'recruitment_rankings'; $found=0; $start=null;
do {{
  $params=['TableName'=>$table,'ProjectionExpression'=>'candidateId'];
  if($start!==null) $params['ExclusiveStartKey']=$start;
  $page=$client->scan($params);
  foreach($page['Items'] ?? [] as $item) {{ $decoded=$mapper->unmarshalItem($item); if(isset($expected[$decoded['candidateId']])) $found++; }}
  $start=$page['LastEvaluatedKey'] ?? null;
}} while(!empty($start));
echo 'DynamoDB rankings=' . $found . PHP_EOL;
if($found !== {len(candidates)}) exit(7);
"""
    run(COMPOSE + ["exec", "-T", "ms-ranking", "php"], stdin=php)


def main() -> int:
    try:
        wait_for_stack()
        ensure_demo_vacancies()
        candidates = build_candidates()
        print("Insertando 72 perfiles ficticios relacionados en PostgreSQL, MongoDB y DynamoDB Local...")
        seed_postgres(candidates)
        seed_mongo(candidates)
        seed_dynamodb(candidates)
        verify(candidates)
        print("Estados agregados: evaluados, preaprobados, seleccionados y rechazados (18 por estado).")
        return 0
    except (subprocess.CalledProcessError, urllib.error.URLError, RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
