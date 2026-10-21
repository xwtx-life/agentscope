#!/usr/bin/env bash
# Stop v0.2 overlay only. Never pass -v (shared volumes belong to v0.1).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
chmod +x ./*.sh 2>/dev/null || true

docker compose --env-file .env.v02 -f compose.v02-parallel.yml \
    down --remove-orphans

# Legacy gateway from older packs
docker rm -f "$(docker ps -aq --filter name=gateway-v2)" 2>/dev/null || true

echo "v0.2 overlay stopped (v0.1 volumes untouched)."
