#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

compose_args=(-f docker-compose.prod.yml)

if [[ -f docker-compose.server.local.yml ]]; then
  compose_args+=(-f docker-compose.server.local.yml)
fi

docker compose "${compose_args[@]}" up -d --build --remove-orphans
