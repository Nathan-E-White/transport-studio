# Developer hygiene

Run `bun run hygiene:size` for a read-only report of free disk space, registered worktrees, duplicate dependencies, generated outputs, checkout-local Rust targets, and named external Cargo caches. The command reports absent optional paths as skipped and never fetches, deletes, prunes, or rewrites state.

Tauri development, Tauri builds, Rust checks, and Rust tests route Cargo output to named paths below `/tmp/transport-studio-cargo-target`. Override the corresponding `TRANSPORT_CARGO_TARGET_*` variable when a durable or larger cache volume is preferable. Do not add checkout-local `target`, dependency, coverage, or generated output to Git.

Worktree retirement is separate from cache cleanup. Preview registered sibling worktrees with `bun run hygiene:worktrees -- --worktree ../devs/example`. Add `--execute` only after reviewing the classification and archive destination. Clean worktrees must be merged into `origin/main`. Dirty worktrees are archived under `../archives/worktrees` with status metadata, staged and unstaged binary patches, untracked files, and a verified Git bundle before removal. The branch is retained. The command refuses the primary checkout, unknown paths, and clean unmerged branches.
