#!/usr/bin/env bash
set -euo pipefail

# Preserve the logical path used to invoke the repository. GNU realpath -s
# normalizes `.` / `..` lexically without following the acmm_explorer symlink.
script_path="${BASH_SOURCE[0]}"
if [[ "$script_path" != /* ]]; then
  script_path="$PWD/$script_path"
fi
repo_root="$(realpath -sm "$(dirname "$script_path")/..")"
cd "$repo_root"

refresh_reference="true"
force_build="false"

for arg in "$@"; do
  case "$arg" in
    --skip-reference)
      refresh_reference="false"
      ;;
    --build)
      force_build="true"
      ;;
    -h|--help)
      cat <<'USAGE'
Usage: ./scripts/dev.sh [--build] [--skip-reference]

  --build           Force a rebuild of the shared local Docker dev image.
  --skip-reference  Do not refresh the source-generated schema catalog.
USAGE
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: ./scripts/dev.sh [--build] [--skip-reference]" >&2
      exit 2
      ;;
  esac
done

if [[ "$force_build" == "true" ]]; then
  ./scripts/ensure-dev-image.sh --build
else
  ./scripts/ensure-dev-image.sh
fi

if [[ "$refresh_reference" == "true" ]]; then
  ./scripts/reference-import.sh --if-available --no-build
fi

cleanup()
{
  # Compose owns Ctrl+C. Once it returns, remove stopped service containers and
  # the project network. Named volumes remain because cleanup does not use -v.
  docker compose down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Source files are bind-mounted and dependencies are reconciled at container
# startup, so the normal development launch does not need to rebuild the image.
docker compose up --remove-orphans explorer
