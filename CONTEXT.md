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

The lifecycle of one attempt to analyze or execute a Compiled Transport Problem. A Run Session includes selected backend, diagnostics, progress, result tracks or tallies, provenance, and UI outcome state, but not the native runtime adapter that happens to perform a call.

### Native Execution Contract

The versioned, runtime-neutral message vocabulary used to submit a Compiled Transport Problem under a caller-owned Run Session ID and return an ordered canonical event sequence. Its Rust and TypeScript owners validate the same fixture-first contract; Tauri and other hosts only transport opaque requests and typed responses.

### Capability Status

A product-facing statement of what a solver, backend, or model facet may honestly do right now. Capability Status distinguishes runnable behavior from gated, stubbed, substrate, placeholder, future, or verification-only work so the workbench does not over-claim physics maturity.

### Relativistic Multiphysics

Coupled evolution of spacetime geometry, material motion, radiation fields, equation-of-state behavior, opacity behavior, and diagnostics in regimes where special or general relativity affects the model.

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

### Future Track

A named research or implementation direction that is intentionally outside the current slice. A Future Track is not missing work, implicit product scope, or evidence for a solver claim until it graduates through source-backed issue scope, tests, validation evidence, and capability-status updates.

## Future Track Ledger

Deferred Relativistic Multiphysics tracks are recorded in [Future-Track Notes Ledger](docs/architecture/future-track-notes-ledger.md). That ledger keeps strong-field production claims, primary Monte Carlo radiation evolution, Berger-Oliger AMR, curvilinear charts, GRMHD, validation campaigns, and tabulated EOS out of the first Dynamical Spacetime Coupling slice until each track has evidence and a narrower issue.
