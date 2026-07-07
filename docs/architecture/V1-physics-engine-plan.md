# V1 Physics Engine Completion Plan

## Summary

V1 completion means the repo has a coherent physics-engine substrate with all discussed model facets represented, even when a facet is capability-gated or placeholder-only.

V1 includes real runnable kernels for `mock-fields`, `gray-radiation-diffusion`, and minimal `eulerian-hydro`. Other discussed physics must remain visible as typed domain contracts, validation/reporting facets, solver registry entries, and explicit unsupported/gated diagnostics.

Safety gates are intentionally narrow. V1 does not need a broad policy engine; it needs clear diagnostics for unsupported regimes, especially criticality, so the app does not silently pretend to solve physics it does not solve.

## Model Facet Coverage

Every facet has a domain model, validation surface, report section, and solver-capability mapping.

| Facet | V1 Status | Required V1 Behavior |
|---|---:|---|
| Rad-hydro fields | Stubbed + partially runnable | Define radiation energy/flux/material coupling fields; gray diffusion reads/writes them. |
| Material state fields | Real substrate | Density, velocity/momentum, pressure, internal energy, electron/ion/radiation temperatures, ionization placeholder. |
| EOS refs | Stubbed + ideal-gas runnable | Support `ideal-gas` as runnable; table refs exist with domain metadata. |
| Opacity refs | Stubbed + gray runnable | Constant/mock opacity works; table/multigroup refs validate domains but do not require real data. |
| Electron/ion/rad temp models | Stubbed | Single-temperature and multi-temperature model types; coupling terms may be placeholder diagnostics. |
| Coupling graph | Real contract | Nodes/edges for radiation, hydro, EOS, opacity, temperature exchange, diagnostics; unresolved IO fails validation. |
| Table-domain validation | Real validation | Check requested density/temp/energy/group ranges against declared table domains. |
| Energy/mass diagnostics | Real diagnostics | Mass, material energy, radiation energy, total energy, conservation deltas. |
| Marshak waves | Real benchmark | Gray-diffusion benchmark fixture and regression tolerance. |
| Shocks | Real benchmark | Eulerian hydro shock-tube fixture and regression tolerance. |
| Ablations | Stubbed benchmark | Driven heating/ablation-like benchmark shape with diagnostics; not full production ablation. |
| Diffusion | Real kernel | Gray diffusion runnable; multigroup diffusion registered but gated. |
| Criticality | Gated placeholders | Fissile flags, criticality state, `keff`/`beta`/reactivity placeholders, subcritical margin diagnostics. |
| Orchestration | Real substrate | Solver registry, input bundles, result IO, comparison, provenance, stale-result fingerprints. |

## Solver Capability Registry

Implement a first-class solver registry in `transport-engine`. Each solver has `id`, `name`, status, supported problem facets, required inputs, emitted outputs, validation hooks, and reporting metadata.

Runnable in V1:

- `mock-fields`: deterministic synthetic field generator for UI, report, validation, and comparison flows.
- `gray-radiation-diffusion`: real gray diffusion kernel over existing grid/numerics primitives.
- `eulerian-hydro`: minimal finite-volume Eulerian hydro with ideal-gas EOS, CFL checks, mass/energy diagnostics, and shock tests.

Registered but gated in V1:

- `multigroup-radiation-diffusion`: model types, group opacity refs, validation, unsupported-run diagnostic.
- `discrete-ordinates`: angular quadrature model placeholder, validation, unsupported-run diagnostic.
- `implicit-monte-carlo`: radiation MC model placeholder, validation, unsupported-run diagnostic.
- `lagrangian-hydro`: mesh/material-motion model placeholder, validation, unsupported-run diagnostic.
- `ale-hydro`: rezoning/remap model placeholder, validation, unsupported-run diagnostic.
- `criticality-keff`: criticality request model, fissile detection, placeholder result fields, unsupported-run diagnostic.
- `point-kinetics`: kinetics parameter model placeholder, unsupported-run diagnostic.
- `depletion`: isotope evolution model placeholder, unsupported-run diagnostic.

Existing `native-rust-photon-smoke` remains intact and continues serving current photon transport smoke tests.

## Reporting And Validation

The report generator must output this tree for every experiment:

```txt
Experiment
 ├─ Geometry / Regions
 ├─ Mesh / AMR blocks
 ├─ Materials / EOS / opacity
 ├─ Radiation model
 ├─ Hydro model
 ├─ Coupling strategy
 ├─ Sources / drives
 ├─ Boundary conditions
 ├─ Diagnostics / tallies / probes
 └─ Solver run configuration
```

Validation must emit categorized diagnostics for:

- Schema validity
- Units validity
- Physics validity
- Table-domain validity
- Coupling validity
- Solver validity
- Safety/unsupported-regime validity
- Result staleness

Result staleness is fingerprint-based: geometry, region, mesh, material, EOS/opacity, source/drive, boundary, coupling, diagnostics, or run-config changes invalidate old result freshness.

## Implementation Stages

1. Baseline and document: re-check `git status --short --branch`, preserve unrelated dirty files, run current verification, then save this plan document.
2. Domain contracts: add `PhysicsProblemSpec`/`ExperimentSpec` contracts for all model facets, including stubbed facets. Keep compatibility with existing `TransportProblem`.
3. Validation categories: build a category-based validation pipeline that can validate real, stubbed, and gated physics uniformly.
4. `spacetime-physics` substrate: add reusable Rust modules for fields, material state, EOS/table refs, opacity/table refs, temperature models, coupling graph primitives, diagnostics, and benchmark specs.
5. Real gray diffusion: implement gray radiation diffusion with constant/mock opacity, boundary conditions, source terms, Marshak-wave fixture, diffusion benchmark, and energy diagnostics.
6. Real minimal Eulerian hydro: implement ideal-gas primitive/conservative conversion, CFL stepping, boundary conditions, shock-tube fixture, and mass/energy diagnostics.
7. Stubbed physics adapters: add typed adapters and unsupported-run diagnostics for multigroup diffusion, discrete ordinates, IMC, Lagrangian hydro, ALE hydro, criticality, point kinetics, depletion, and ablation beyond driven-heating fixtures.
8. Orchestration: add solver capacity registry, backend validation, input deck/bundle generation, run handles, result IO, result comparison, provenance, and fingerprinting.
9. Reporting: generate experiment reports that include both runnable physics and gated/stubbed facets, clearly marking what was solved, mocked, validated only, or unsupported.
10. Final hardening: keep existing photon smoke flow green, add focused tests for every new facet, and ensure unsupported solver requests fail with clear diagnostics rather than runtime surprises.

## Test Plan

- TypeScript tests for domain constructors, validation categories, report generation, solver matching, gated solver diagnostics, and stale-result fingerprints.
- Rust tests for field/state containers, table-domain checks, gray diffusion, Marshak benchmark, Eulerian hydro, shock benchmark, mass/energy diagnostics, and solver registry behavior.
- Integration tests for `mock-fields`, `gray-radiation-diffusion`, and `eulerian-hydro` from spec to result dataset/report.
- Gated-path tests proving each non-V1 solver has a registry entry, validates its model facet, appears in reports, and returns an unsupported diagnostic when run.
- Required verification: `cargo test --workspace`, `bun run typecheck:packages`, `bun run test`, plus focused app/reporting tests if UI-facing report surfaces change.

## Assumptions

- V1 includes real gray diffusion and minimal Eulerian hydro; it does not attempt real multigroup radiation, SN, IMC, Lagrangian/ALE hydro, criticality, point kinetics, or depletion.
- Stubbed facets are still real contracts: they must serialize, validate, report, and participate in solver-capability checks.
- Criticality stays placeholder-only in V1: fissile flags and diagnostics are allowed; real `keff` solving is not.
- “Safety validity” means unsupported/regime diagnostics for V1, not a large compliance framework.
- Existing dirty worktree state is user-owned and must be preserved by implementation chats.
