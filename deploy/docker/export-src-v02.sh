#!/usr/bin/env bash
# Pack host-mountable backend code next to docker/ (for offline LAN hosts).
#   deploy/agentscope-v02-src.tar.gz  → extract to /home/agent/v2/source/
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
root="$(cd ../.. && pwd)"
archive="$(cd .. && pwd)/agentscope-v02-src.tar.gz"

echo "Packing src/ + examples/agent_service/ from ${root}"
tar -C "${root}" -czf "${archive}" \
    src \
    examples/agent_service

(
    cd "$(dirname "$archive")"
    sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256"
)

ls -lh "${archive}" "${archive}.sha256"
echo
echo "On offline host:"
echo "  cd /home/agent/v2"
echo "  mkdir -p source && tar xzf agentscope-v02-src.tar.gz -C source"
echo "  # → /home/agent/v2/source/{src,examples/agent_service}"
echo "  # docker/.env.v02 MUST be: AGENTSCOPE_HOST_ROOT=../source"
echo "  # (NOT ../.. which resolves to /home/agent)"
