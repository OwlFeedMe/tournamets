#!/usr/bin/env bash
set -euo pipefail

PROD_DATABASE_URL="${PROD_DATABASE_URL:-}"
STAGE_DATABASE_URL="${STAGE_DATABASE_URL:-${DATABASE_URL:-}}"
PROD_SCHEMA="${PROD_SCHEMA:-public}"
STAGE_SCHEMA="${STAGE_SCHEMA:-finalrep_stage}"
PGCLIENT_DOCKER_IMAGE="${PGCLIENT_DOCKER_IMAGE:-postgres:18-alpine}"

normalize_libpq_url() {
  local url="$1"
  echo "${url/postgresql+psycopg2:\/\//postgresql://}"
}

if [[ -z "$PROD_DATABASE_URL" || -z "$STAGE_DATABASE_URL" ]]; then
  echo "PROD_DATABASE_URL and STAGE_DATABASE_URL are required." >&2
  exit 1
fi

if [[ "$PROD_DATABASE_URL" == "$STAGE_DATABASE_URL" && "$PROD_SCHEMA" == "$STAGE_SCHEMA" ]]; then
  echo "Refusing to refresh stage: prod and stage database/schema are identical." >&2
  exit 1
fi

PROD_LIBPQ_URL="$(normalize_libpq_url "$PROD_DATABASE_URL")"
STAGE_LIBPQ_URL="$(normalize_libpq_url "$STAGE_DATABASE_URL")"

psql_cmd() {
  docker run -i --rm "$PGCLIENT_DOCKER_IMAGE" psql "$@"
}

pg_dump_cmd() {
  docker run --rm "$PGCLIENT_DOCKER_IMAGE" pg_dump "$@"
}

read -r -p "This will replace the stage database with a copy of production. Type REFRESH_STAGE to continue: " confirmation
if [[ "$confirmation" != "REFRESH_STAGE" ]]; then
  echo "Cancelled."
  exit 0
fi

dump_file="$(mktemp -t finalrep-prod-dump.XXXXXX)"
cleanup() {
  rm -f "$dump_file"
}
trap cleanup EXIT

echo "[refresh-stage-db] replacing schema $STAGE_SCHEMA from $PROD_SCHEMA"
psql_cmd "$STAGE_LIBPQ_URL" -v ON_ERROR_STOP=1 \
  -c "DROP SCHEMA IF EXISTS \"$STAGE_SCHEMA\" CASCADE;" \
  -c "CREATE SCHEMA \"$STAGE_SCHEMA\";"

echo "[refresh-stage-db] dumping production schema"
pg_dump_cmd --format=plain --no-owner --no-acl --schema="$PROD_SCHEMA" --dbname="$PROD_LIBPQ_URL" > "$dump_file"

echo "[refresh-stage-db] restoring stage schema"
sed \
  -e "s/CREATE SCHEMA ${PROD_SCHEMA};/CREATE SCHEMA IF NOT EXISTS ${STAGE_SCHEMA};/g" \
  -e "s/COMMENT ON SCHEMA ${PROD_SCHEMA} /COMMENT ON SCHEMA ${STAGE_SCHEMA} /g" \
  -e "s/${PROD_SCHEMA}\\./${STAGE_SCHEMA}./g" \
  -e "s/search_path = ${PROD_SCHEMA}/search_path = ${STAGE_SCHEMA}/g" \
  "$dump_file" | psql_cmd "$STAGE_LIBPQ_URL" -v ON_ERROR_STOP=1

echo "[refresh-stage-db] running stage migrations"
docker compose --env-file server/.env.stage -f docker-compose.stage.yml exec -T backend alembic upgrade head

echo "[refresh-stage-db] done"
