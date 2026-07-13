# Relativistic Multiphysics Verification Ladder

Relativistic Multiphysics remains kernel substrate, not a runnable product solver. Its first required verification gate is:

```sh
cargo test -p spacetime-physics
```

Run that command from `apps/studio/src-tauri`. The versioned, machine-checked tier map is [relativistic-verification-ladder.json](../../fixtures/contracts/relativistic-verification-ladder.json).

## Required Tiers

| Tier | Evidence |
| --- | --- |
| Crate seam tests | Canonical kernel interface and primitive recovery behavior, including recoverable failures. |
| Fixed-background and component tests | Geodesic invariants, packet deposition, the Valencia GRHD toy step, gray-M1 radiation, and the AMR single-block adapter. |
| Coupled toy tests | IMEX matter-radiation exchange, BSSN source projection, and the controlled coupled-kernel toy. |

The integration test `verification_ladder.rs` checks that every named seam has a real test target, every required tier is present, and the product capability contract still marks `relativistic-multiphysics` as `gated` execution with a `substrate` claim.

Passing all required tiers is necessary but not sufficient for product promotion. Promotion also requires an explicit capability review that updates execution metadata, validation evidence, report language, and UI claims together. Until then, the product decision remains blocked and unsupported run attempts must continue to return diagnostics without partial physics output.

## Deferred Full-NR Gates

These are future gates, not omissions from the current harness:

- TOV/static-star validation
- Bondi/Michel accretion validation
- AMR convergence
- strong-field constraint preservation
- primary Monte Carlo radiation evolution
- tabulated EOS
- GRMHD tests

Their research and graduation criteria remain in the [Future-Track Notes Ledger](future-track-notes-ledger.md). None is implied by a green crate test run.
