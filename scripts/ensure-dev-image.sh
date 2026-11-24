#!/usr/bin/env bash
set -euo pipefail

script_path="${BASH_SOURCE[0]}"
if [[ "$script_path" != /* ]]; then
  script_path="$PWD/$script_path"
fi
repo_root="$(realpath -sm "$(dirname "$script_path")/..")"
cd "$repo_root"

force_build="false"
if [[ "${1:-}" == "--build" ]]; then
  force_build="true"
elif [[ $# -gt 0 ]]; then
  echo "Usage: ./scripts/ensure-dev-image.sh [--build]" >&2
  exit 2
fi

image_name="${ACMM_EXPLORER_DEV_IMAGE:-acmm-explorer-dev:local}"

if [[ "$force_build" != "true" ]] && docker image inspect "$image_name" >/dev/null 2>&1; then
  echo "Using local Explorer dev image: $image_name"
  exit 0
fi

# v0.18.1 and earlier let Compose choose the image name. Reuse that already
# built image when present so upgrading the helper does not force a registry
# lookup merely to rename the local development image.
if [[ "$force_build" != "true" ]]; then
  legacy_images=(
    "acmm_explorer-explorer"
    "acmm-explorer-explorer"
  )

  for legacy_image in "${legacy_images[@]}"; do
    if docker image inspect "$legacy_image" >/dev/null 2>&1; then
      echo "Reusing existing Explorer image: $legacy_image -> $image_name"
      docker tag "$legacy_image" "$image_name"
      exit 0
    fi
  done
fi

if [[ "$force_build" == "true" ]]; then
  echo "Rebuilding Explorer dev image: $image_name"
else
  echo "Explorer dev image is not available locally; building it once: $image_name"
fi

if ! docker compose build explorer; then
  cat >&2 <<'MSG'

Explorer dev-image build failed.

If Docker reports an error while loading metadata for node:24-alpine together
with "error getting credentials", that failure is in the host Docker credential
helper / registry path rather than ACMM Explorer. Ordinary ./scripts/dev.sh
launches reuse the local dev image and do not rebuild it; use --build only when
you intentionally need to refresh the Docker image.
MSG
  exit 1
fi
