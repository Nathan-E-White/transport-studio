#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Generate, check, or apply the frontend-repair delta against sibling worktrees.

Usage:
  scripts/propagate-frontend-repair-delta.sh [options] [target-worktree ...]

Default mode is check-only. It generates a patch from the frontend-repair
worktree and verifies whether that patch applies to each target worktree.

Options:
  --apply              Apply the patch to target worktrees.
  --check              Check whether the patch applies. This is the default.
  --base REF           Base ref for the source diff. Default: HEAD.
                       After repair work is complete but uncommitted, HEAD
                       means "everything changed in this worktree."
  --paths-from FILE    Path allowlist file. Default:
                       scripts/frontend-repair-paths.txt
  --include-untracked  Include untracked files under the allowlisted paths.
                       This is the default.
  --no-untracked       Do not include untracked files.
  --patch-out FILE     Also write the generated patch to FILE.
  --show-stat          Show the generated patch stat.
  --show-patch         Print the generated patch to stdout.
  --include-self       Include the frontend-repair worktree as a target.
  --no-3way            Do not use git apply --3way.
  -h, --help           Show this help.

With no target-worktree arguments, the script discovers all git worktrees and
targets every worktree except the frontend-repair source worktree.

Typical flow:
  1. Finish the repair in devs/frontend-repair.
  2. Run: scripts/propagate-frontend-repair-delta.sh --show-stat
  3. Resolve any check failures or review the patch.
  4. Run: scripts/propagate-frontend-repair-delta.sh --apply
USAGE
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_WORKTREE="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
BASE_REF="HEAD"
PATHS_FILE="${SCRIPT_DIR}/frontend-repair-paths.txt"
MODE="check"
INCLUDE_UNTRACKED=1
INCLUDE_SELF=0
USE_3WAY=1
PATCH_OUT=""
SHOW_STAT=0
SHOW_PATCH=0
TARGET_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      MODE="apply"
      shift
      ;;
    --check|--dry-run)
      MODE="check"
      shift
      ;;
    --base)
      if [[ $# -lt 2 ]]; then
        echo "error: --base requires a ref" >&2
        exit 2
      fi
      BASE_REF="$2"
      shift 2
      ;;
    --paths-from)
      if [[ $# -lt 2 ]]; then
        echo "error: --paths-from requires a file" >&2
        exit 2
      fi
      PATHS_FILE="$2"
      shift 2
      ;;
    --include-untracked)
      INCLUDE_UNTRACKED=1
      shift
      ;;
    --no-untracked)
      INCLUDE_UNTRACKED=0
      shift
      ;;
    --patch-out)
      if [[ $# -lt 2 ]]; then
        echo "error: --patch-out requires a file" >&2
        exit 2
      fi
      PATCH_OUT="$2"
      shift 2
      ;;
    --show-stat)
      SHOW_STAT=1
      shift
      ;;
    --show-patch)
      SHOW_PATCH=1
      shift
      ;;
    --include-self)
      INCLUDE_SELF=1
      shift
      ;;
    --no-3way)
      USE_3WAY=0
      shift
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

if [[ ! -f "${PATHS_FILE}" ]]; then
  echo "error: paths file does not exist: ${PATHS_FILE}" >&2
  exit 1
fi

if ! git -C "${SOURCE_WORKTREE}" rev-parse --verify "${BASE_REF}^{commit}" >/dev/null 2>&1; then
  echo "error: base ref is not a commit in source worktree: ${BASE_REF}" >&2
  exit 1
fi

PATHS=()
while IFS= read -r line || [[ -n "${line}" ]]; do
  case "${line}" in
    ""|\#*)
      continue
      ;;
    *)
      PATHS+=("${line}")
      ;;
  esac
done < "${PATHS_FILE}"

if [[ ${#PATHS[@]} -eq 0 ]]; then
  echo "error: no pathspecs found in ${PATHS_FILE}" >&2
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

TMP_ROOT="${TMPDIR:-/tmp}"
PATCH_FILE="$(mktemp "${TMP_ROOT%/}/frontend-repair-delta.XXXXXX.patch")"
cleanup() {
  rm -f "${PATCH_FILE}"
}
trap cleanup EXIT

git -C "${SOURCE_WORKTREE}" diff --binary "${BASE_REF}" -- "${PATHS[@]}" > "${PATCH_FILE}"

if [[ "${INCLUDE_UNTRACKED}" -eq 1 ]]; then
  while IFS= read -r path; do
    git -C "${SOURCE_WORKTREE}" diff --no-index --binary /dev/null "${path}" >> "${PATCH_FILE}" || true
  done < <(git -C "${SOURCE_WORKTREE}" ls-files --others --exclude-standard -- "${PATHS[@]}")
fi

if [[ ! -s "${PATCH_FILE}" ]]; then
  echo "No frontend repair delta found."
  echo "Base ref: ${BASE_REF}"
  echo "Paths:    ${PATHS_FILE}"
  exit 0
fi

if [[ -n "${PATCH_OUT}" ]]; then
  mkdir -p "$(dirname "${PATCH_OUT}")"
  cp "${PATCH_FILE}" "${PATCH_OUT}"
fi

echo "Source worktree: ${SOURCE_WORKTREE}"
echo "Base ref:        ${BASE_REF}"
echo "Paths file:      ${PATHS_FILE}"
echo "Mode:            ${MODE}"
echo "3-way apply:     ${USE_3WAY}"
if [[ -n "${PATCH_OUT}" ]]; then
  echo "Patch copy:      ${PATCH_OUT}"
fi
echo

if [[ "${SHOW_STAT}" -eq 1 ]]; then
  git -C "${SOURCE_WORKTREE}" apply --stat "${PATCH_FILE}" || true
  echo
fi

if [[ "${SHOW_PATCH}" -eq 1 ]]; then
  cat "${PATCH_FILE}"
  echo
fi

APPLY_ARGS=()
if [[ "${USE_3WAY}" -eq 1 ]]; then
  APPLY_ARGS+=("--3way")
fi

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

  if [[ -n "$(git -C "${TARGET_WORKTREE}" status --porcelain)" ]]; then
    echo "NOTE ${TARGET_WORKTREE}"
    echo "  target has existing local changes; git apply will protect overlapping edits"
  fi

  if [[ "${MODE}" == "check" ]]; then
    if git -C "${TARGET_WORKTREE}" apply --check "${APPLY_ARGS[@]}" "${PATCH_FILE}" >/dev/null 2>&1; then
      echo "OK   ${TARGET_WORKTREE}"
      echo "  patch applies"
      CHANGED=$((CHANGED + 1))
    else
      echo "FAIL ${TARGET_WORKTREE}"
      echo "  patch does not apply cleanly; run with --patch-out and inspect conflicts"
      FAILED=$((FAILED + 1))
    fi
  else
    if git -C "${TARGET_WORKTREE}" apply "${APPLY_ARGS[@]}" "${PATCH_FILE}"; then
      echo "DONE ${TARGET_WORKTREE}"
      echo "  patch applied"
      CHANGED=$((CHANGED + 1))
    else
      echo "FAIL ${TARGET_WORKTREE}"
      echo "  patch did not apply"
      FAILED=$((FAILED + 1))
    fi
  fi
done

echo
echo "Summary: changed=${CHANGED} skipped=${SKIPPED} failed=${FAILED}"

if [[ "${FAILED}" -gt 0 ]]; then
  exit 1
fi
