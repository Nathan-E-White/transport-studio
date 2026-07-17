# Geometric Fields, Bundles, And Sections Evaluation

**Status:** Proposed architecture basis; no solver or product capability change

## Recommendation

Create a deep geometric-field module now that the project has selected four real adapter families and Verification Problems. Keep the generic bundle framework private and expose section-aware operations through a `geometric_field` facade.

This is a change from the earlier one-chart conclusion. A generic abstraction over a lone Cartesian implementation would have been hypothetical. Cartesian and spherical charts, metric-derived orthonormal frames, U(1) gauge geometry, and Hopf topology now create distinct transformation laws that can test one shared seam.

The abstraction earns its place only if it carries those laws. Renaming a Cartesian `Vec<T>` as a section would improve the vocabulary and very little else, which is a familiar fate for ambitious architecture.

## Repository Fit

The existing geometry is fragmented along useful but incomplete boundaries:

- `SpacetimeCoordinate` names a `CoordinateChartKind`; tensor components do not retain chart or frame identity.
- `MetricField` returns metric and connection values but does not own chart maps or basis transformations.
- `DiagonalLocalFrame` supports one restricted metric shape and one conversion direction.
- `GridField3<T>` and `EvolutionGridField3<T>` are Cartesian storage types without a transformation contract.
- the mathematical verification gateway already keeps third-party evidence types behind repository-owned reports, providing the correct pattern for a Numerica topology cross-check.

The geometric-field facade should follow the crate's existing deep-module pattern: callers request useful operations, while representation and storage choices remain local.

## Generic Framework

The private conceptual `FiberBundle<T>` engine represents:

- a bundle-defined base-point type;
- local trivializations over declared domains;
- overlaps and transition maps;
- a transformation representation for `T`;
- compatibility and cocycle checks; and
- optional connection behavior.

`T` alone is insufficient. The bundle owns an associated base-point type and a representation strategy for `T`; the eventual private Rust name or signature must make those inputs apparent. Scalars, vectors, covectors, rank-two tensors, and complex gauge sections transform differently. The engine therefore associates every supported value with a representation rather than assuming that generic storage implies generic geometry.

A `Section<T>` assigns a fiber value to each base point. A local sample binds its components to the chart, frame, patch, or gauge in which those numbers are meaningful. Transformations produce another local sample or a typed error; they do not discard representation identity.

## Why The Facade Is Deeper

The crate-facing interface asks for domain operations:

- sample a section in a requested supported representation;
- transform a local value across a chart, frame, patch, or gauge transition;
- take an analytic covariant derivative;
- transport around a closed loop and report holonomy; or
- report why a transition is outside its domain or numerically unsafe.

The implementation hides atlas lookup, Jacobians, inverse matrices, basis matrices, U(1) phase actions, patch transition functions, and storage delegation. Deleting the module after the planned adapters exist would force this complexity back into several callers, which is the useful version of the deletion test.

## Adapter Value

### Cartesian And Spherical Charts

The chart pair forces explicit point maps, Jacobians, inverse Jacobians, basis transformations, and singularity policy. Minkowski spacetime expressed in both charts provides analytic invariants without requiring curved-spacetime evolution.

The adapter does not constitute curvilinear evolution. Numerical evolution additionally requires chart-aware volume and face measures, derivative and flux operators, regularity, boundary exchange, conservation diagnostics, and convergence evidence.

### Orthonormal Frames

Local orthonormal frames allow fluid, radiation, opacity, and transport quantities to be interpreted in a physical frame while evolution may retain coordinate components. Automatic construction through a 3+1 ADM split fits the repository's existing lapse, shift, and spatial-metric language.

The frame adapter must verify reconstruction and orientation rather than treating any invertible matrix as a tetrad. A failed foliation or ill-conditioned factorization is a geometry error, not an invitation to continue with especially imaginative numbers.

### U(1) Gauge Geometry

Complex line-bundle sections and U(1) connections test a representation that is not a tensor Jacobian. Gauge-covariant derivatives and holonomy therefore provide independent evidence that the private engine models fiber actions rather than only coordinate changes.

This is geometry substrate. Electromagnetic field models, Maxwell evolution, sources, and constraints remain separate physics work.

### Hopf Topology

The Hopf principal U(1) bundle `S³ -> S²` prevents the implementation from assuming one global trivialization. North and south local sections, their overlap transition, compatible connections, curvature, and first Chern number test the patch machinery directly.

The topology problem uses analytic identities, numerical curvature integration, and an independent Numerica cross-check through the existing verification gateway. No third-party mathematical type crosses the geometry interface.

## Grid Boundary

`SectionGrid3<T>` is an opt-in wrapper around current Cartesian storage. It attaches the representation needed to transform an exact stored cell-center value.

The first wrapper does not interpolate and does not alter evolution operators. This keeps storage and geometry responsibilities distinct while establishing a real consumer of section-aware transformation.

An eventual migration may place section identity directly on appropriate production grids. That decision requires evidence from the wrapper and a separate compatibility plan; it should not be imposed on every scratch field in advance.

## Verification Burden

The module is justified only while the following evidence remains mandatory:

- chart and component round trips away from declared singularities;
- Jacobian inverse and invariant-contraction checks;
- tetrad reconstruction, orientation, inverse, and norm checks;
- local gauge covariance and gauge-invariant holonomy;
- transition winding and patch compatibility for Hopf topology;
- convergent first-Chern-number integration; and
- negative tests for unsupported, singular, incompatible, nonfinite, and ill-conditioned requests.

Verification evidence does not promote a runnable product solver. It establishes that the geometry machinery behaves as specified.

## Deferred Extensions

- intrinsic section identity in existing grid and coordinate types;
- retirement of the legacy chart enum bridge and `DiagonalLocalFrame`;
- multiple spatial patches and regularized axes;
- spherical storage and evolution;
- nearest-cell or interpolated section sampling;
- discrete covariant derivatives;
- mixed-index and arbitrary-rank tensors; and
- type-level chart and frame identities.

## Related Documents

- [PRD 0002: Geometric Fields And Sections](PRD-0002-geometric-field-sections.md)
- [ADR 0009: Geometric-Field Facade And Private Bundle Engine](ADR-0009-geometric-field-facade.md)
- [Future-Track Notes Ledger](future-track-notes-ledger.md)
- [Symbolica And Numerica Verification Gateway](symbolica-numerica-integration-research.md)
