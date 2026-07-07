#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Patch docs/frontend-repair-plan.md from the frontend-repair worktree into other worktrees.

Usage:
  scripts/patch-frontend-repair-plan.sh [options] [target-worktree ...]

Options:
  --apply          Write the plan file into each target worktree. Default is dry-run.
  --diff           Show unified diffs for changed targets during dry-run.
  --force          Allow --apply to replace an existing differing destination file.
  --include-self   Include the frontend-repair worktree as a target.
  --source FILE    Source file relative to the frontend-repair worktree.
                   Default: docs/frontend-repair-plan.md
  -h, --help       Show this help.

With no target-worktree arguments, the script discovers all git worktrees and
targets every worktree except the frontend-repair source worktree.
USAGE
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_WORKTREE="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
SOURCE_REL="docs/frontend-repair-plan.md"
DRY_RUN=1
SHOW_DIFF=0
FORCE=0
INCLUDE_SELF=0
TARGET_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      DRY_RUN=0
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --diff)
      SHOW_DIFF=1
      shift
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --include-self)
      INCLUDE_SELF=1
      shift
      ;;
    --source)
      if [[ $# -lt 2 ]]; then
        echo "error: --source requires a relative file path" >&2
        exit 2
      fi
      SOURCE_REL="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        TARGET_ARGS+=("$1")
        shift
      done
      ;;
    -*)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      TARGET_ARGS+=("$1")
      shift
      ;;
  esac
done

SOURCE_FILE="${SOURCE_WORKTREE}/${SOURCE_REL}"

if [[ ! -f "${SOURCE_FILE}" ]]; then
  echo "error: source file does not exist: ${SOURCE_FILE}" >&2
  exit 1
fi

canonical_path() {
  local path="$1"
  cd -- "${path}" && pwd
}

discover_targets() {
  git -C "${SOURCE_WORKTREE}" worktree list --porcelain |
    awk '/^worktree / { sub(/^worktree /, ""); print }'
}

TARGETS=()
if [[ ${#TARGET_ARGS[@]} -gt 0 ]]; then
  for target in "${TARGET_ARGS[@]}"; do
    TARGETS+=("${target}")
  done
else
  while IFS= read -r target; do
    TARGETS+=("${target}")
  done < <(discover_targets)
fi

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "No target worktrees found."
  exit 0
fi

MODE="dry-run"
if [[ "${DRY_RUN}" -eq 0 ]]; then
  MODE="apply"
fi

echo "Source worktree: ${SOURCE_WORKTREE}"
echo "Source file:     ${SOURCE_REL}"
echo "Mode:            ${MODE}"
echo

CHANGED=0
SKIPPED=0
FAILED=0

for target in "${TARGETS[@]}"; do
  if [[ ! -d "${target}" ]]; then
    echo "SKIP ${target}"
    echo "  not a directory"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  TARGET_WORKTREE="$(canonical_path "${target}")"

  if [[ "${INCLUDE_SELF}" -eq 0 && "${TARGET_WORKTREE}" == "${SOURCE_WORKTREE}" ]]; then
    echo "SKIP ${TARGET_WORKTREE}"
    echo "  source worktree"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if ! git -C "${TARGET_WORKTREE}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "SKIP ${TARGET_WORKTREE}"
    echo "  not a git worktree"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  DEST_FILE="${TARGET_WORKTREE}/${SOURCE_REL}"

  if [[ -f "${DEST_FILE}" ]] && cmp -s "${SOURCE_FILE}" "${DEST_FILE}"; then
    echo "OK   ${TARGET_WORKTREE}"
    echo "  ${SOURCE_REL} already matches"
    continue
  fi

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    if [[ -f "${DEST_FILE}" ]]; then
      echo "DIFF ${TARGET_WORKTREE}"
      echo "  would update ${SOURCE_REL}"
      if [[ "${SHOW_DIFF}" -eq 1 ]]; then
        diff -u "${DEST_FILE}" "${SOURCE_FILE}" || true
      fi
    else
      echo "ADD  ${TARGET_WORKTREE}"
      echo "  would add ${SOURCE_REL}"
      if [[ "${SHOW_DIFF}" -eq 1 ]]; then
        diff -u /dev/null "${SOURCE_FILE}" || true
      fi
    fi
    CHANGED=$((CHANGED + 1))
    continue
  fi

  if [[ -f "${DEST_FILE}" && "${FORCE}" -eq 0 ]]; then
    echo "FAIL ${TARGET_WORKTREE}"
    echo "  ${SOURCE_REL} already exists and differs; re-run with --force to replace it"
    FAILED=$((FAILED + 1))
    continue
  fi

  mkdir -p "$(dirname "${DEST_FILE}")"
  cp "${SOURCE_FILE}" "${DEST_FILE}"
  echo "DONE ${TARGET_WORKTREE}"
  echo "  wrote ${SOURCE_REL}"
  CHANGED=$((CHANGED + 1))
done

echo
echo "Summary: changed=${CHANGED} skipped=${SKIPPED} failed=${FAILED}"

if [[ "${FAILED}" -gt 0 ]]; then
  exit 1
fi
