# Transport Studio Context

Transport Studio is a visual-first Monte Carlo particle transport workbench with a Rust physics spine and TypeScript domain contracts.

The glossary below is domain language for the staged Relativistic Multiphysics roadmap. It defines what the project means by the terms before implementation slices promote any new solver surface.

## Domain Glossary

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
