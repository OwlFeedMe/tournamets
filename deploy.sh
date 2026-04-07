#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build --remove-orphans
