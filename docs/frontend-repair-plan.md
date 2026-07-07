# Frontend Repair Plan

Date: 2026-06-27
Worktree: `/Users/nathanwhite/Desktop/sicc-mcnp/devs/frontend-repair`
Branch: `fix/frontend-working-state`

## Current State

The frontend is not completely dead: `bun run typecheck` passes, and `bun run build` produces the studio app bundle. That means the main TypeScript and Vite build path is intact.

The broken part is the development and user-facing repair surface:

- `bun run test` fails immediately because the root `package.json` has no `test` script. Bun falls through to `/bin/test`, which exits with code 1.
- Running Vitest directly from the root executes tests in the wrong environment. React tests fail with `document is not defined`, because the monorepo has no root Vitest config using `jsdom`.
- Forcing `apps/studio/vite.config.ts` as the Vitest config also fails. Its `setupFiles` entry is intended to be app-relative, but from the monorepo root Vitest resolves `./src/test/setup.ts` as `/src/test/setup.ts`.
- Domain tests expose real contract bugs:
  - `TransportSource.test.ts` deep-imports `@transport/domain/transport/TransportGeometry`, but `@transport/domain` only exports `"."`.
  - `validateGeometry` builds `surfaceIds` and `regionIds` from `geometry.entities` instead of `geometry.surfaces` and `geometry.regions`.
  - `validateGeometry` does not report duplicate surface IDs or duplicate region IDs.
  - `validateMaterial` rejects invalid individual nuclide fractions but misses the invalid-total diagnostic when the total is `NaN`.
- The project tree is only partially live. `StudioApp` stores `project` without a setter, while project-tree actions mutate only the editor-store metadata. Delete, visibility, lock, and selection can change the tree state without changing the `Project` used by the viewport, inspector, validation, and run panel.
- There is no `projectMutations.ts`, `ProjectTree.test.tsx`, or `StudioApp.spec.tsx` in this worktree, so the most important editor surface has no full integration coverage.
- `main.tsx` imports style packs through `../../../packages/frontend/src/...`, but `packages/frontend` is not a declared workspace package. It builds today, but the boundary is brittle.

Direct evidence from this worktree:

- `bun run typecheck`: passes.
- `bun run build`: passes, with only the current Vite large-chunk warning.
- `bun run test`: fails because no root `test` script exists.
- `./node_modules/.bin/vitest run --reporter=dot`: 4 files fail, 9 pass; 6 tests fail, 95 pass.
- `./node_modules/.bin/vitest run --config apps/studio/vite.config.ts --reporter=dot`: all 13 suites fail before tests run because setup file resolution is wrong.

## Repair Plan

### 1. Restore One Root Test Runner

Make the root monorepo command the source of truth.

Required changes:

- Add root scripts:
  - `test`: `vitest run`
  - optionally `test:watch`: `vitest`
- Add a root `vitest.config.ts` that:
  - imports `defineConfig` from `vitest/config`
  - sets `test.environment` to `jsdom`
  - uses `apps/studio/src/test/setup.ts` as a root-relative setup file
  - mirrors the workspace aliases from `tsconfig.base.json`, including package deep-import aliases used by tests
- Keep `apps/studio/vite.config.ts` focused on app dev/build. If it keeps a `test` block, make it non-conflicting and path-correct, but the root config should be the command people actually use.

Acceptance:

- `bun run test` starts Vitest instead of `/bin/test`.
- React tests run with `document`, `screen`, and jest-dom matchers available.

### 2. Fix Domain Contract Failures Before Pruning Tests

The domain failures are not test noise; they expose broken validation semantics and module-resolution drift.

Required changes:

- Fix `validateGeometry` so its validation context uses:
  - `geometry.entities.map(entity => entity.id)` for entity IDs
  - `geometry.surfaces.map(surface => surface.id)` for surface IDs
  - `geometry.regions.map(region => region.id)` for region IDs
- Add duplicate detection for `geometry.surfaces` and `geometry.regions`, matching the existing entity duplicate diagnostic style.
- Fix `validateMaterial` so `material.nuclides.total.invalid` is emitted when the total is not finite or is less than or equal to zero.
- Resolve the `@transport/domain/transport/TransportGeometry` deep import. Prefer one of:
  - import required test helpers from `@transport/domain` if they are public API, or
  - add an explicit, intentional package subpath export/alias for domain transport modules.

Acceptance:

- Direct Vitest no longer reports the geometry, material, or domain deep-import failures.
- Tests assert real behavior rather than snapshotting accidental internals.

### 3. Make The Project Tree Mutate The Real Project

The current tree can look interactive while the actual app state stays unchanged. That is the front-end nonsense to kill first.

Required changes:

- Change `StudioApp` from `const [project] = useState(...)` to `const [project, setProject] = useState(...)`.
- Add `apps/studio/src/app/projectMutations.ts` with small pure helpers for:
  - rename entity
  - duplicate entity
  - delete entity
  - set visibility
  - set locked
  - create entity shell for existing entity kinds
  - update project `metadata.modifiedAt`
- Pass mutation callbacks from `StudioApp` into `ProjectTree`.
- Update project-tree action wiring so tree actions update both:
  - the editor store, for selection/hover/badges/transient UI state
  - the canonical `Project`, for viewport, inspector, validation, run panel, and stats
- Add real search input behavior instead of the current static `Search entities...` placeholder.
- Preserve the current scope boundary: make metadata CRUD real, but do not build a full physics property editor in this repair pass.

Acceptance:

- Hiding an entity in the tree hides it in the viewport.
- Locking an entity updates the tree and app model consistently.
- Deleting an entity removes it from the tree, viewport, inspector candidate list, validation, and run inputs.
- Selection remains synchronized between viewport and tree.
- Stats are derived from the current project, not a stale prop.

### 4. Add Focused Frontend Tests

Do not try to preserve every brittle temporary test. Keep a smaller suite that proves the editor surface works.

Required changes:

- Add `projectMutations` unit tests for create, rename, duplicate, delete, visibility, lock, and modified timestamp behavior.
- Add `ProjectTree.test.tsx` for:
  - grouped rendering
  - search filtering
  - row selection
  - action buttons dispatching expected callbacks
  - badge rendering from validation and visibility state
- Add or restore `StudioApp.spec.tsx` for the live left-panel flow:
  - selecting a row updates inspector context
  - hiding/deleting an entity changes the visible app state
  - running toy photons still works after tree state changes
- Keep existing domain tests after repairing the actual contract failures.

Acceptance:

- `bun run test` passes from the worktree root.
- The suite covers the actual repair surface without overfitting to private component internals.

### 5. Clean The Style-Pack Boundary

The style selector currently works by reaching directly into an undeclared `packages/frontend` source tree.

Required changes:

- Either make `packages/frontend` a real workspace package, for example `@transport/frontend`, with exports for style-pack types and `styles/packs`, or move those packs under `apps/studio/src` if they are app-only.
- Update imports in `main.tsx` and style-selector components to use the chosen package/app boundary.
- Add matching TypeScript and Vitest aliases only if the chosen boundary needs them.

Acceptance:

- No app code imports `../../../packages/frontend/src/...`.
- Typecheck, tests, and build resolve style packs through a stable boundary.

### 6. Verify With Build And Runtime Smoke

Final verification should prove both the mechanics and the UI.

Required commands:

- `bun run typecheck`
- `bun run test`
- `bun run build`
- `bun run dev`

Runtime smoke:

- Open the Vite app.
- Confirm the project tree renders.
- Select, hide, lock, duplicate, rename, and delete an entity.
- Confirm viewport, inspector, stats, diagnostics, and run controls reflect the same project state.

## Propagation To Other Worktrees

Frontend repair happens first in `devs/frontend-repair`. The sibling worktrees should receive the finished repair as a generated patch, not by redoing edits by hand.

The propagation helper is:

- `scripts/propagate-frontend-repair-delta.sh`

It generates a patch from the `frontend-repair` worktree using:

- base ref: `HEAD` by default
- path allowlist: `scripts/frontend-repair-paths.txt`
- untracked files under that allowlist included by default
- mode: check-only by default

The allowlist intentionally limits the patch to frontend-repair surfaces:

- root tooling and config: `package.json`, `bun.lock`, `tsconfig.base.json`, `vitest.config.ts`
- app frontend: `apps/studio`
- repair-related packages: `packages/domain`, `packages/editor-state`, `packages/frontend`, `packages/shared`, `packages/transport-visual`, `packages/validation`

Normal flow after the repair is complete:

```bash
scripts/propagate-frontend-repair-delta.sh --show-stat
scripts/propagate-frontend-repair-delta.sh --patch-out /tmp/frontend-repair.patch --show-stat
scripts/propagate-frontend-repair-delta.sh --apply
```

With no explicit targets, the script discovers all git worktrees and skips the source `frontend-repair` worktree. It notes dirty target worktrees and uses `git apply --check --3way` before applying, so overlapping edits fail visibly instead of being silently overwritten.

If a target branch has conflicting local work, stop and inspect the generated patch with:

```bash
scripts/propagate-frontend-repair-delta.sh --patch-out /tmp/frontend-repair.patch --show-stat
```

Then either resolve that branch manually or apply the patch to only the clean target worktrees by passing explicit target paths.

## Out Of Scope

- New physics algorithms.
- Worker/native transport repair.
- Full property editing for geometry/material/source/tally parameters.
- A broad design redesign.
- Large package architecture reshuffling beyond making the frontend/style-pack boundary stable.

## Definition Of Fixed

The frontend is fixed when the root verification commands pass and the left-panel editor surface is honest: every tree action that appears to mutate project state actually mutates the `Project` consumed by the rest of the app.
