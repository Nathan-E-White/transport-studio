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


## Frontend beef-up pass

The studio shell now includes:

- game-editor-style mode switcher
- project tree with scene stats and entity summaries
- richer inspector panel
- viewport HUD and overlay toggles
- bottom dock with run/tally/track/diagnostic tabs
- improved R3F scene styling, beam guides, tally overlays, and event markers

This is still a prototype UI: editing controls and the worker-backed run loop are next.
