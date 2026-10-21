#!/usr/bin/env bash
# Offline-safe: only docker load. Never pull / build / pip.
#
# Layout:
#   /home/agent/v2/agentscope-v02-overlay-images.tar
#   /home/agent/v2/docker/   ← run from here
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

resolve_archive() {
    if [[ $# -ge 1 && -n "${1:-}" ]]; then
        echo "$1"
        return
    fi
    local candidates=(
        "../agentscope-v02-overlay-images.tar"
        "../images/agentscope-v02-overlay-images.tar"
        "agentscope-v02-overlay-images.tar"
        "images/agentscope-v02-overlay-images.tar"
    )
    local c
    for c in "${candidates[@]}"; do
        if [[ -f "$c" ]]; then
            echo "$(cd "$(dirname "$c")" && pwd)/$(basename "$c")"
            return
        fi
    done
    return 1
}

is_oci_layout() {
    tar -tf "$1" 2>/dev/null | head -n 40 | grep -q '^blobs/sha256/' && return 0
    return 1
}

is_legacy_docker_archive() {
    tar -tf "$1" 2>/dev/null | head -n 80 | grep -qE '(^|/)layer\.tar$|manifest\.json$' && return 0
    return 1
}

is_bundle_of_legacies() {
    tar -tf "$1" 2>/dev/null | grep -qE '\.legacy\.tar$' && return 0
    return 1
}

load_one() {
    echo "  docker load -i $1"
    docker load -i "$1"
}

archive="$(resolve_archive "${1:-}" || true)"
if [[ -z "${archive:-}" || ! -f "$archive" ]]; then
    echo "Image archive not found." >&2
    echo "Expected: /home/agent/v2/agentscope-v02-overlay-images.tar" >&2
    exit 1
fi

echo "Using archive: ${archive}"

if [[ -f "${archive}.sha256" ]]; then
    echo "Checking SHA-256..."
    (
        cd "$(dirname "$archive")"
        sed -i 's/\r$//' "$(basename "${archive}.sha256")" 2>/dev/null || true
        sha256sum --check "$(basename "${archive}.sha256")"
    )
fi

echo "Loading images (offline, no registry)..."

if is_oci_layout "$archive"; then
    echo "ERROR: OCI format tar — older Docker cannot load it." >&2
    echo "Use the legacy bundle from export-images-v02.sh." >&2
    exit 1
fi

workdir="$(mktemp -d /tmp/agentscope-load.XXXXXX)"
cleanup() { rm -rf "$workdir"; }
trap cleanup EXIT

if is_bundle_of_legacies "$archive"; then
    echo "Detected multi-image legacy bundle."
    tar -xf "$archive" -C "$workdir"
    mapfile -t files < <(find "$workdir" -type f -name '*.legacy.tar' | sort)
    if [[ ${#files[@]} -eq 0 ]]; then
        echo "Bundle contained no .legacy.tar members." >&2
        exit 1
    fi
    for f in "${files[@]}"; do
        load_one "$f"
    done
elif is_legacy_docker_archive "$archive"; then
    echo "Detected classic docker-archive."
    load_one "$archive"
else
    echo "Unrecognized tar layout; trying docker load anyway..."
    load_one "$archive"
fi

echo "Loaded. Verify:"
docker images --format 'table {{.Repository}}:{{.Tag}}\t{{.Size}}' \
    | grep -E 'REPOSITORY|agentscope-api:v0.2|agentscope-web:v0.2' || true

echo
echo "Next:"
echo "  bash ./up-v02.sh"
echo "  # (auto: HOST_ROOT=../source, extract source/, start :18082 web + :18083 api)"
