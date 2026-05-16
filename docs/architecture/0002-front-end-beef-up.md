# 0002 Front-End Beef-Up

This pass shifts the prototype from a plain scaffold toward a game-editor-like scientific workbench.

## Added UI concepts

- Mode switcher: design, probe, run, analyze, debug.
- Project tree with entity summaries, counts, visibility affordances, and kind badges.
- Inspector cards for geometry, materials, sources, and tallies.
- Viewport HUD with active mode, selection, sampled-track counts, and visibility toggles.
- Bottom dock with tabs for run, tallies, tracks, diagnostics, and console.
- Richer R3F scene rendering with source beam guide, tally overlays, labels, event markers, fog, lights, and selection wireframes.

## Still intentionally stubbed

- Entity editing mutators.
- Worker-backed async run loop.
- Real tally accumulation.
- Real cross-section data.
- Native/Tauri compute bridge.

The important thing is that the UI now has a place for these capabilities without mixing them into the transport kernel or domain model.
