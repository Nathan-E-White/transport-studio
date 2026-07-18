# PRD 0003: Constraint-Aware Hyperbolic Conservation Laws

## Status

Full draft for owner review. This PRD records the next Mathematical Physics
Substrate seam. It does not authorize implementation issues or product capability
changes.

## Problem Statement

Transport Studio has the beginnings of two hyperbolic physics families, but their
common physical structure is not yet a module interface.

- Valencia GRHD exposes conservative and primitive states, primitive recovery, and
  a one-dimensional finite-volume tracer bullet whose Rusanov flux, reconstruction,
  boundary handling, and stepping policy are fixed inside one function.
- Gray M1 exposes moment closure, flux Jacobian evidence, source coupling, and
  realizability diagnostics, but not an evolution adapter using the same physical-law
  seam as Valencia.
- BSSN algebraic projection, four-velocity normalization, primitive recovery, and
  M1 realizability use different correction and failure vocabularies.
- Conservation, entropy, positivity, realizability, and constraint evidence are
  reported by several callers rather than owned by a common physical-law interface.

Without a deeper module, a future DG implementation would either duplicate physics
or reach into the existing finite-volume function. That would make the proposed
discretization seam fictional.

## Solution

Define a crate-internal hyperbolic-law seam in `spacetime-physics`. It separates the
physical conservation law from spatial discretization and timestep policy.

The seam presents repository-owned operations for:

- conservative state validation;
- conversion to physical or primitive state where the formulation requires it;
- pointwise physical flux and source evaluation;
- characteristic-speed bounds needed by numerical fluxes and timestep policy;
- admissibility and entropy evidence;
- named constraint outcomes; and
- typed failures with enough context for verification reports.

Valencia GRHD and Gray M1 are the first two adapters. The current finite-volume
Valencia tracer bullet delegates its pointwise physics to the Valencia adapter while
retaining its current reconstruction, Rusanov, boundary, and stepping behavior.
Gray M1 gains an adapter for its homogeneous flux/source and realizability contract;
this PRD does not claim a production radiation evolution method.

## Users And Outcomes

- Numerical-method implementers can evaluate the same physical law through current
  finite-volume and later DG discretizations.
- Physics implementers can add formulation-specific state and recovery logic without
  exposing numerical flux policy.
- Verification authors can compare conservation, admissibility, entropy, and
  constraint evidence across physics families.
- Product reviewers can distinguish a verified physical-law kernel from a promoted
  solver capability.

## Module Boundary

### Crate-Internal Interface

The first implementation issue should design the exact Rust types, but the interface
must contain these behaviors and no more:

- inspect and validate one local conservative state;
- evaluate directional physical flux for that state;
- evaluate local algebraic source terms separately from spatial fluxes;
- return a safe upper bound on relevant characteristic speed;
- report whether the state lies in the formulation's admissible set;
- report entropy data only when the formulation supplies a documented entropy pair;
- classify each adapter-declared constraint as evolved, projected, solved, or monitored; and
- return repository-owned errors rather than library or solver-internal types.

The interface must not own mesh topology, reconstruction, quadrature, Riemann-solver
selection, boundary conditions, CFL policy, timestep integration, or report/UI
serialization.

### Private Implementation

Adapters may privately own:

- conservative-to-primitive recovery and EOS calls;
- analytic or numerical Jacobians and eigenvalue estimates;
- formulation-specific normalization and realizability rules;
- entropy variables and entropy fluxes;
- correction/projection algorithms; and
- detailed convergence diagnostics translated into repository-owned evidence.

Jets, dual numbers, symbolic expressions, and arbitrary tensor machinery remain
private to their supplying modules.

## First Adapters

### Valencia GRHD

The Valencia adapter owns local conservative/primitive conversion, physical flux and
source evaluation, characteristic bounds, density/pressure/velocity admissibility,
and primitive-recovery diagnostics.

The existing `valencia_flat_finite_volume_step_1d` remains a compatibility path. It
must delegate pointwise physical evaluation through the adapter without changing
its current piecewise-constant reconstruction, Rusanov flux, end-cell policy, or
verification results in the first migration.

### Gray M1 Radiation

The Gray M1 adapter owns local moment state, closure evaluation, homogeneous flux and
source terms, characteristic bounds, and realizability evidence.

The adapter must preserve the distinction between:

- admissible input;
- a state that can be projected into the realizable set;
- a rejected nonfinite or physically invalid state; and
- a verification-only flux/source evaluation versus a complete evolution method.

### Cross-Domain Constraint Vocabulary

`CONTEXT.md` owns Constraint Lifecycle as cross-domain vocabulary. BSSN determinant
and trace-free conditions and four-velocity normalization may use that vocabulary,
but they do not cross this module's interface and do not implement one generic DAE
trait. This module owns declarations only for its Valencia and Gray M1 adapters,
including primitive-recovery consistency and M1 realizability.

A constraint declaration records whether the formulation:

- **evolves** it as part of the state;
- **projects** state algebraically back onto the constraint set;
- **solves** it through a dedicated recovery or implicit operation; or
- **monitors** it without automatic correction.

## Entropy And Invariant-Domain Policy

- Entropy evidence is optional per adapter and must name the mathematical entropy
  pair and sign convention.
- An entropy-capable adapter evaluates physical entropy data; a discretization owns
  the discrete entropy-stability claim.
- Admissibility is formulation-specific. There is no universal `is_physical` rule.
- Positivity, M1 realizability, velocity bounds, and recovery consistency are
  reported independently even when one failure implies another.
- High-order invariant-domain or convex-limiting methods belong to the later
  discretization PRD. This module supplies the admissible set they must preserve.

## Verification Problems

### Shared Physical-Flux Fixtures

- Evaluate known Valencia and Gray M1 states in each coordinate direction.
- Compare adapter results with existing repository formulas and Jacobian evidence.
- Prove that the current Valencia finite-volume path returns unchanged results after
  delegation.

### Smooth Manufactured Problems

- Supply analytic state and derivative data for smooth Valencia and M1 fixtures.
- Evaluate physical flux divergence and source residual independently of a mesh.
- Compare analytic, Symbolica/Numerica, and finite-difference derivatives through
  the existing mathematical verification gateway where supported.

### Discontinuities And Admissibility

- Retain existing hydrodynamic shock/contact fixtures.
- Include vacuum-adjacent or low-density failure cases without silently clamping.
- Exercise M1 states inside, on, and outside the realizability boundary.
- Record primitive-recovery success, convergence, corrected state, and failure as
  distinct outcomes.

### Conservation And Entropy Evidence

- Verify local flux antisymmetry across a shared face in the compatibility
  finite-volume adapter.
- Preserve existing global conservation budgets within documented tolerances.
- For adapters with an entropy pair, verify pointwise identities separately from
  the discrete entropy inequality.
- Never infer entropy stability from conservation alone.

### Constraint Lifecycle

- Verify each declared constraint has exactly one lifecycle classification.
- Prove projection reports both pre- and post-projection residuals.
- Prove solved constraints retain convergence or failure diagnostics.
- Prove monitored constraints do not mutate state.

## Planned Delivery Slices

These slices remain planning guidance until the documentation PR is approved and a
later issue campaign is explicitly authorized.

1. Characterize existing Valencia finite-volume, primitive-recovery, M1 closure,
   realizability, and conservation behavior through focused tests.
2. Add repository-owned local state, flux/source, admissibility, entropy, and error
   vocabulary; use the glossary-owned Constraint Lifecycle for Valencia and M1
   declarations only, without changing solver registries.
3. Implement the Valencia adapter and delegate the existing compatibility path.
4. Implement the Gray M1 adapter and shared verification fixtures.
5. Consolidate verification evidence and publish the separate DG activation brief.

## Acceptance And Validation

- Valencia and Gray M1 are two real adapters at the same physical-law seam.
- Existing finite-volume and radiative-shock Verification Problems remain stable.
- Physical flux/source logic is testable without allocating a grid or selecting a
  numerical flux.
- Reconstruction, Riemann, boundary, and timestep policies do not cross the module
  interface.
- All correction, projection, recovery, and rejection paths return explicit evidence.
- Focused `spacetime-physics` tests, formatting, clippy, and the repository Rust
  workspace test command pass before implementation PR completion.
- No capability registry, frontend, backend registration, report surface, or Run
  Session changes.

## Out Of Scope

- No DG, FEEC, unstructured mesh, or generic weak-form implementation.
- No new Riemann solver, reconstruction method, limiter, or boundary scheme.
- No generic PDE, DAE, state-vector, or arbitrary-rank tensor framework.
- No GRMHD evolution or magnetic divergence-control claim.
- No production Gray M1 or GRHD solver promotion.
- No automatic replacement of every correction path with projection.
- No Kaluza-Klein or five-dimensional framework.

## Related Documents

- [Mathematical Physics Substrate Architecture Proposal](mathematical-physics-substrate-proposal.md)
- [Mathematical Physics Substrate Research Note](mathematical-physics-substrate-research.md)
- [PRD 0001: Relativistic Multiphysics Domain Spine](PRD-0001-relativistic-multiphysics-spine.md)
- [PRD 0002: Geometric Fields And Sections](PRD-0002-geometric-field-sections.md)
- [Future-Track Notes Ledger](future-track-notes-ledger.md)
- [Transport Studio Context](../../CONTEXT.md)
