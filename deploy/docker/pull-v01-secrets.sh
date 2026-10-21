#!/usr/bin/env bash
# Read AGENTSCOPE_JWT_SECRET (and encryption key) from the live v0.1
# agentscope-api container and write them into .env.v02. Does not change v0.1.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

ENV_FILE="${1:-.env.v02}"

if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f .env.v02.example ]]; then
        cp .env.v02.example "$ENV_FILE"
        echo "Created ${ENV_FILE} from .env.v02.example"
    else
        echo "Missing ${ENV_FILE}" >&2
        exit 1
    fi
fi

# Prefer the non-v2 API container (v0.1).
cid="$(
    docker ps --format '{{.ID}} {{.Names}}' \
        | awk 'tolower($0) ~ /agentscope-api/ && tolower($0) !~ /v2/ { print $1; exit }'
)"
if [[ -z "${cid}" ]]; then
    echo "No running v0.1 agentscope-api container found; cannot pull JWT." >&2
    echo "Check: docker ps | grep agentscope-api" >&2
    exit 1
fi

cname="$(docker inspect -f '{{.Name}}' "$cid" | sed 's#^/##')"
echo "Pulling secrets from v0.1 container: ${cname} (${cid})"

env_dump="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$cid")"

jwt="$(printf '%s\n' "$env_dump" | sed -n 's/^AGENTSCOPE_JWT_SECRET=//p' | head -n1)"
enc="$(printf '%s\n' "$env_dump" | sed -n 's/^AGENTSCOPE_SECRET_ENCRYPTION_KEY=//p' | head -n1)"

if [[ -z "${jwt}" ]]; then
    echo "v0.1 container has no AGENTSCOPE_JWT_SECRET env var." >&2
    exit 1
fi

upsert() {
    local key="$1"
    local value="$2"
    local tmp
    tmp="$(mktemp)"
    if grep -qE "^${key}=" "$ENV_FILE"; then
        # Replace existing line; keep the rest of the file intact.
        awk -v k="$key" -v v="$value" '
            BEGIN { done=0 }
            index($0, k "=") == 1 && !done { print k "=" v; done=1; next }
            { print }
            END { if (!done) print k "=" v }
        ' "$ENV_FILE" > "$tmp"
    else
        cat "$ENV_FILE" > "$tmp"
        printf '%s=%s\n' "$key" "$value" >> "$tmp"
    fi
    mv "$tmp" "$ENV_FILE"
}

upsert AGENTSCOPE_JWT_SECRET "$jwt"
if [[ -n "${enc}" ]]; then
    upsert AGENTSCOPE_SECRET_ENCRYPTION_KEY "$enc"
fi

# Best-effort: adopt the network the v0.1 API is attached to.
net="$(
    docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$cid" \
        | head -n1
)"
if [[ -n "${net}" ]]; then
    upsert V01_DOCKER_NETWORK "$net"
    echo "Set V01_DOCKER_NETWORK=${net}"
fi

echo "Synced AGENTSCOPE_JWT_SECRET into ${ENV_FILE}"
if [[ -n "${enc}" ]]; then
    echo "Synced AGENTSCOPE_SECRET_ENCRYPTION_KEY into ${ENV_FILE}"
fi
