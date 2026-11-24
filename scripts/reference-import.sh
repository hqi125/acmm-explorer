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

mode="strict"
build_mode="auto"

for arg in "$@"; do
  case "$arg" in
    --if-available)
      mode="if-available"
      ;;
    --build)
      build_mode="force"
      ;;
    --no-build)
      build_mode="skip"
      ;;
    -h|--help)
      cat <<'USAGE'
Usage: ./scripts/reference-import.sh [--if-available] [--build|--no-build]

  --if-available  Skip successfully when either source repository is absent.
  --build         Force a rebuild of the shared local Docker dev image.
  --no-build      Assume the shared local Docker dev image already exists.
USAGE
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

# Resolve a relative source path against the *logical* Explorer root without
# following symlinks. GNU realpath -s performs lexical normalization only.
resolve_source()
{
  local configured="$1"

  if [[ "$configured" = /* ]]; then
    realpath -sm "$configured"
  else
    realpath -sm "$repo_root/$configured"
  fi
}

dotenv_value()
{
  local key="$1"
  local line=""
  local value=""

  [[ -f "$repo_root/.env" ]] || return 1
  line="$(grep -E "^[[:space:]]*${key}=" "$repo_root/.env" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 1

  value="${line#*=}"
  value="${value%$'\r'}"
  # Support the ordinary quoted forms used by dotenv files without executing
  # the file as shell code.
  if [[ ${#value} -ge 2 ]]; then
    if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi

  printf '%s\n' "$value"
}

core_configured="${ACMM_CORE_REPO:-}"
if [[ -z "$core_configured" ]]; then
  core_configured="$(dotenv_value ACMM_CORE_REPO || true)"
fi
core_configured="${core_configured:-../acmm_repo}"

experiments_configured="${ACMM_EXPERIMENTS_REPO:-}"
if [[ -z "$experiments_configured" ]]; then
  experiments_configured="$(dotenv_value ACMM_EXPERIMENTS_REPO || true)"
fi
experiments_configured="${experiments_configured:-../acmm_experiments}"

core_source="$(resolve_source "$core_configured")"
experiments_source="$(resolve_source "$experiments_configured")"

missing=()
[[ -d "$core_source" ]] || missing+=("Core: $core_source")
[[ -d "$experiments_source" ]] || missing+=("Experiments: $experiments_source")

if (( ${#missing[@]} > 0 )); then
  if [[ "$mode" == "if-available" ]]; then
    echo "Reference import skipped; source repo(s) not available:" >&2
    printf '  %s\n' "${missing[@]}" >&2
    exit 0
  fi

  echo "Reference import cannot continue; source repo(s) not found:" >&2
  printf '  %s\n' "${missing[@]}" >&2
  exit 1
fi

# Canonicalize only after the logical path has already selected the correct
# sibling entry (for example /home/user/acmm_repo). This is safe for Docker
# bind mounts and allows the source itself to be a WSL symlink.
core_source="$(realpath -e "$core_source")"
experiments_source="$(realpath -e "$experiments_source")"

echo "Reference sources:"
echo "  Core:        $core_source"
echo "  Experiments: $experiments_source"

if [[ "$build_mode" == "force" ]]; then
  ./scripts/ensure-dev-image.sh --build
elif [[ "$build_mode" == "auto" ]]; then
  ./scripts/ensure-dev-image.sh
fi

ACMM_CORE_REPO="$core_source" \
ACMM_EXPERIMENTS_REPO="$experiments_source" \
docker compose run \
  --rm \
  --no-deps \
  reference-import
