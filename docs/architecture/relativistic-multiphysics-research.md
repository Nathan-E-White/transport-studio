# Relativistic Multiphysics Research Note

## Purpose

This note anchors Transport Studio's staged 3D general-relativistic radiation-hydrodynamics language in primary or high-trust sources. It supports the issue #1 PRD, glossary, and ADR. It is not an implementation plan and does not claim a validated solver.

## Source Map

| Area | Source | Why it matters |
|---|---|---|
| ADM | Arnowitt, Deser, and Misner, ["The Dynamics of General Relativity"](https://arxiv.org/abs/gr-qc/0405109) | Canonical 3+1 split language for lapse, shift, spatial metric, and constraints. |
| BSSN | Baumgarte and Shapiro, ["On the Numerical Integration of Einstein's Field Equations"](https://arxiv.org/abs/gr-qc/9810065) | Source for the conformal rewrite used to improve numerical stability over raw ADM evolution. |
| Gauge | Alcubierre et al., ["Gauge conditions for long-term numerical black hole evolutions without excision"](https://arxiv.org/abs/gr-qc/0206072) | High-trust source for 1+log/Gamma-driver gauge motivation in long-running BSSN-style evolutions. |
| Valencia GRHD | Anton et al., ["Numerical 3+1 general relativistic magnetohydrodynamics: a local characteristic approach"](https://arxiv.org/abs/astro-ph/0506063) | Presents 3+1 conservative relativistic MHD and explicitly traces the approach to Banyuls et al. 1997 GRHD. |
| Valencia adoption | Montero, Baumgarte, and Mueller, ["General relativistic hydrodynamics in curvilinear coordinates"](https://arxiv.org/abs/1309.7808) | Summarizes Valencia as a widely used flux-conservative form and generalizes it for curvilinear coordinates. |
| Primitive recovery | Noble et al., ["Primitive Variable Solvers for Conservative General Relativistic Magnetohydrodynamics"](https://arxiv.org/abs/astro-ph/0512420) | Establishes conservative-to-primitive inversion as a nonlinear numerical seam. |
| Gray M1 radiation | Sadowski et al., ["Semi-implicit scheme for treating radiation under M1 closure in general relativistic conservative fluid dynamics codes"](https://arxiv.org/abs/1212.5050) | Demonstrates covariant M1 closure in conservative GR radiation hydrodynamics and lists benchmark-style tests. |
| AMR | Berger and Oliger, ["Adaptive mesh refinement for hyperbolic partial differential equations"](https://doi.org/10.1016/0021-9991(84)90073-1) | Foundational AMR source for hyperbolic PDE evolution. |
| AMR for shocks | Berger and Colella, ["Local adaptive mesh refinement for shock hydrodynamics"](https://doi.org/10.1016/0021-9991(89)90035-1) | Foundational block-structured AMR source for conservation-law shock problems. |
| GR AMR coupling | Pretorius and Choptuik, ["Adaptive Mesh Refinement for Coupled Elliptic-Hyperbolic Systems"](https://arxiv.org/abs/gr-qc/0508110) | Shows AMR complications for constrained GR systems. |
| Verification | Babiuc et al., ["Implementation of standard testbeds for numerical relativity"](https://arxiv.org/abs/0709.3559) | Anchors standard numerical-relativity testbed thinking. |
| Monte Carlo packet semantics | OpenMC documentation, ["Random Number Generation"](https://docs.openmc.org/en/stable/methods/random_numbers.html) and ["Neutron Physics"](https://docs.openmc.org/en/stable/methods/neutron_physics.html) | Provides high-trust language for sampled histories, reproducibility, collision sampling, and source-bank behavior. |

## Research Implications

### ADM And BSSN

ADM supplies the 3+1 vocabulary: spatial slices, lapse, shift, spatial metric, extrinsic curvature, constraints, and evolution. For Transport Studio, ADM is domain language and a conceptual baseline, not the first staged evolution target.

BSSN is the staged geometry evolution formulation because it rewrites ADM-like variables with conformal state and connection functions, which numerical-relativity literature treats as more stable for long-running evolutions. The first implementation should preserve the distinction between state storage, RHS/evolution, gauge enforcement, and diagnostics.

### Gauge

The staged gauge language is BSSN with 1+log slicing and Gamma-driver shift. The gauge controls coordinate evolution; it is not a physical material model. Tests should treat gauge behavior as part of geometry evolution stability and diagnostics, not as a product setting.

### Valencia GRHD

Valencia GRHD is the right domain term for the hydrodynamics part because it casts relativistic fluid equations in flux-conservative form. That maps cleanly to finite-volume kernel seams, conservation diagnostics, Riemann-solver-compatible futures, and primitive recovery.

The first slice should avoid pretending that a minimal hydrodynamics kernel is a general production GRHD solver. The correct claim is narrower: it uses Valencia-shaped state and tests to establish a kernel seam.

### Primitive Recovery

Primitive recovery deserves its own seam. The forward primitive-to-conservative map is generally easier than the inverse conservative-to-primitive map. In relativistic hydro and MHD, the inverse can require nonlinear solves and can fail for non-admissible states.

That means tests should include:

- successful recovery on simple admissible states
- failure on non-finite or unphysical states
- tolerance rules for recovered primitives
- clear diagnostics when recovery fails

### Gray M1 Radiation

Gray M1 is a staged middle ground: it evolves frequency-integrated radiation moments and uses a closure for higher moments. It is not full Monte Carlo transport, not discrete ordinates, and not frequency-dependent radiation transport.

For Transport Studio, gray M1 is the first radiation evolution candidate under Relativistic Multiphysics because it can couple to hydrodynamics and stress-energy fields while remaining testable as a deterministic kernel.

### AMR Direction

AMR is necessary domain language for future 3D radiation-hydrodynamics work, but full multi-block AMR is too much for the first slice. The staged direction is AMR-aware single-block start:

- carry block metadata
- make refinement criteria visible
- leave prolongation/restriction seams named
- test adapter behavior on one active block
- defer multi-block scheduling and regridding

This prevents the first implementation from hard-coding a dead-end uniform-grid assumption while also avoiding a fake AMR claim.

### Monte Carlo Packets As Bridge

Monte Carlo packets remain valuable to Transport Studio because the product began as a particle transport workbench. In this staged plan, packets are a bridge:

- sampled histories may deposit source terms into continuum fields
- packet deposition can test source accumulation and diagnostics
- packet probes can compare sampled and moment-style behavior

Packets are not the primary gray-M1 radiation evolution. That distinction prevents a confusing hybrid where packet tracks, moment fields, and continuum radiation energy all claim to be the same result.

### Verification Strategy

Verification should start with small, named, deterministic checks:

- flat-space preservation and constraint diagnostics
- primitive recovery on known states
- conservation diagnostics across one update
- gray-M1 closure limits and simple radiation moment fixtures
- packet deposition conservation
- single-block AMR adapter invariants

The numerical-relativity testbed literature supports using standard tests to compare formulations and implementations. Transport Studio should adopt that posture before any product-facing solver promotion.

## Product Boundary

The research supports a staged kernel path. It does not support exposing Relativistic Multiphysics as a runnable product solver yet. Product-facing promotion needs capability metadata, validation categories, provenance, reports, and UI language that clearly distinguish solved, placeholder, benchmark, and unsupported surfaces.
