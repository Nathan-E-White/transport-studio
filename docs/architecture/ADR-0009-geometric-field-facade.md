# ADR 0009: Geometric-Field Facade And Private Bundle Engine

## Status

Proposed. Acceptance is gated on owner review of the draft documentation PR.

## Context

Transport Studio's vectors, tensors, metric queries, local-frame helper, and Cartesian grids are individually useful but do not share an explicit model for chart, frame, or gauge identity. Extending them independently would repeat Jacobian, basis, connection, and transition logic across physics callers.

A generic fiber-bundle API could centralize that mathematics, but exposing its construction directly would make every caller learn base spaces, trivializations, overlaps, representations, and connections. That would be a wide interface with little protection for ordinary solver work.

The project has now selected enough concrete adapter targets to justify one internal engine: Cartesian and spherical charts, orthonormal frames, and U(1) gauge geometry, each with a named Verification Problem. These adapters remain planned until their sequential implementation slices land.

## Decision

Add a crate-facing `geometric_field` facade inside `spacetime-physics` and keep the generic bundle construction private.

The facade exposes:

- sections and local samples;
- validated chart, frame, patch, and gauge identities;
- representation-aware transformations;
- analytic pointwise connections and covariant derivatives;
- typed geometry failures; and
- opt-in section-aware cell-center grid sampling.

The private engine owns:

- `FiberBundle<T>`;
- the bundle's associated base-point type;
- local trivializations and overlaps;
- transition maps and compatibility checks; and
- transformation representations for supported field values.

The first implementation supports existing scalar, vector, covector, and rank-two spatial/spacetime values plus `Complex64`. It does not implement arbitrary-rank tensor algebra.

## Adapter Decisions

- Cartesian is the identity chart adapter.
- Spherical uses `[t, r, theta, phi]` and rejects its coordinate singularities explicitly.
- The orthonormal-frame adapter constructs 3+1-admissible tetrads through ADM lapse/shift decomposition and spatial Cholesky factorization.
- U(1) support is gauge geometry only; electromagnetic dynamics remain outside this module.
- The Hopf bundle over `S²` verifies nontrivial patch topology through north/south sections and first-Chern-number evidence.

## Compatibility Decisions

- Geometry-owned chart handles bridge only implemented Cartesian and spherical values to `CoordinateChartKind`.
- Existing enum names do not imply adapter support.
- `DiagonalLocalFrame` delegates to the new frame adapter before later retirement.
- `SectionGrid3<T>` wraps existing grid storage. Existing grid types do not gain mandatory geometry metadata in this program.
- Cell-center transformation is the only initial grid-sampling contract.

## Consequences

- Chart, frame, and gauge changes share one tested transition boundary.
- Solver callers use geometric operations rather than bundle construction vocabulary.
- Nontrivial topology tests the actual private seam rather than a special-purpose sidecar.
- Existing Cartesian evolution remains stable.
- The module creates no product solver capability by itself.
- Runtime validation remains necessary because type-level chart/frame parameters are deferred.

## Rejected Alternatives

### Expose `FiberBundle<T>` directly

Rejected because it makes the mathematical construction the caller interface and weakens module depth.

### Add geometry metadata to every grid now

Rejected because scratch fields and single-frame numerical work would pay a migration cost before they need transformations.

### Propagate chart and frame types through every generic

Rejected for the first program because it would spread type parameters through the solver stack before the facade stabilizes. It remains a possible extension.

### Claim spherical evolution from a spherical adapter

Rejected because coordinate transformation does not provide metric factors, conservative fluxes, regularity, boundaries, or convergence.

## Follow-Up Work

- Open the five sequential implementation issues only after the documentation gate is approved.
- Open gated backlog issues for intrinsic grid/chart migration and genuine spherical evolution.
- Revisit type-level frame identity after multiple production consumers demonstrate that runtime identities are insufficient.

## Related Documents

- [PRD 0002: Geometric Fields And Sections](PRD-0002-geometric-field-sections.md)
- [Geometric Fields, Bundles, And Sections Evaluation](geometric-fields-bundles-sections-evaluation.md)
- [Future-Track Notes Ledger](future-track-notes-ledger.md)
