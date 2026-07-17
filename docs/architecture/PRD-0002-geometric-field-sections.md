# PRD 0002: Geometric Fields and Sections

## Status

Draft for owner review. This document is the planning gate for the geometric-field program. No implementation issue should be opened and no code slice should begin until the draft documentation PR is approved.

## Problem Statement

Transport Studio has useful geometric fragments but no single owner for the meaning of field components.

- `SpacetimeCoordinate` carries a chart label, while vectors and tensors do not carry chart or frame identity.
- `MetricField` supplies metrics and Christoffel symbols, but coordinate transformations and representation rules are caller concerns.
- `DiagonalLocalFrame` handles one restricted local-frame case and only one transformation direction.
- `GridField3<T>` stores values on a uniform Cartesian grid without declaring whether those values are scalars, coordinate components, orthonormal-frame components, or gauge-dependent quantities.

This is tolerable while every production path uses one Cartesian chart. It becomes dangerous when chart, frame, and gauge adapters arrive: numerically identical arrays can represent mathematically different objects, and ordinary Rust types cannot detect the substitution.

The project needs a deep geometric-field module that makes section identity and transformations explicit without spreading fiber-bundle construction details through solvers or the product interface.

## Solution

Add a `geometric_field` facade inside `spacetime-physics`.

The facade will expose domain operations for sections, charts, frames, connections, transformations, and geometry-aware grid samples. A private generic `FiberBundle<T>` engine will own base-space identity, local trivializations, overlaps, transition rules, and representation dispatch. The generic construction is implementation machinery, not a product concept and not a required vocabulary for ordinary solver callers.

The first program is verification-only. It must prove the abstraction with four real adapter families:

1. Cartesian spacetime chart;
2. spherical spacetime chart;
3. metric-derived orthonormal frame; and
4. U(1) gauge geometry.

It must also prove nontrivial patch topology with the Hopf U(1) bundle over the two-sphere. Existing Cartesian evolution remains unchanged.

## Users And Outcomes

- Physics-kernel implementers can request field values in a named chart or frame without reproducing Jacobian and basis logic.
- Verification authors can test invariants, transition compatibility, covariant derivatives, holonomy, and topology through one geometry boundary.
- Grid consumers can opt into section-aware cell-center sampling without forcing metadata into every numerical scratch field.
- Reviewers can distinguish geometric substrate from curvilinear evolution, electromagnetic dynamics, or product solver capability.

## Architecture Decisions

### Facade And Private Engine

- `geometric_field` is the crate-facing module.
- `Section<T>` and section samples name the base point and requested local representation.
- Typed chart, frame, patch, and gauge identities replace unvalidated string or enum switching inside the module.
- `GeometryError` reports unsupported adapters, out-of-domain points, singular or ill-conditioned transitions, incompatible representations, nonfinite values, and failed compatibility checks.
- `FiberBundle<T>`, trivializations, transitions, and representation dispatch remain private.
- Each bundle supplies an associated base-point type. Spacetime and `S²` therefore exercise the same engine without adding a base-type parameter to every caller.

### Representation Scope

The first program supports the repository's existing rank-zero through rank-two values:

- `f64` scalars;
- `Vec3` and `FourVec`;
- a typed four-covector at the new facade boundary;
- `SpatialTensor2` and `SymmetricSpatialTensor2`;
- `CovariantTensor2` and `ContravariantTensor2`; and
- `num_complex::Complex64` for U(1) sections.

Mixed-index tensors, arbitrary tensor rank, and dimension-generic index algebra are deferred.

### Chart Identity And Conventions

- The module owns validated chart handles.
- Cartesian and spherical adapters bridge to their corresponding legacy `CoordinateChartKind` values.
- A legacy enum variant does not become supported merely because it has a name.
- Spherical spacetime coordinates use `[t, r, theta, phi]`, with polar `theta` and right-handed azimuth `phi`.
- Vector, covector, and rank-two transformations follow index variance.
- The standard spherical adapter returns typed domain errors at the origin and polar degeneracies. It never clamps coordinates or basis factors.

### Frames And Connections

- Automatic orthonormal frames use the 3+1 ADM lapse/shift decomposition and Cholesky factorization of the positive-definite spatial metric.
- Construction validates metric reconstruction, inverse consistency, conditioning, orientation, and time orientation.
- Metrics that do not admit the required foliation fail explicitly.
- `DiagonalLocalFrame` delegates to the new adapter during a compatibility period and is then retired through a later migration.
- Analytic pointwise Levi-Civita derivatives combine supplied coordinate partials with repository-owned Christoffel symbols.
- Discrete covariant finite differences are deferred to genuine spherical evolution work.

### Section-Aware Grid Boundary

- `SectionGrid3<T>` wraps existing `GridField3<T>` or `EvolutionGridField3<T>` storage.
- Initial sampling addresses an exact stored cell center and transforms the stored value into a requested supported representation.
- The wrapper makes no nearest-cell, interpolation, or convergence claim.
- Existing grids remain unchanged. Intrinsic section awareness is a later migration after the facade has real consumers.

### Gauge Geometry Boundary

- U(1) support includes complex sections, gauge transformations, connection one-forms, analytic covariant derivatives, and holonomy.
- One phase and connection-sign convention must be recorded and used consistently in implementation and fixtures.
- Electromagnetic fields, Maxwell evolution, charges, currents, and constrained field solvers belong to a separate future physics module that may consume this geometry.

## Verification Problems

### Chart And Grid Section

Sample an analytic vector or rank-two tensor section at Cartesian grid cell centers and express it in Cartesian and spherical components away from singularities.

Required evidence:

- Cartesian/spherical point round trips;
- Jacobian and inverse-Jacobian consistency;
- vector, covector, and rank-two component round trips;
- invariant contractions preserved across representations; and
- `SectionGrid3<T>` cell-center samples matching the analytic reference.

### Orthonormal Frame

Construct frames for Minkowski, the existing diagonal weak-field fixture, and an admissible off-diagonal ADM metric.

Required evidence:

- tetrad/coframe inverse consistency;
- reconstruction of the Minkowski frame metric;
- orientation and time-orientation checks;
- vector and tensor round trips;
- norm preservation; and
- legacy `DiagonalLocalFrame` delegation.

### Local U(1) Gauge Geometry

Transform a complex section and connection with a nonconstant gauge function.

Required evidence:

- invariance of the section norm;
- covariance of the analytic gauge derivative;
- compatible connection transformation; and
- gauge-independent closed-loop holonomy.

### Hopf Topology

Represent the Hopf principal U(1) bundle `S³ -> S²` through north and south local sections.

Required evidence:

- overlap transition and winding number one;
- compatible patchwise connections;
- globally consistent curvature;
- correct fiber action;
- numerical curvature-integration convergence to first Chern number one; and
- an independent Numerica cross-check through the existing mathematical verification gateway.

Numerica types and errors remain behind the gateway. Default geometry interfaces return repository-owned values.

## Planned Delivery Slices

After this draft PR is approved, create one umbrella issue and five sequential implementation issues. Each implementation PR branches from newly updated `main` after its predecessor merges.

1. Private bundle/section core, typed errors, representations, and Cartesian adapter.
2. Spherical adapter and chart/grid-section Verification Problem.
3. ADM/Cholesky orthonormal frames, `SectionGrid3<T>`, and frame Verification Problem.
4. U(1) sections, connections, covariant derivatives, and local gauge Verification Problem.
5. Hopf `S³ -> S²` topology and Chern-number Verification Problem with Numerica evidence.

Create two gated backlog issues at the same time:

1. migrate appropriate existing grids and coordinate consumers to intrinsic section/chart identity, then retire the legacy bridge;
2. implement genuine spherical evolution with multiple spatial patches, regularization, geometric measures, chart-aware operators, boundaries, conservation diagnostics, and convergence evidence.

Type-level chart/frame parameters remain an extension note, not an implementation issue.

## Acceptance And Validation

- Each code slice begins with focused failing tests at its named seam.
- Algebraic fixtures state conventions and tolerances beside the expected invariant.
- Singular, nonfinite, incompatible, and unsupported inputs have explicit negative tests.
- Each code PR passes formatting, clippy, and focused `spacetime-physics` tests.
- The completed sequence passes the repository Rust workspace test command.
- Verification reports remain absent from product solver registries and Run Sessions unless a later capability-review issue deliberately promotes them.

## Out Of Scope

- No frontend, TypeScript contract, backend registration, report surface, or product Capability Status change.
- No spherical storage or evolution, curvilinear fluxes, chart-aware boundary exchange, or discrete covariant derivative.
- No nearest-cell or trilinear section interpolation.
- No immediate rewrite of existing grid types or `SpacetimeCoordinate`.
- No arbitrary-rank tensor algebra or type-level frame propagation.
- No electromagnetic dynamics.
- No Kaluza-Klein or five-dimensional framework.

## Related Documents

- [ADR 0009: Geometric-Field Facade And Private Bundle Engine](ADR-0009-geometric-field-facade.md)
- [Geometric Fields, Bundles, And Sections Evaluation](geometric-fields-bundles-sections-evaluation.md)
- [Future-Track Notes Ledger](future-track-notes-ledger.md)
- [Symbolica And Numerica Verification Gateway](symbolica-numerica-integration-research.md)
- [Transport Studio Context](../../CONTEXT.md)
