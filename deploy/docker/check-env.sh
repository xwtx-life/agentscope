#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if [[ ! -f .env ]]; then
    echo "Missing deploy/docker/.env. Copy .env.example and fill in secrets." >&2
    exit 1
fi

required=(
    AGENTSCOPE_JWT_SECRET
    AGENTSCOPE_SECRET_ENCRYPTION_KEY
    SKILLHUB_POSTGRES_PASSWORD
    SKILLHUB_DOWNLOAD_ANON_COOKIE_SECRET
    BOOTSTRAP_ADMIN_PASSWORD
)

for key in "${required[@]}"; do
    value="$(grep -E "^${key}=" .env | tail -n 1 | cut -d= -f2- || true)"
    if [[ -z "$value" || "$value" == replace-with-* ]]; then
        echo "Set a non-placeholder value for ${key} in deploy/docker/.env." >&2
        exit 1
    fi
done

environment="$(grep -E '^AGENTSCOPE_ENV=' .env | tail -n 1 | cut -d= -f2- || true)"
if [[ "$environment" == "production" ]]; then
    echo "Production mode requires HTTPS and AGENTSCOPE_SECURE_COOKIES=true." >&2
    if ! grep -q '^AGENTSCOPE_SECURE_COOKIES=true$' .env; then
        exit 1
    fi
fi
