#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/cleanup-frontend-repair-worktree.sh [options]

Safely removes the sibling devs/frontend-repair worktree after verifying that
the patched target worktree is healthy.

Default mode is a dry run. Add --execute to actually remove the worktree.

Options:
  --execute                    Remove the frontend-repair worktree.
  --skip-verify                Skip bun test/typecheck/build checks.
  --discard-repair-untracked   Allow removal when frontend-repair has untracked files.
                               Those files are copied to the backup directory first.
  --backup-dir DIR             Backup directory for repair diffs/untracked files.
                               Default: /tmp/frontend-repair-worktree-backup-<timestamp>
  --target DIR                 Target worktree. Default: repo root for this script.
  --repair DIR                 Repair worktree. Default: ../devs/frontend-repair from target.
  -h, --help                   Show this help.

Examples:
  scripts/cleanup-frontend-repair-worktree.sh
  scripts/cleanup-frontend-repair-worktree.sh --execute --discard-repair-untracked
  scripts/cleanup-frontend-repair-worktree.sh --execute --skip-verify --discard-repair-untracked
USAGE
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

note() {
  printf '==> %s\n' "$*"
}

timestamp() {
  date -u '+%Y%m%dT%H%M%SZ'
}

physical_path() {
  cd -P -- "$1" && /bin/pwd -P
}

script_dir="$(physical_path "$(dirname -- "${BASH_SOURCE[0]}")")"
target_worktree="$(physical_path "$script_dir/..")"
repair_worktree=""
backup_dir=""
execute=0
skip_verify=0
discard_repair_untracked=0

while (($#)); do
  case "$1" in
    --execute)
      execute=1
      shift
      ;;
    --skip-verify)
      skip_verify=1
      shift
      ;;
    --discard-repair-untracked)
      discard_repair_untracked=1
      shift
      ;;
    --backup-dir)
      [[ $# -ge 2 ]] || die "--backup-dir requires a directory"
      backup_dir="$2"
      shift 2
      ;;
    --target)
      [[ $# -ge 2 ]] || die "--target requires a directory"
      target_worktree="$(physical_path "$2")"
      shift 2
      ;;
    --repair)
      [[ $# -ge 2 ]] || die "--repair requires a directory"
      repair_worktree="$(physical_path "$2")"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

if [[ -z "$repair_worktree" ]]; then
  repair_worktree="$(physical_path "$target_worktree/../devs/frontend-repair")"
fi

if [[ -z "$backup_dir" ]]; then
  backup_dir="/tmp/frontend-repair-worktree-backup-$(timestamp)"
fi

[[ -d "$target_worktree/.git" || -f "$target_worktree/.git" ]] || die "target is not a git worktree: $target_worktree"
[[ -d "$repair_worktree/.git" || -f "$repair_worktree/.git" ]] || die "repair path is not a git worktree: $repair_worktree"

target_root="$(physical_path "$(git -C "$target_worktree" rev-parse --show-toplevel)")"
repair_root="$(physical_path "$(git -C "$repair_worktree" rev-parse --show-toplevel)")"
[[ "$target_root" == "$target_worktree" ]] || die "target path is not the git root: $target_worktree"
[[ "$repair_root" == "$repair_worktree" ]] || die "repair path is not the git root: $repair_worktree"

note "target: $target_worktree ($(git -C "$target_worktree" branch --show-current))"
note "repair: $repair_worktree ($(git -C "$repair_worktree" branch --show-current))"

if ! git -C "$target_worktree" worktree list --porcelain | grep -Fxq "worktree $repair_worktree"; then
  die "repair worktree is not registered under target repo"
fi

if git -C "$target_worktree" diff --quiet --ignore-submodules -- && git -C "$target_worktree" diff --cached --quiet --ignore-submodules --; then
  note "target tracked changes: clean"
else
  die "target has tracked or staged changes; commit/stash them before cleanup"
fi

target_untracked="$(git -C "$target_worktree" ls-files --others --exclude-standard)"
if [[ -n "$target_untracked" ]]; then
  note "target has untracked files left in place:"
  printf '%s\n' "$target_untracked" | sed 's/^/    /'
fi

if rg -n '^(<<<<<<<|=======|>>>>>>>)($|[[:space:]])' "$target_worktree" >/tmp/frontend-repair-conflict-markers.txt; then
  cat /tmp/frontend-repair-conflict-markers.txt >&2
  die "conflict markers found in target"
fi
note "target conflict-marker scan: clean"

if [[ "$skip_verify" -eq 0 ]]; then
  note "running bun run test"
  bun --cwd "$target_worktree" run test
  note "running bun run typecheck"
  bun --cwd "$target_worktree" run typecheck
  note "running bun run build"
  bun --cwd "$target_worktree" run build
else
  note "verification skipped by --skip-verify"
fi

mkdir -p "$backup_dir"
git -C "$repair_worktree" status --short --branch > "$backup_dir/frontend-repair-status.txt"
git -C "$repair_worktree" diff --binary > "$backup_dir/frontend-repair-unstaged.patch"
git -C "$repair_worktree" diff --cached --binary > "$backup_dir/frontend-repair-staged.patch"

if git -C "$repair_worktree" diff --quiet --ignore-submodules -- && git -C "$repair_worktree" diff --cached --quiet --ignore-submodules --; then
  note "repair tracked changes: clean"
else
  die "repair has tracked or staged changes; inspect backup at $backup_dir"
fi

repair_untracked_file="$backup_dir/frontend-repair-untracked-files.txt"
git -C "$repair_worktree" ls-files --others --exclude-standard > "$repair_untracked_file"

if [[ -s "$repair_untracked_file" ]]; then
  note "repair has untracked files; copying them to $backup_dir/untracked"
  while IFS= read -r relative_path; do
    [[ -n "$relative_path" ]] || continue
    mkdir -p "$backup_dir/untracked/$(dirname -- "$relative_path")"
    cp -p -- "$repair_worktree/$relative_path" "$backup_dir/untracked/$relative_path"
  done < "$repair_untracked_file"

  if [[ "$discard_repair_untracked" -eq 0 ]]; then
    die "repair has untracked files; rerun with --discard-repair-untracked after reviewing $backup_dir"
  fi
else
  note "repair untracked files: none"
fi

if [[ "$execute" -eq 0 ]]; then
  note "dry run complete; no worktree was removed"
  note "backup: $backup_dir"
  note "rerun with --execute to remove, adding --discard-repair-untracked if needed"
  exit 0
fi

remove_args=("$repair_worktree")
if [[ -s "$repair_untracked_file" ]]; then
  remove_args=(--force "$repair_worktree")
fi

note "removing repair worktree"
git -C "$target_worktree" worktree remove "${remove_args[@]}"
git -C "$target_worktree" worktree prune

note "removed frontend-repair worktree"
note "backup: $backup_dir"
