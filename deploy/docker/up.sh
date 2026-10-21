#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
./check-env.sh
docker compose --env-file .env -f compose.yml up -d --no-build
