# Transport Studio

A visual-first Monte Carlo particle transport workbench.

The goal is to provide game-engine-like authoring and visualization for transport problems while keeping the simulation core modular enough to grow toward MCNP/GEANT-like seriousness over time.

## Current first crack

- Bun workspace monorepo
- React/TypeScript studio app skeleton
- Tauri host placeholder
- Orthogonal packages for domain, geometry, materials, particles, sources, tallies, transport, validation, and visualization
- Toy visual photon transport backend stub

## Big architectural rule

Editor scene, render scene, compiled simulation problem, and result stream are separate concepts.

## Third-party software

Transport Studio currently links mathematical verification components in normal
builds and acts as their integration gateway; use of the verification problems
is optional. Review the
[third-party notices](THIRD_PARTY_NOTICES.md) before using those integrations.


## Frontend beef-up pass

The studio shell now includes:

- game-editor-style mode switcher
- project tree with scene stats and entity summaries
- richer inspector panel
- viewport HUD and overlay toggles
- bottom dock with run/tally/track/diagnostic tabs
- improved R3F scene styling, beam guides, tally overlays, and event markers

This is still a prototype UI: editing controls and the worker-backed run loop are next.

## Native Monte Carlo MWE

The minimal native backend slice is intentionally backend-first. The canonical
input is an `EditorScene` compiled into a `TransportProblem`, then submitted
through `runNativePhotonSmokeBackend(problem, runSessionId, bridge?)`. In browser-only
runtimes, the missing bridge is expected to produce `native.bridge.unavailable`;
the next integration point is a Tauri command or injected
`NativePhotonSmokeBridge` that transports the v2 ordered canonical-event response.
The live React app keeps the toy visual photon run path and now also exposes a
basic "Run Native MWE" action that exercises the compiled backend boundary and
surfaces the expected bridge diagnostic until that bridge is real.
