# Architecture Deepening Research

Date: 2026-07-10

## Question

Which architecture problems should be split into orthogonal implementation issues before the next code pass, while keeping Tauri as the current desktop adapter instead of the center of the stack?

## Primary Sources

- Repo decisions: [ADR 0001](ADR-0001.md), [ADR 0002](ADR-0002.md), [ADR 0003](ADR-0003.md), [ADR 0007](ADR-0007.md).
- Editor and compile source: `apps/studio/src/components/project-tree/ProjectTree.tsx`, `apps/studio/src/state/editor/visibility.ts`, `packages/domain/src/compile/CompileEditorScene.ts`, `packages/domain/src/compile/CompileEditorScene.test.ts`.
- Run and native bridge source: `apps/studio/src/app/StudioApp.tsx`, `apps/studio/src/app/nativePhotonSmokeTauriBridge.ts`, `packages/transport-worker/src/index.ts`, `apps/studio/src-tauri/src/mod.rs`, `apps/studio/src-tauri/tauri.conf.json`.
- Capability and engine source: `packages/domain/src/physics/PhysicsProblem.ts`, `docs/architecture/V1-physics-engine-plan.md`, `apps/studio/src-tauri/crates/transport-engine/src/lib.rs`, `apps/studio/src-tauri/crates/transport-engine/Cargo.toml`, `apps/studio/src-tauri/crates/spacetime-physics/src/lib.rs`.
- Live tracker context: [#13 End-to-End Coupled Kernel Toy](https://github.com/Nathan-E-White/transport-studio/issues/13), [#14 Product Gating + Capability Status](https://github.com/Nathan-E-White/transport-studio/issues/14), [#15 Tiered Verification Harness](https://github.com/Nathan-E-White/transport-studio/issues/15).
- Tauri native-runtime behavior: [Tauri Calling Rust from the Frontend](https://v2.tauri.app/develop/calling-rust/) and [Tauri Configuration Reference](https://v2.tauri.app/reference/config/).

Snapshot caveat: evidence was checked against the local repo and live issues on 2026-07-10. GitHub issue state may drift after this note.

## Findings

### 1. Compiled Problem Inclusion is the editor-to-problem seam

ADR 0001 says the Editable Scene is not the simulation problem and shows the intended pipeline from Editable Scene through validation into a compiled transport problem and backend protocol. ADR 0003 sharpens that rule: viewport visibility, selectability, locking, helper-only state, and compiled problem inclusion are separate editor concepts; it explicitly says a hidden object may still compile and an excluded object may still be visible.

The current app has part of this model in editor state. `EditorEntityViewFlags` includes `includedInCompile`, defaults it to true, and has helper-only defaults that exclude helper entities. Project-tree actions can dispatch `set-included-in-compile`, and badges already know how to show an excluded state.

The compile path still uses `visible` as the inclusion rule. `compileEntity(...)` in `CompileEditorScene.ts` returns no geometry for hidden entities and emits `entity.hidden.skipped`; the matching test currently asserts that behavior. `ProjectTree.tsx` also wires `onCompileInclusionChange={() => undefined}`, so the UI affordance does not persist into the project model.

Research implication: this is one problem, not three. The real issue is to make Compiled Problem Inclusion a persisted editor/project fact and teach the compiler to honor it. Visibility should remain a viewport concern.

### 2. Studio run orchestration is coupled to the UI shell

ADR 0002 intentionally left the native/Tauri compute bridge stubbed and says the bottom dock can show mock run, tally, diagnostic, and console data during the prototype phase. The current `StudioApp.tsx` now owns toy run behavior, native compile, native backend invocation, diagnostic conversion, track conversion, active backend, mode changes, bottom-tab outcomes, and clear-results behavior.

The native bridge boundary is already narrower than the app shell. `packages/transport-worker/src/index.ts` accepts an optional `NativePhotonSmokeBridge` and returns a structured `native.bridge.unavailable` diagnostic when no bridge is available. `apps/studio/src/app/nativePhotonSmokeTauriBridge.ts` is the only frontend app file that imports `@tauri-apps/api/core` and converts the Tauri `invoke` command into that bridge interface.

Official Tauri docs describe commands/events/channels as frontend-to-Rust IPC mechanisms, not as domain orchestration semantics. The Tauri config docs describe `beforeDevCommand` and `devUrl` as dev-time launch configuration. The repo's `tauri.conf.json` uses those Tauri mechanisms to run `bun dev` and load `http://localhost:5173`, which is runtime adapter behavior, not a Run Session domain model. The Tauri host module already says the Monte Carlo runtime lives in `transport-engine` and the host stays an adapter instead of the physics implementation.

Research implication: extract a runtime-neutral Run Session module. It may accept a native bridge adapter, but it should not import Tauri or know Tauri launch semantics. `StudioApp` should become a UI adapter over run-session outcomes.

### 3. Solver capability facts need one shared contract fixture

Issue #14 requires product-facing capability metadata to keep unsupported GR rad-hydro and related future work gated or substrate until evidence supports promotion. Issue #15 requires a verification ladder before product promotion. Issue #13 is the coupled-kernel proof that #14 and #15 depend on.

Today, TypeScript and Rust both encode V1 solver capability facts. `V1_SOLVER_CAPABILITIES` in `PhysicsProblem.ts` lists runnable solvers (`mock-fields`, `gray-radiation-diffusion`, `eulerian-hydro`) and gated solvers, including `criticality-keff`, `point-kinetics`, and `depletion`. `validatePhysicsProblem(...)` emits `physics.solver.gated` for non-runnable solver IDs. The Rust `transport-engine` crate has a parallel `v1_solver_registry()` with the same intended runnable and gated split, and `prepare_v1_input_bundle(...)` returns `solver.gated` for non-runnable entries.

Because those facts live in separate code registries plus docs/tracker language, they can drift. The existing issue chain makes drift expensive: a solver promoted in one place but gated in another undermines product gating and verification evidence.

Research implication: create a versioned fixture such as `fixtures/contracts/v1-solver-capabilities.json` and test both TypeScript and Rust registries against it. Keep the fixture outside Tauri code so capability truth belongs to domain/engine contracts, not desktop runtime wiring.

### 4. `transport-engine` needs internal modules behind its public facade

ADR 0001 wants backends behind a stable protocol boundary. The `transport-engine` crate currently has no dependencies, which is good for runtime neutrality, but its root `src/lib.rs` is 1,499 lines and contains public DTOs, photon smoke execution, validation, geometry intersection math, V1 solver registry, V1 orchestration, result comparison, diagnostics, and tests in one file.

The public functions are useful seams: `run_photon_smoke(...)`, `v1_solver_registry()`, `prepare_v1_input_bundle(...)`, `run_v1_solver_bundle(...)`, and `compare_v1_results(...)`. The risk is not the facade itself; the risk is that internal responsibilities are compressed until every future change touches one file and tests start reaching into internals.

The repo already has a local precedent for this extraction shape: `spacetime-physics/src/lib.rs` declares purpose-named internal modules and re-exports the public surface from the crate root. That pattern keeps callers stable while allowing the internals to be navigable.

Research implication: split internals by purpose while preserving the root crate facade. The TDD rule should stay public-seam-first: add or strengthen characterization tests through exported crate APIs before each extraction, and skip any extraction that cannot be pinned from the facade.

## Orthogonal Issue Set

1. Make Compiled Problem Inclusion The Editor-To-Problem Seam.
2. Extract A Runtime-Neutral Studio Run Session Module.
3. Add Shared Solver Capability Contract Fixtures.
4. Split `transport-engine` Internals Behind Its Public Facade.

Issues 1 and 3 are unblocked. Issue 2 should follow issue 1 because run-session extraction depends on compile semantics being honest. Issue 4 should follow issue 3 because engine modularization should preserve the shared capability contract while moving internals.

## Runtime-Neutral Tauri Rule

Tauri is the current native desktop adapter. It provides IPC and launch configuration for the desktop shell, but run orchestration, capability status, compile inclusion, and compiled problem semantics should remain usable without importing Tauri or assuming Tauri launch behavior.
