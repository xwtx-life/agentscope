#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# When running on the live host, auto-fill JWT from v0.1 before validating.
if [[ "${SKIP_PULL_V01_SECRETS:-0}" != "1" ]] && command -v docker >/dev/null 2>&1; then
    if docker ps --format '{{.Names}}' 2>/dev/null \
        | awk 'tolower($0) ~ /agentscope-api/ && tolower($0) !~ /v2/ { found=1 } END { exit !found }'
    then
        bash ./pull-v01-secrets.sh .env.v02
    fi
fi

if [[ ! -f .env.v02 ]]; then
    echo "Missing deploy/docker/.env.v02. Copy .env.v02.example (JWT is auto-pulled on up-v02)." >&2
    exit 1
fi

jwt="$(grep -E '^AGENTSCOPE_JWT_SECRET=' .env.v02 | tail -n 1 | cut -d= -f2- || true)"
if [[ -z "$jwt" || "$jwt" == replace-with-* ]]; then
    if [[ "${ALLOW_PLACEHOLDER_JWT:-0}" == "1" ]]; then
        echo "WARN: AGENTSCOPE_JWT_SECRET is still a placeholder (build-only mode)." >&2
    else
        echo "AGENTSCOPE_JWT_SECRET missing. On the live host run: ./pull-v01-secrets.sh" >&2
        exit 1
    fi
fi

network="$(grep -E '^V01_DOCKER_NETWORK=' .env.v02 | tail -n 1 | cut -d= -f2- || true)"
network="${network:-agentscope-stack_default}"
if ! docker network inspect "$network" >/dev/null 2>&1; then
    echo "Docker network '${network}' not found. Is v0.1 running?" >&2
    echo "Check: docker network ls | grep agentscope" >&2
    exit 1
fi

for vol_key in V01_VOLUME_WORKSPACES V01_VOLUME_BLOBS V01_VOLUME_SKILL_SUBMISSIONS; do
    vol="$(grep -E "^${vol_key}=" .env.v02 | tail -n 1 | cut -d= -f2- || true)"
    case "$vol_key" in
        V01_VOLUME_WORKSPACES) default=agentscope-stack_agentscope_workspaces ;;
        V01_VOLUME_BLOBS) default=agentscope-stack_agentscope_blobs ;;
        V01_VOLUME_SKILL_SUBMISSIONS) default=agentscope-stack_agentscope_skill_submissions ;;
    esac
    vol="${vol:-$default}"
    if ! docker volume inspect "$vol" >/dev/null 2>&1; then
        echo "Docker volume '${vol}' not found (${vol_key})." >&2
        echo "Check: docker volume ls | grep agentscope" >&2
        exit 1
    fi
done

environment="$(grep -E '^AGENTSCOPE_ENV=' .env.v02 | tail -n 1 | cut -d= -f2- || true)"
if [[ "$environment" == "production" ]]; then
    echo "Production mode requires HTTPS and AGENTSCOPE_SECURE_COOKIES=true." >&2
    if ! grep -q '^AGENTSCOPE_SECURE_COOKIES=true$' .env.v02; then
        exit 1
    fi
fi

# Backend code is mounted from the host (API image has deps only).
# Strip CR/quotes/spaces — Windows-copied .env often has \r and breaks -d tests.
host_root="$(
    grep -E '^AGENTSCOPE_HOST_ROOT=' .env.v02 2>/dev/null \
        | tail -n 1 \
        | cut -d= -f2- \
        | tr -d '\r' \
        | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" \
        || true
)"
host_root="${host_root:-../source}"

echo "AGENTSCOPE_HOST_ROOT(raw)=${host_root}  cwd=$(pwd)"

# Resolve relative to this docker/ directory.
if [[ "${host_root}" != /* ]]; then
    if [[ ! -d "${host_root}" ]]; then
        echo "AGENTSCOPE_HOST_ROOT='${host_root}' not found (from $(pwd))." >&2
        echo "ls parent:" >&2
        ls -la .. >&2 || true
        echo "Fix:" >&2
        echo "  ls -la /home/agent/v2/source/src/agentscope" >&2
        echo "  # .env.v02 must contain exactly: AGENTSCOPE_HOST_ROOT=../source" >&2
        echo "  sed -i 's/\\r$//' .env.v02" >&2
        echo "  sed -i 's|^AGENTSCOPE_HOST_ROOT=.*|AGENTSCOPE_HOST_ROOT=../source|' .env.v02" >&2
        exit 1
    fi
    host_root="$(cd "${host_root}" && pwd)"
fi
if [[ ! -d "${host_root}/src/agentscope" ]]; then
    echo "AGENTSCOPE_HOST_ROOT='${host_root}' missing src/agentscope." >&2
    echo "ls ${host_root}:" >&2
    ls -la "${host_root}" >&2 || true
    echo "Expected layout: ${host_root}/src/agentscope and ${host_root}/examples/agent_service" >&2
    echo "If tar was extracted into v2/ instead of v2/source/:" >&2
    echo "  cd /home/agent/v2 && mkdir -p source && mv -n src examples source/" >&2
    exit 1
fi
if [[ ! -f "${host_root}/examples/agent_service/main.py" ]]; then
    echo "AGENTSCOPE_HOST_ROOT='${host_root}' missing examples/agent_service/main.py." >&2
    ls -la "${host_root}/examples" >&2 || true
    exit 1
fi
echo "Host backend code: ${host_root}"
