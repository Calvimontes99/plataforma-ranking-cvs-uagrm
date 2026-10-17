#!/bin/sh
set -eu

create_database_and_user() {
  database_name="$1"
  database_user="$2"
  database_password="$3"

  psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    --set database_name="$database_name" \
    --set database_user="$database_user" \
    --set database_password="$database_password" <<-'SQL'
SELECT format('CREATE USER %I WITH PASSWORD %L', :'database_user', :'database_password')
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'database_user')\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database_name', :'database_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database_name')\gexec
SQL
}

create_database_and_user "$VACANCIES_DB" "$VACANCIES_DB_USER" "$VACANCIES_DB_PASSWORD"
create_database_and_user "$CQRS_DB" "$CQRS_DB_USER" "$CQRS_DB_PASSWORD"
create_database_and_user "$KEYCLOAK_DB" "$KEYCLOAK_DB_USER" "$KEYCLOAK_DB_PASSWORD"

psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set database_user="${CQRS_READONLY_DB_USER:-cqrs_report_user}" \
  --set database_password="${CQRS_READONLY_DB_PASSWORD:-cqrs_report_dev}" <<-'SQL'
SELECT format('CREATE USER %I WITH PASSWORD %L', :'database_user', :'database_password')
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'database_user')\gexec
SQL

psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$CQRS_DB" \
  --set database_name="$CQRS_DB" \
  --set readonly_user="${CQRS_READONLY_DB_USER:-cqrs_report_user}" \
  --set writer_user="$CQRS_DB_USER" <<-'SQL'
GRANT CONNECT ON DATABASE :"database_name" TO :"readonly_user";
GRANT USAGE ON SCHEMA public TO :"readonly_user";
GRANT SELECT ON ALL TABLES IN SCHEMA public TO :"readonly_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"writer_user" IN SCHEMA public
  GRANT SELECT ON TABLES TO :"readonly_user";
SQL
