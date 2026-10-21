#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
./build.sh

mkdir -p images
archive="images/agentscope-stack-images.tar"
mapfile -t images_to_save < <(
    docker compose --env-file .env -f compose.yml config --images | sort -u
)

echo "Exporting ${#images_to_save[@]} images to ${archive}"
docker save -o "${archive}" "${images_to_save[@]}"
sha256sum "${archive}" > "${archive}.sha256"
