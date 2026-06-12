#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

compose_args=(-f docker-compose.stage.yml)

if [[ -f docker-compose.stage.local.yml ]]; then
  compose_args+=(-f docker-compose.stage.local.yml)
fi

docker compose --env-file server/.env.stage "${compose_args[@]}" up -d --build --remove-orphans
