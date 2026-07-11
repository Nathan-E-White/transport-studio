# Future-Track Notes Ledger

## Status

Accepted as the issue #2 deferred-track ledger.

## Purpose

This ledger records research and domain notes for Relativistic Multiphysics tracks that are intentionally outside the first Dynamical Spacetime Coupling slice.

The first slice remains crate-kernel work: BSSN geometry evolution language, 1+log/Gamma-driver gauge, Valencia-shaped hydrodynamics, gray M1 radiation, packet deposition as a bridge, and an AMR-aware single-block start. Product-facing strong-field or production numerical-relativity claims remain deferred until capability metadata, validation evidence, reports, and UI language move together.

Future agents should treat the tracks below as explicitly deferred work, not as missing implementation inside issue #1 or the first kernel slice.

## Graduation Rule

A future track may become implementation scope only when it has:

- a named issue or ADR that narrows the track into one reviewable slice;
- source-backed formulation choices or a clearly documented research gap;
- domain terms that distinguish it from existing Transport Studio concepts;
- test seams and validation evidence appropriate to the claim being promoted;
- capability-status language that prevents unsupported product-facing claims.

## Future Tracks

### Strong-Field Production Claims

#### Research Note

Strong-field production claims require more than the presence of BSSN variables or a coupled-step toy. The issue #1 research spine already cites BSSN, moving-puncture-style gauge language, and numerical-relativity testbeds. Additional high-trust anchors include the Einstein Toolkit infrastructure paper and the first binary-black-hole evolution papers, which show that production strong-field numerical relativity is an ecosystem of formulation, gauge, mesh, boundary, constraint, and validation choices.

Sources:

- [Baumgarte and Shapiro, "On the Numerical Integration of Einstein's Field Equations"](https://arxiv.org/abs/gr-qc/9810065)
- [Alcubierre et al., "Gauge conditions for long-term numerical black hole evolutions without excision"](https://arxiv.org/abs/gr-qc/0206072)
- [Babiuc et al., "Implementation of standard testbeds for numerical relativity"](https://arxiv.org/abs/0709.3559)
- [Loeffler et al., "The Einstein Toolkit: a community computational infrastructure for relativistic astrophysics"](https://arxiv.org/abs/1111.3344)
- [Pretorius, "Evolution of Binary Black Hole Spacetimes"](https://arxiv.org/abs/gr-qc/0507014)

#### Domain Note

Strong-field production claim means a product-facing statement that Transport Studio can model highly curved, dynamically evolving spacetime regimes with reviewable numerical evidence. It must not be confused with:

- a BSSN data structure;
- a flat-space preservation test;
- a toy coupled kernel;
- a visualization of metric fields;
- a benchmark-runnable or substrate-only solver.

#### Why It Is Outside The First Slice

The first slice establishes a kernel boundary and diagnostics language. It does not establish production boundary conditions, mesh infrastructure, convergence campaigns, constraint-preservation evidence, or domain-specific validation cases for strong-field predictions.

#### Graduation Criteria

- define the exact strong-field regime and product claim;
- add verification cases with expected invariants, convergence behavior, or literature comparisons;
- publish constraint, conservation, and failure diagnostics;
- update solver capability status from substrate/gated only after evidence exists;
- keep UI/report copy aligned with the validation level.

### Primary Monte Carlo Radiation Evolution

#### Research Note

Transport Studio already uses Monte Carlo packet language for sampled histories and packet deposition. The issue #1 spine deliberately keeps packets as a bridge into continuum fields while gray M1 remains the staged primary radiation evolution. Making Monte Carlo the primary radiation evolution would require a separate method choice, variance-control strategy, coupling strategy, and reproducibility policy. Current repo research does not yet choose that method, so this track carries a research gap.

Sources and research gap:

- [OpenMC, "Random Number Generation"](https://docs.openmc.org/en/stable/methods/random_numbers.html)
- [OpenMC, "Neutron Physics"](https://docs.openmc.org/en/stable/methods/neutron_physics.html)
- [Fleck and Cummings, "An implicit Monte Carlo scheme for calculating time and frequency dependent nonlinear radiation transport"](https://doi.org/10.1016/0021-9991(71)90015-5)
- Research gap: select the radiation Monte Carlo method, coupling strategy, variance controls, and validation cases before implementation.

#### Domain Note

Primary Monte Carlo radiation evolution means sampled packet histories are the main radiation field evolution method. It must not be confused with:

- packet deposition into gray M1 or other continuum fields;
- sampled probes used for validation;
- existing particle-transport heritage;
- stochastic visualization tracks.

#### Why It Is Outside The First Slice

The first slice uses deterministic gray M1 radiation because it gives a smaller coupled-kernel surface. Primary Monte Carlo radiation evolution would add stochastic convergence, source-bank reproducibility, variance diagnostics, and packet-field coupling complexity.

#### Graduation Criteria

- choose the Monte Carlo radiation method and document why it replaces or complements gray M1;
- define RNG, source-bank, and reproducibility contracts;
- add variance and convergence diagnostics;
- define packet-to-matter and packet-to-geometry coupling rules;
- add validation problems that distinguish sampled-radiation behavior from moment-radiation behavior.

### Berger-Oliger AMR

#### Research Note

Berger-Oliger AMR is foundational for time-dependent hyperbolic PDE refinement. Berger-Colella adds conservation-law and shock-focused block-structured refinement. GR use adds constraint and coupled-system complications that the first slice does not absorb.

Sources:

- [Berger and Oliger, "Adaptive mesh refinement for hyperbolic partial differential equations"](https://doi.org/10.1016/0021-9991(84)90073-1)
- [Berger and Colella, "Local adaptive mesh refinement for shock hydrodynamics"](https://doi.org/10.1016/0021-9991(89)90035-1)
- [Pretorius and Choptuik, "Adaptive Mesh Refinement for Coupled Elliptic-Hyperbolic Systems"](https://arxiv.org/abs/gr-qc/0508110)

#### Domain Note

Berger-Oliger AMR means a hierarchy of refined grid levels with refinement ratios, time stepping rules, inter-level data transfer, and error/refinement criteria. It must not be confused with:

- a single-block AMR-aware adapter;
- storing block metadata;
- a uniform grid with a future TODO;
- viewport zoom or rendering detail.

#### Why It Is Outside The First Slice

The first slice stays single-block while preserving AMR language. Full AMR would require scheduling, prolongation, restriction, refluxing or conservation handling, regridding policy, boundary handling, and diagnostics across levels.

#### Graduation Criteria

- define block hierarchy data structures and time-stepping policy;
- implement and test prolongation, restriction, and boundary exchange;
- define conservation and constraint diagnostics across refinement interfaces;
- add refinement-trigger tests and regression fixtures;
- prove the implementation does not re-label a uniform-grid run as AMR.

### Curvilinear Chart Support

#### Research Note

Curvilinear-coordinate GRHD work shows that coordinate choices and chart factors are formulation concerns, not cosmetic display options. The existing issue #1 research cites Montero, Baumgarte, and Mueller for GRHD in curvilinear coordinates.

Sources:

- [Montero, Baumgarte, and Mueller, "General relativistic hydrodynamics in curvilinear coordinates"](https://arxiv.org/abs/1309.7808)
- [Arnowitt, Deser, and Misner, "The Dynamics of General Relativity"](https://arxiv.org/abs/gr-qc/0405109)

#### Domain Note

Curvilinear chart support means the solver can express fields, derivatives, fluxes, source terms, and diagnostics in non-Cartesian coordinate charts with correct geometric factors. It must not be confused with:

- rendering axes in a different shape;
- loading a curved mesh;
- curved spacetime itself;
- a metric field sampled on a Cartesian grid.

#### Why It Is Outside The First Slice

The first slice can evolve metric and matter state without committing to a general chart abstraction. Curvilinear support changes derivative operators, volume/area factors, flux balances, regularity near coordinate singularities, and validation cases.

#### Graduation Criteria

- define the chart abstraction and basis-conversion rules;
- add tests for metric factors, derivative operators, and volume/area weights;
- include coordinate-singularity or regularity checks where relevant;
- prove conservation diagnostics remain meaningful under chart transforms;
- document which charts are supported and which remain unsupported.

### GRMHD

#### Research Note

GRMHD extends GRHD with magnetic fields, induction evolution, divergence constraints, and magnetized primitive recovery. Valencia GRMHD and HARM-style schemes are source-backed options, but the first slice intentionally stops at GRHD plus radiation coupling.

Sources:

- [Anton et al., "Numerical 3+1 general relativistic magnetohydrodynamics: a local characteristic approach"](https://arxiv.org/abs/astro-ph/0506063)
- [Gammie, McKinney, and Toth, "HARM: A Numerical Scheme for General Relativistic Magnetohydrodynamics"](https://arxiv.org/abs/astro-ph/0301509)
- [Noble et al., "Primitive Variable Solvers for Conservative General Relativistic Magnetohydrodynamics"](https://arxiv.org/abs/astro-ph/0512420)

#### Domain Note

GRMHD means general-relativistic magnetohydrodynamics: relativistic fluid evolution coupled to magnetic fields and electromagnetic stresses. It must not be confused with:

- Valencia GRHD without magnetic variables;
- an arbitrary vector field in the scene;
- opacity, radiation flux, or particle tracks;
- a magnetic-material property in a UI form.

#### Why It Is Outside The First Slice

The first slice needs hydrodynamic conservative/primitive state and radiation stress-energy before adding magnetic field evolution. GRMHD adds divergence control, magnetized wave speeds, new failure modes, and more difficult primitive recovery.

#### Graduation Criteria

- define magnetic field state, conserved variables, and primitive variables;
- choose divergence-control or constrained-transport strategy;
- add magnetized primitive-recovery diagnostics;
- add GRMHD regression tests and failure cases;
- update capability status only after hydrodynamic and magnetic diagnostics agree.

### TOV And Static-Star Validation

#### Research Note

Tolman-Oppenheimer-Volkoff equilibrium is a standard relativistic stellar-structure validation target. It requires a star model, EOS choice, equilibrium construction, perturbation strategy if stability is tested, and metrics for drift or oscillation.

Sources:

- [Tolman, "Static Solutions of Einstein's Field Equations for Spheres of Fluid"](https://doi.org/10.1103/PhysRev.55.364)
- [Oppenheimer and Volkoff, "On Massive Neutron Cores"](https://doi.org/10.1103/PhysRev.55.374)
- [Babiuc et al., "Implementation of standard testbeds for numerical relativity"](https://arxiv.org/abs/0709.3559)

#### Domain Note

TOV/static-star validation means using relativistic equilibrium star solutions to check coupled metric/fluid behavior. It must not be confused with:

- a static scene object;
- a fixed background field;
- a generic hydro pressure test;
- a production neutron-star simulation claim.

#### Why It Is Outside The First Slice

The first slice names kernel seams and basic diagnostics. TOV validation requires equilibrium initial data, EOS choices, radial profiles, boundary conditions, and stability or drift criteria.

#### Graduation Criteria

- implement or import a documented TOV initial-data generator;
- choose EOS assumptions and units;
- define drift, oscillation, and constraint metrics;
- compare against expected profiles or literature benchmarks;
- keep the capability status at validation-only unless broader evidence exists.

### Bondi And Michel Accretion Validation

#### Research Note

Bondi accretion is a classic spherical-accretion benchmark. Michel accretion extends the idea into the relativistic black-hole context. These are validation cases, not generic inflow features.

Sources:

- [Bondi, "On spherically symmetrical accretion"](https://doi.org/10.1093/mnras/112.2.195)
- [Michel, "Accretion of matter by condensed objects"](https://doi.org/10.1007/BF00649949)
- [Montero, Baumgarte, and Mueller, "General relativistic hydrodynamics in curvilinear coordinates"](https://arxiv.org/abs/1309.7808)

#### Domain Note

Bondi/Michel accretion validation means comparing a solver against spherical steady accretion reference behavior. It must not be confused with:

- any material inlet boundary;
- a source term;
- a fluid visualization;
- an arbitrary black-hole scene.

#### Why It Is Outside The First Slice

The first slice does not yet own the boundary conditions, steady-state reference solutions, chart handling, or black-hole-domain assumptions needed for this validation.

#### Graduation Criteria

- define Newtonian Bondi, relativistic Michel, or both as specific validation cases;
- provide reference solution generation and expected norms;
- add boundary-condition and chart assumptions;
- report convergence or error against the reference;
- mark results as validation evidence, not as broad accretion-model capability.

### AMR Convergence

#### Research Note

AMR convergence is stronger than "the solver runs on refined blocks." It asks whether refinement improves the measured solution with an expected behavior while preserving conservation and diagnostics across levels.

Sources:

- [Berger and Oliger, "Adaptive mesh refinement for hyperbolic partial differential equations"](https://doi.org/10.1016/0021-9991(84)90073-1)
- [Berger and Colella, "Local adaptive mesh refinement for shock hydrodynamics"](https://doi.org/10.1016/0021-9991(89)90035-1)
- [Babiuc et al., "Implementation of standard testbeds for numerical relativity"](https://arxiv.org/abs/0709.3559)

#### Domain Note

AMR convergence means measured error or invariant behavior improves under refinement according to a documented expectation. It must not be confused with:

- enabling AMR metadata;
- drawing multiple grid levels;
- passing a single refined-block smoke test;
- performance scaling.

#### Why It Is Outside The First Slice

The first slice is single-block. AMR convergence requires multi-level evolution, reference solutions, norm definitions, refinement schedules, and error accounting across level boundaries.

#### Graduation Criteria

- implement at least one multi-level AMR evolution path;
- define reference solution, norm, and expected convergence behavior;
- record refinement ratios and time-stepping policy;
- test inter-level conservation or constraint behavior;
- publish convergence evidence before any AMR capability promotion.

### Strong-Field Constraint Preservation

#### Research Note

Constraint diagnostics are named in issue #1, but strong-field constraint preservation is a higher bar. It asks whether Hamiltonian, momentum, and algebraic constraints remain controlled in difficult regimes over time, including under gauge, boundary, mesh, and matter-coupling choices.

Sources:

- [Baumgarte and Shapiro, "On the Numerical Integration of Einstein's Field Equations"](https://arxiv.org/abs/gr-qc/9810065)
- [Alcubierre et al., "Gauge conditions for long-term numerical black hole evolutions without excision"](https://arxiv.org/abs/gr-qc/0206072)
- [Babiuc et al., "Implementation of standard testbeds for numerical relativity"](https://arxiv.org/abs/0709.3559)
- [Pretorius and Choptuik, "Adaptive Mesh Refinement for Coupled Elliptic-Hyperbolic Systems"](https://arxiv.org/abs/gr-qc/0508110)

#### Domain Note

Strong-field constraint preservation means maintaining acceptable constraint behavior during challenging spacetime evolution. It must not be confused with:

- calculating a constraint once;
- algebraic projection in a simple fixture;
- logging a diagnostic without thresholds;
- visually smooth metric output.

#### Why It Is Outside The First Slice

The first slice should expose constraint diagnostics, but preserving constraints in strong-field regimes requires a validation campaign and often formulation, gauge, boundary, damping, projection, or mesh decisions beyond the first kernel.

#### Graduation Criteria

- define constraint norms and pass/fail thresholds;
- add long-running or stress-regime fixtures;
- record gauge, boundary, mesh, and matter-coupling assumptions;
- compare against known testbed behavior where available;
- keep reports honest when diagnostics show drift or failure.

### GRMHD Tests

#### Research Note

GRMHD tests are a separate track from GRMHD formulation selection. A usable test suite must check magnetized primitive recovery, divergence behavior, waves or shocks, and failure diagnostics.

Sources:

- [Gammie, McKinney, and Toth, "HARM: A Numerical Scheme for General Relativistic Magnetohydrodynamics"](https://arxiv.org/abs/astro-ph/0301509)
- [Anton et al., "Numerical 3+1 general relativistic magnetohydrodynamics: a local characteristic approach"](https://arxiv.org/abs/astro-ph/0506063)
- [Noble et al., "Primitive Variable Solvers for Conservative General Relativistic Magnetohydrodynamics"](https://arxiv.org/abs/astro-ph/0512420)

#### Domain Note

GRMHD tests means a validation and regression suite for magnetized relativistic fluid behavior. It must not be confused with:

- hydro tests without magnetic fields;
- primitive recovery tests that omit magnetic terms;
- one demonstration scenario;
- visual inspection of streamlines or field lines.

#### Why It Is Outside The First Slice

The first slice has no GRMHD implementation, so a GRMHD test suite would either be empty theater or would smuggle GRMHD into scope before its formulation choices are accepted.

#### Graduation Criteria

- accept a GRMHD formulation issue first;
- define magnetic divergence diagnostics and thresholds;
- add magnetized shock or wave fixtures;
- include primitive-recovery failure cases;
- make the tests gate capability promotion rather than merely documenting examples.

### Tabulated EOS

#### Research Note

Tabulated equation-of-state support is materially different from an ideal-gas EOS. It needs table format choices, interpolation rules, independent variables, unit handling, provenance, thermodynamic consistency checks, and failure behavior outside table bounds.

Sources:

- [CompOSE: CompStar Online Supernovae Equations of State](https://compose.obspm.fr/)
- [O'Connor and Ott, "A New Open-Source Code for Spherically-Symmetric Stellar Collapse to Neutron Stars and Black Holes"](https://arxiv.org/abs/0912.2393)

#### Domain Note

Tabulated EOS means material thermodynamics are looked up from curated tables, often across density, temperature, and composition dimensions. It must not be confused with:

- an ideal-gas EOS;
- a string table reference in a schema;
- a material name;
- opacity tables.

#### Why It Is Outside The First Slice

The first slice can use idealized EOS behavior to test coupling seams. Tabulated EOS support would add ingest, interpolation, units, provenance, bounds checking, and thermodynamic consistency risks.

#### Graduation Criteria

- select supported table format and metadata requirements;
- implement interpolation and unit normalization with tests;
- record table provenance and licensing expectations;
- add out-of-bounds and consistency diagnostics;
- connect tabulated EOS to primitive recovery only after failure behavior is explicit.

## Product Boundary

The tracks above are not product-facing capabilities. Until they graduate through issue, ADR, implementation, verification, and capability-status updates, Transport Studio documentation and UI should continue to describe them as future, gated, substrate, or validation-only work.

In particular, product-facing strong-field or production numerical-relativity claims remain deferred. A solver may expose kernels, diagnostics, or benchmark fixtures without becoming a validated strong-field production solver.

## Related Documents

- [PRD 0001: Relativistic Multiphysics Domain Spine](PRD-0001-relativistic-multiphysics-spine.md)
- [Relativistic Multiphysics Research Note](relativistic-multiphysics-research.md)
- [ADR 0007: Staged Relativistic Multiphysics Kernel Promotion](ADR-0007.md)
- [Transport Studio Context](../../CONTEXT.md)
