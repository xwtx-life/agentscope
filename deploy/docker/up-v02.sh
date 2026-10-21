#!/usr/bin/env bash
# Start v0.2 overlay only. Offline-safe: never pull/build/pip.
# No gateway — API and web publish host ports directly.
#
#   cd /home/agent/v2/docker && bash ./up-v02.sh
#
# Auto: strip CRLF, HOST_ROOT=../source, extract source/, detect LAN IP,
# rewrite CORS for WEB origin, pull JWT, start with force-recreate.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

chmod +x ./*.sh 2>/dev/null || true
run_sh() { bash "./$1" "${@:2}"; }

env_get() {
    grep -E "^${1}=" .env.v02 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '\r' || true
}

env_set() {
    local key="$1" val="$2"
    if grep -qE "^${key}=" .env.v02; then
        sed -i "s|^${key}=.*|${key}=${val}|" .env.v02
    else
        echo "${key}=${val}" >> .env.v02
    fi
}

detect_lan_ip() {
    local ip=""
    ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
    if [[ -z "${ip}" ]]; then
        ip="$(ip -4 route get 1.1.1.1 2>/dev/null \
            | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}' || true)"
    fi
    # Prefer non-docker / non-loopback if hostname -I returned several.
    if [[ -z "${ip}" || "${ip}" == 172.* ]]; then
        ip="$(ip -4 -o addr show scope global 2>/dev/null \
            | awk '!/docker|br-|veth|virbr/ {print $4; exit}' \
            | cut -d/ -f1 || true)"
    fi
    echo "${ip}"
}

normalize_env() {
    sed -i 's/\r$//' .env.v02 2>/dev/null || true

    env_set AGENTSCOPE_HOST_ROOT ../source

    grep -qE '^WEB_HTTP_PORT=' .env.v02 || echo 'WEB_HTTP_PORT=18082' >> .env.v02
    grep -qE '^API_HTTP_PORT=' .env.v02 || echo 'API_HTTP_PORT=18083' >> .env.v02

    web_port="$(env_get WEB_HTTP_PORT)"
    api_port="$(env_get API_HTTP_PORT)"
    web_port="${web_port:-18082}"
    api_port="${api_port:-18083}"
    env_set WEB_HTTP_PORT "${web_port}"
    env_set API_HTTP_PORT "${api_port}"

    lan="$(env_get LAN_HOST)"
    if [[ -z "${lan}" || "${lan}" == "192.168.1.100" || "${lan}" == "<LAN>" || "${lan}" == "replace-me" ]]; then
        detected="$(detect_lan_ip)"
        if [[ -n "${detected}" ]]; then
            lan="${detected}"
            echo "Auto LAN_HOST=${lan}"
        else
            echo "WARN: could not detect LAN IP; set LAN_HOST in .env.v02" >&2
            lan="127.0.0.1"
        fi
    fi
    env_set LAN_HOST "${lan}"

    # WEB origin must be allowed (API is another port → CORS).
    cors_value="http://${lan}:${web_port},http://localhost:${web_port},http://127.0.0.1:${web_port}"
    env_set AGENTSCOPE_CORS_ORIGINS "${cors_value}"
    echo "CORS=${cors_value}"
}

# ---- .env.v02 ----
if [[ ! -f .env.v02 ]]; then
    cp .env.v02.example .env.v02
    echo "Created .env.v02 from .env.v02.example"
fi
normalize_env

# ---- source tree ----
src_root="$(cd .. && pwd)/source"
src_tar="$(cd .. && pwd)/agentscope-v02-src.tar.gz"

if [[ -f "${src_root}/examples/agent_service/main.py" \
   && -d "${src_root}/src/agentscope" ]]; then
    echo "Host source OK: ${src_root}"
else
    if [[ ! -f "${src_tar}" ]]; then
        echo "Missing backend source and tar:" >&2
        echo "  need ${src_root}/{src,examples/agent_service}" >&2
        echo "  or ${src_tar}" >&2
        exit 1
    fi
    echo "Extracting ${src_tar} → ${src_root}"
    mkdir -p "${src_root}"
    tar xzf "${src_tar}" -C "${src_root}"
    if [[ ! -f "${src_root}/examples/agent_service/main.py" ]]; then
        echo "Extract finished but main.py still missing under ${src_root}" >&2
        ls -la "${src_root}" >&2 || true
        exit 1
    fi
    echo "Host source ready: ${src_root}"
fi

# ---- images ----
required_images=(
    "local/agentscope-api:v0.2"
    "local/agentscope-web:v0.2"
)
missing=0
for img in "${required_images[@]}"; do
    if ! docker image inspect "$img" >/dev/null 2>&1; then
        echo "Missing local image: ${img}" >&2
        missing=1
    fi
done
if [[ "$missing" -ne 0 ]]; then
    echo "Import images first:  bash ./import-images.sh" >&2
    exit 1
fi

run_sh pull-v01-secrets.sh .env.v02
# Secrets rewrite may drop our keys / reintroduce CRLF — normalize again.
normalize_env

SKIP_PULL_V01_SECRETS=1 run_sh check-env-v02.sh

docker compose --env-file .env.v02 -f compose.v02-parallel.yml \
    rm -sf gateway-v2 2>/dev/null || true
docker rm -f "$(docker ps -aq --filter name=gateway-v2)" 2>/dev/null || true

echo "Starting agentscope-stack-v02 (direct ports, no gateway)..."
docker compose --env-file .env.v02 -f compose.v02-parallel.yml \
    up -d --no-build --pull never --remove-orphans --force-recreate

lan="$(env_get LAN_HOST)"
web_port="$(env_get WEB_HTTP_PORT)"
api_port="$(env_get API_HTTP_PORT)"
lan="${lan:-<LAN>}"
web_port="${web_port:-18082}"
api_port="${api_port:-18083}"

echo
echo "Web UI:  http://${lan}:${web_port}"
echo "API:     http://${lan}:${api_port}"
echo "Open WEB, setup server URL = API."
echo "Check:   curl -sS http://127.0.0.1:${api_port}/health"
echo "SkillHub still :18081 (v0.1)."
