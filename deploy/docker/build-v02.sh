#!/usr/bin/env bash
# Build v0.2 images on a networked machine with the full git repo.
# Offline LAN hosts should only import the exported tar — never run this.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

root="$(cd ../.. && pwd)"
api_tag="${AGENTSCOPE_API_IMAGE:-local/agentscope-api:v0.2}"
web_tag="${AGENTSCOPE_WEB_IMAGE:-local/agentscope-web:v0.2}"

echo "Building ${api_tag} ..."
docker build -t "${api_tag}" -f agentscope-api.Dockerfile "${root}"

echo "Building ${web_tag} ..."
docker build -t "${web_tag}" -f agentscope-web.Dockerfile "${root}"

echo "Built:"
docker images --format 'table {{.Repository}}:{{.Tag}}\t{{.Size}}' \
    | grep -E 'REPOSITORY|agentscope-api:v0.2|agentscope-web:v0.2' || true
