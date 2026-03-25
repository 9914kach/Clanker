#!/bin/sh
# Körs endast när Postgres-datavolymen initieras första gången (official image).
# Första databasen skapas redan som $POSTGRES_DB (standard: clanker_discord).
set -eu

extra_db="${POSTGRES_EXTRA_DB:-clanker_devtools}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "CREATE DATABASE ${extra_db};"
