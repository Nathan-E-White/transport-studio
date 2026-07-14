# Symbolica and Numerica Verification Gateway

**Updated:** 2026-07-14
**Status:** Implemented verification gateway; product capability remains gated

## Decision

Transport Studio links Symbolica and Numerica `2.1.0` in normal
`spacetime-physics` builds. Both dependencies disable upstream default features
and enable `no_gmp`. This avoids GMP, MPFR, and MPC FFI and avoids Symbolica's
default allocator replacement.

The crates are mathematical evidence tools, not domain interfaces. The public
boundary is the repository-owned Verification API. Requests and reports expose
stable problem IDs, evidence statuses, diagnostics, residuals, provenance, and
ordinary Rust values. Symbolica atoms, evaluators, Numerica hyperdual values,
and third-party error types do not cross that boundary.

This supersedes the earlier recommendation to pilot Numerica alone and defer
linked Symbolica. The project owner accepted the licensing risk and directed
the repository to operate as a gateway while that position is resolved. The
[third-party notice](../../THIRD_PARTY_NOTICES.md) is the controlling user-facing
warning; it grants no sublicense or warranty.

## Implemented evidence path

The mathematical gateway currently participates in four Verification Problems:

1. an analytic derivative identity;
2. Valencia primitive-to-conservative and flux Jacobians;
3. gray-M1 closure and IMEX source Jacobians; and
4. a fixed-background relativistic radiative shock tube.

The derivative and Jacobian problems compare three independent estimates:

- a Symbolica reference derivative evaluated in the dedicated math worker;
- a Numerica hyperdual derivative; and
- a centered finite difference over the repository-owned production map.

Reports retain crate versions, expression hashes, conventions, tolerances, and
non-secret Symbolica license state. Missing, rejected, or restricted licensing
is represented by stable diagnostics. No license key is stored or logged.

The math worker serializes Symbolica ownership because its restricted mode
permits one instance and one core per machine. Symbolica implements that limit
with a localhost TCP guard. Tests that exercise the worker therefore need a
runtime environment that permits localhost binding; a denied bind can be
reported upstream as if another instance were running.

## Radiative shock-tube boundary

The graduated fixed-background problem evolves repository-owned `f64` Valencia
hydrodynamics, gray-M1 moments, and bounded IMEX matter-radiation exchange in
one-dimensional Minkowski spacetime. Its versioned fixtures are:

- `hydrodynamic-limit`;
- `equilibrium`;
- `optically-thin`; and
- `optically-thick`.

The Verification Report exposes primitive-recovery, realizability, total
conservation, self-convergence, bounded-IMEX, and mathematical-cross-check
evidence. It does not promote BSSN evolution, AMR regridding, strong-field
geometry, frequency-dependent transport, or primary Monte Carlo radiation.

The problem remains absent from the product solver registry and Run Session.
The `relativistic-multiphysics` solver remains `gated` with a `substrate` claim.
A separate capability-review issue is required before any product-facing
promotion, even when every required verification tier passes.

## Build and binary impact

Measurements were taken on 2026-07-14 on macOS 26.5.2 arm64 with Rust 1.96.0.
They are local observations, not cross-platform budgets.

The test-profile measurement used the fresh issue-70 worktree at
`9be75de8b1a5cb7700886dc19b021cf555a6d871`; that worktree had no `target`
directory before the first command. The optimized worker measurement used the
same worktree with an empty release profile. For the application comparison,
the head was built first, then a detached worktree at
`b354b06e7419bac1f0a62dade34c69da82d2d7ca` was built into the same target
directory so both executables used the same toolchain and release settings. The
exact baseline command, run from its `apps/studio/src-tauri` directory, was
`CARGO_TARGET_DIR=/Users/nathanwhite/Desktop/sicc-mcnp/worktrees/issue-70/apps/studio/src-tauri/target CARGO_INCREMENTAL=0 cargo build -p transport-studio --release`.

| Measurement | Command or comparison | Result |
| --- | --- | --- |
| Clean test-profile build | `CARGO_INCREMENTAL=0 CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 cargo test -p spacetime-physics --test verification_ladder radiative_shock_tube_is_required_evidence_without_product_promotion -- --exact --test-threads=1` | Cargo build time 41.56 s |
| Immediate test-profile rebuild | The exact command above after the contract edit | Cargo build time 1.11 s |
| Clean optimized math worker | `CARGO_INCREMENTAL=0 cargo build -p spacetime-physics --release --bin spacetime-math-worker` | Cargo build time 3 min 16 s; wall time 197.00 s |
| No-op optimized math-worker rebuild | Same command with unchanged inputs | Cargo build time 0.35 s; wall time 0.38 s |
| Optimized math-worker size | `target/release/spacetime-math-worker` | 12,389,408 bytes |
| Product executable size | `CARGO_INCREMENTAL=0 cargo build -p transport-studio --release` at head `9be75de8b1a5cb7700886dc19b021cf555a6d871` versus the shared-target baseline command above at `b354b06e7419bac1f0a62dade34c69da82d2d7ca` | 8,504,864 versus 8,503,376 bytes; +1,488 bytes (+0.0175%) |

The small product-binary delta is consistent with release dead-code elimination:
the application depends on `spacetime-physics`, so the gateway crates participate
in compilation and linking, but the UI does not call the Verification API. The
dedicated math worker carries the material executable-size cost. The comparison
also includes repository changes after `b354b06`, so the 1,488-byte delta is an
aggregate upper bound rather than a Symbolica-only attribution.

## Final mutation evidence

The graduation campaign targeted 51 mutations in radiative Verification Report
assembly and the recovery, realizability, conservation, convergence, and
bounded-IMEX acceptance predicates. The ladder test alone caught 22 mutations;
27 survived because a valid fixture cannot distinguish corrupted rejection
branches. Rerunning those survivors against the focused radiative unit and
integration suite caught all 27. The remaining two generated mutations tried to
return `Default` from types that intentionally do not implement `Default` and
were unviable compile failures. No meaningful survivor remains.

## Excluded integration surfaces

The gateway does not enable or expose:

- Symbolica JIT or native code generation;
- CUDA generation;
- dynamic-library generation;
- Python, NumPy, or Wolfram bindings;
- Symbolica or Numerica types in `transport-engine`, serialized contracts, or
  UI-facing state; or
- replacement of production Valencia or gray-M1 state with generic third-party
  scalar types.

These exclusions keep deletion and future license migration tractable. Removing
the gateway should remove mathematical evidence adapters, not move the physics
model or alter product execution contracts.

## Architecture follow-up

The Verification Report now has several problem-specific optional payloads, and
the flat and radiative shock-tube implementations retain some parallel utility
code. That is acceptable at the verification boundary but should be revisited
before adding another large problem. The next architecture issue should prefer
a typed problem-result envelope or problem-owned report assembly without
weakening stable diagnostics and provenance.
