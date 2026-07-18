# Transport Studio Context

Transport Studio is a visual-first Monte Carlo particle transport workbench with a Rust physics spine and TypeScript domain contracts.

The glossary below is domain language for Transport Studio. It defines what the project means by these terms before implementation slices promote any new solver or runtime surface.

## Domain Glossary

### Editable Scene

The authoring-time scene a user edits in the workbench. It may contain incomplete, hidden, helper, decorative, or invalid entities; it is the source for validation and compilation, not the backend problem itself.

### Compiled Transport Problem

The validated, domain-significant problem produced from an Editable Scene for analysis or execution. It contains transport geometry, materials, sources, tallies, settings, and approved backend-facing data, but not viewport, React, selection, panel, render, or editor-only state.

### Compiled Problem Inclusion

The authoring intent that decides whether an editable entity participates in the Compiled Transport Problem. It is independent of viewport visibility, selection, and locking: a hidden entity may still compile, and a visible entity may be excluded.

### Run Session

The strict runtime-neutral lifecycle of one attempt to execute a successfully prepared Compiled Transport Problem. A Run Session assigns caller-owned identity, consumes one ordered asynchronous backend event sequence, and owns status, diagnostics, progress, presentation-safe results, provenance, terminal outcome, and its Run Input Record. Compilation and host-specific runtime adapters remain outside it.

### Run Input Record

The immutable record of exactly what a Run Session submitted. It contains the normalized Compiled Transport Problem and SHA-256 fingerprint, source Editable Scene revision and fingerprint, a lightweight submitted-scene snapshot, and fingerprinted references to any heavy assets. It proves exact submitted input; semantic equivalence between differently encoded inputs is a separate future concern.

### Native Execution Contract

The versioned, runtime-neutral message vocabulary used to submit a Compiled Transport Problem under a caller-owned Run Session ID and return an ordered canonical event sequence. Its Rust and TypeScript owners validate the same fixture-first contract; Tauri and other hosts only transport opaque requests and typed responses.

### Capability Status

A product-facing statement of what a solver, backend, or model facet may honestly do right now. Capability Status distinguishes runnable behavior from gated, stubbed, substrate, placeholder, future, or verification-only work so the workbench does not over-claim physics maturity.

### Relativistic Multiphysics

Coupled evolution of spacetime geometry, material motion, radiation fields, equation-of-state behavior, opacity behavior, and diagnostics in regimes where special or general relativity affects the model.

### Mathematical Physics Substrate

The documentation family for geometric representation, numerical evolution, differentiation, stochastic transport, and uncertainty methods shared by Relativistic Multiphysics and Monte Carlo transport. It is not a runtime package and does not merge the distinct meanings of Geometric Field and Transport Geometry.

### Differential Form

An alternating covariant Geometric Field of degree k, naturally pulled back and integrated over oriented k-dimensional domains. It is not interchangeable with an arbitrary tensor array or a cell-centered vector field.

### Exterior Calculus

The metric-independent calculus of Differential Forms using wedge products, pullbacks, the exterior derivative, and oriented integration. “External calculus” is not the canonical project term, and Exterior Calculus is not a synonym for ordinary vector calculus.

### Discrete Differential Form

A degree-specific value associated with an oriented vertex, edge, face, or cell and related through incidence. It represents an integral degree of freedom or cochain, not a point sample at a cell center.

### Oriented Cell Complex

A domain decomposition into oriented vertices, edges, faces, and cells with compatible incidence relations. A Cartesian grid does not become an Oriented Cell Complex merely by naming boundary faces.

### Hodge Star

The metric- and orientation-dependent correspondence between degree-k and complementary-degree Differential Forms. It is distinct from the metric-independent exterior derivative and may also encode material constitutive behavior.

### Compatible Field Calculus

A Mathematical Physics Substrate that preserves degree placement, orientation, incidence, pullback, integration, and declared metric duality across continuum and discrete field representations. It is not a public generic exterior-algebra package.

### Dynamical Spacetime Coupling

The first implementable Relativistic Multiphysics slice. Matter and radiation contribute stress-energy, spacetime geometry evolves from that source term, and the updated geometry feeds the next matter/radiation step.

### ADM

A 3+1 decomposition of general relativity that separates spacetime into spatial slices plus time evolution. It supplies the conceptual starting point for numerical relativity state, constraints, lapse, shift, and spatial metric language.

### BSSN

A conformal 3+1 formulation of Einstein-equation evolution that rewrites ADM-like variables for improved numerical stability in long-running spacetime simulations.

### BSSN 1+log/Gamma-driver Gauge

A common numerical-relativity gauge pairing: 1+log slicing for the lapse and Gamma-driver evolution for the shift. The gauge controls coordinates during spacetime evolution; it is not a physical force.

### Constraint Diagnostics

Measurements of whether evolved spacetime fields still satisfy the required Hamiltonian, momentum, and algebraic constraints. Constraint diagnostics are verification signals, not optional logging noise.

### Valencia GRHD

A flux-conservative formulation of general relativistic hydrodynamics. It evolves conserved quantities while using primitive variables such as density, pressure, and velocity for physical interpretation and equation-of-state calls.

### Conservative Variables

Numerical state variables arranged so finite-volume updates can preserve mass, momentum, and energy balances across cell faces.

### Hyperbolic Conservation Law

A physical evolution law whose local state, fluxes, sources, characteristic bounds, admissible states, and constraints can be defined independently of the numerical discretization used to evolve it. A Hyperbolic Conservation Law is not a mesh, Riemann solver, reconstruction method, or timestep scheme.

### Admissible State

A state satisfying the formulation-specific conditions required for physical and numerical meaning, such as positive density and pressure, subluminal velocity, Gray M1 realizability, or successful conservative-to-primitive consistency. Admissibility is not a universal clamp and does not by itself prove entropy stability.

### Constraint Lifecycle

The declared treatment of a mathematical or physical constraint: evolved as state, projected algebraically, solved through a dedicated operation, or monitored without mutation. The lifecycle keeps correction behavior and diagnostic evidence explicit without requiring a generic differential-algebraic-equation framework.

### Primitive Variables

Physical fluid variables such as rest-mass density, pressure, internal energy, and velocity. These are usually easier to interpret than conservative variables but may require nonlinear recovery from the evolved state.

### Primitive Recovery

The conversion from conservative variables back to primitive variables after an update. In relativistic hydrodynamics this is a first-class numerical problem because the inverse map is generally nonlinear.

### Gray M1 Radiation

A radiation moment model that evolves frequency-integrated radiation energy and flux, then closes the moment hierarchy with an M1 closure. It is more structured than diffusion but still not full angle- and frequency-resolved transport.

### Radiation Closure

The rule used to express higher-order radiation moments in terms of evolved lower-order moments. Closure choice defines what angular information the radiation model can and cannot represent.

### Stress-Energy Tensor

The relativistic source term representing energy density, momentum density, stress, and flux contributions from matter and radiation.

### AMR

Adaptive mesh refinement: a grid strategy that increases resolution where the solution requires it and uses coarser resolution elsewhere.

### Single-Block AMR Start

An AMR-aware first step that keeps one block active while preserving the domain language needed for later block refinement, prolongation, restriction, and regridding decisions.

### Monte Carlo Packet

A sampled radiation or particle history carrier. In the staged Relativistic Multiphysics plan, packets may bridge into stress-energy deposition or validation probes, but they are not the primary gray-M1 radiation evolution.

### Packet Deposition

The act of accumulating packet-carried energy, momentum, or source information into continuum fields or diagnostics.

### Verification Problem

A constrained scenario with an expected invariant, convergence behavior, or benchmark result. Verification problems test whether the numerical method was implemented as intended; they do not by themselves validate predictive use.

### Geometric Field

A field whose local components carry an explicit geometric representation, such as a coordinate chart, orthonormal frame, or gauge. A Geometric Field owns the rules required to compare or transform those components; it is not merely a grid of numbers with a descriptive label.

### Section

A Geometric Field viewed as assigning one fiber value to every point in its base domain. A local Section sample binds its components to the chart, frame, patch, or gauge in which those numbers are meaningful.

### Chart

A coordinate map valid on a declared part of a base domain. Chart support includes point maps, Jacobians, inverse maps where defined, basis-conversion rules, and an explicit singularity policy. A chart name alone is not support.

### Frame

A basis for field components at a point. A coordinate frame follows a Chart; an orthonormal frame is normalized against the local metric. Transforming frames changes components while preserving geometric invariants.

### Connection

The rule used to compare fiber values at neighboring base points and define a covariant derivative. Christoffel symbols describe the Levi-Civita connection in a coordinate basis; a gauge connection acts through its gauge representation.

### Gauge Transformation

A change of local representation in a gauge fiber that leaves gauge-invariant observables unchanged. The geometric-field substrate may represent gauge transformations and connections without implementing electromagnetic field dynamics.

### Bundle Transition

The representation change relating local trivializations on an overlap. Bundle Transitions must satisfy their declared compatibility rules; they are not ordinary data conversions that may discard chart, frame, patch, or gauge identity.

### Future Track

A named research or implementation direction that is intentionally outside the current slice. A Future Track is not missing work, implicit product scope, or evidence for a solver claim until it graduates through source-backed issue scope, tests, validation evidence, and capability-status updates.

## Future Track Ledger

Deferred Relativistic Multiphysics tracks are recorded in [Future-Track Notes Ledger](docs/architecture/future-track-notes-ledger.md). That ledger keeps strong-field production claims, primary Monte Carlo radiation evolution, Berger-Oliger AMR, curvilinear charts, GRMHD, validation campaigns, and tabulated EOS out of the first Dynamical Spacetime Coupling slice until each track has evidence and a narrower issue.
