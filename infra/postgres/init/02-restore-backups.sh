#!/bin/sh
set -eu

restore_database() {
  database_name="$1"
  database_user="$2"
  dump_file="$3"

  if [ ! -s "$dump_file" ]; then
    echo "No backup found for ${database_name}; application will initialize its schema."
    return
  fi

  echo "Restoring ${database_name} from ${dump_file}..."
  pg_restore \
    --exit-on-error \
    --no-owner \
    --no-privileges \
    --role="$database_user" \
    --username="$POSTGRES_USER" \
    --dbname="$database_name" \
    "$dump_file"
}

restore_database "$VACANCIES_DB" "$VACANCIES_DB_USER" /backups/vacancies.dump
restore_database "$CQRS_DB" "$CQRS_DB_USER" /backups/read-model.dump
