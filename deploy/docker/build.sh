#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
./check-env.sh

docker compose --env-file .env -f compose.yml pull \
    agentscope-redis qdrant \
    skillhub-postgres skillhub-redis skillhub-scanner \
    skillhub-server skillhub-web gateway
docker compose --env-file .env -f compose.yml build \
    agentscope-api agentscope-web
