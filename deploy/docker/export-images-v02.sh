#!/usr/bin/env bash
# Build + export overlay images on a networked machine.
# No gateway image. Writes next to docker/:
#   deploy/agentscope-v02-overlay-images.tar
#   deploy/agentscope-v02-src.tar.gz
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
./build-v02.sh
./export-src-v02.sh

deploy_dir="$(cd .. && pwd)"
archive_name="agentscope-v02-overlay-images.tar"
archive="${deploy_dir}/${archive_name}"
stage="$(mktemp -d /tmp/agentscope-export.XXXXXX)"
trap 'rm -rf "$stage"' EXIT

api="${AGENTSCOPE_API_IMAGE:-local/agentscope-api:v0.2}"
web="${AGENTSCOPE_WEB_IMAGE:-local/agentscope-web:v0.2}"

# Docker Desktop (containerd) OCI save breaks older hosts — use skopeo legacy.
echo "Converting to legacy docker-archive (for older docker load)..."
docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "${stage}:/out" \
    quay.io/skopeo/stable:latest \
    copy "docker-daemon:${api}" "docker-archive:/out/agentscope-api-v02.legacy.tar"
docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "${stage}:/out" \
    quay.io/skopeo/stable:latest \
    copy "docker-daemon:${web}" "docker-archive:/out/agentscope-web-v02.legacy.tar"

echo "Bundling into ${archive}"
tar -cf "${archive}" -C "${stage}" \
    agentscope-api-v02.legacy.tar \
    agentscope-web-v02.legacy.tar
(
    cd "${deploy_dir}"
    sha256sum "${archive_name}" > "${archive_name}.sha256"
)

rm -f "./${archive_name}" "./${archive_name}.sha256" \
    "./images/${archive_name}" "./images/${archive_name}.sha256" 2>/dev/null || true

echo "Pack ready (same level as docker/):"
ls -lh "${archive}" "${archive}.sha256" \
    "${deploy_dir}/agentscope-v02-src.tar.gz" \
    "${deploy_dir}/agentscope-v02-src.tar.gz.sha256"
echo
echo "Copy to /home/agent/v2/ :"
echo "  agentscope-v02-overlay-images.tar(.sha256)"
echo "  agentscope-v02-src.tar.gz(.sha256)"
echo "  docker/"
echo "Then:"
echo "  mkdir -p /home/agent/v2/source"
echo "  tar xzf /home/agent/v2/agentscope-v02-src.tar.gz -C /home/agent/v2/source"
echo "  cd /home/agent/v2/docker && chmod +x *.sh"
echo "  # .env.v02: AGENTSCOPE_HOST_ROOT=../source  WEB=18082 API=18083"
echo "  bash ./import-images.sh && bash ./up-v02.sh"
