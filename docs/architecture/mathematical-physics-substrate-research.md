# Mathematical Physics Substrate Research Note

Date: 2026-07-17

## Question

Which advanced mathematical topics have a credible module seam and Verification
Problem in Transport Studio, and which should remain future research rather than
expanding the geometric-field PRD?

## Repository Evidence

The current repository suggests four distinct families rather than one geometry
package:

- `geometric_field` is planned as the representation seam for sections, charts,
  frames, connections, and gauge actions;
- `FiniteDifferenceOperator` acts on Cartesian `EvolutionGridField3` data, while the
  Valencia tracer bullet fixes Rusanov flux, reconstruction, boundary, and stepping
  policy inside the hydrodynamics path;
- Valencia GRHD, Gray M1, primitive recovery, BSSN projection, and verification
  reports already expose physical admissibility and constraint concepts without one
  common conservation-law interface;
- the mathematical verification gateway already hides Symbolica, Numerica, and
  finite-difference derivative implementations behind repository-owned evidence;
- native photon histories and relativistic geodesic packets provide stochastic
  consumers, but no general measure or estimator module exists;
- transport geometry has analytic box, sphere, and cylinder intersections but no
  mesh/cut-cell adapter.

These facts support PRD 0003 now. They leave several other seams hypothetical.

## Differential Forms, Hodge Theory, And FEEC

Differential forms give orientation-aware integration and distinguish values living
on vertices, edges, faces, and volumes. That is useful for Maxwell fields, magnetic
flux, conservation laws, and topology-aware diagnostics.

Arnold, Falk, and Winther show that finite-element exterior calculus obtains
stability by preserving the differential-complex structure. The finite-element
spaces must form a subcomplex and admit a bounded cochain projection. A collection
of exterior-algebra types or sparse incidence matrices does not establish the FEEC
claim.

Repository consequence:

- do not add free-standing exterior algebra to PRD 0002;
- activate the forms/Hodge PRD only with an oriented mesh or cell complex and two
  field consumers;
- use `d^2 = 0`, discrete Stokes, Hodge decomposition, harmonic flux, and convergence
  as acceptance evidence;
- treat Sobolev spaces and Hilbert-complex language as method and verification
  criteria rather than runtime types.

Primary source:

- [Arnold, Falk, and Winther, "Finite element exterior calculus: from Hodge theory to numerical stability"](https://arxiv.org/abs/0906.4325)

## Hyperbolic Laws, Entropy, And Invariant Domains

Hyperbolic conservation-law theory directly serves Valencia GRHD and future Gray M1
evolution. A useful seam owns the physical state, flux, source, characteristic
bounds, entropy pair, and admissible set. Numerical fluxes, reconstruction,
quadrature, and time integration remain discretization policy.

Guermond, Popov, and Tomas describe invariant-domain-preserving methods and convex
limiting. Their result depends on a low-order approximation that already satisfies
the required invariant properties. It does not justify applying an after-the-fact
clamp to arbitrary high-order output.

Repository consequence:

- draft the conservation-law PRD now using Valencia and Gray M1 as adapters;
- keep positivity, realizability, primitive recovery, and entropy evidence distinct;
- let the physics adapter declare the admissible set while a later discretization
  proves it preserves that set;
- do not expose a generic DAE interface for heterogeneous domain constraints.

Primary source:

- [Guermond, Popov, and Tomas, "Invariant domain preserving discretization-independent schemes and convex limiting for hyperbolic systems"](https://arxiv.org/abs/1807.02563)

## Weak Formulations And Discontinuous Galerkin

Weak and DG methods are a new spatial discretization substrate, not a method flag on
the current finite-difference operator. A credible adapter must consume the same
physical flux/source kernel as the existing path.

Yan and collaborators construct entropy-stable discontinuous Galerkin difference
methods using summation-by-parts structure, entropy-variable interpolation, and a
suitable fully discrete time method. Their results also report high-order linear
instability concerns. The label "DG" does not by itself provide entropy stability.

Repository consequence:

- separate physical conservation-law evaluation before drafting a DG interface;
- compare current finite-volume/finite-difference and future DG adapters on the same
  pointwise physics;
- require quadrature, basis, mass-operator, boundary-flux, limiter, positivity, and
  entropy evidence;
- keep DG outside PRD 0002 and outside the first PRD 0003 implementation.

Primary source:

- [Yan et al., "Entropy-stable discontinuous Galerkin difference methods for hyperbolic conservation laws"](https://arxiv.org/abs/2103.03826)

## Symplectic, Multisymplectic, And Variational Methods

Variational integrators can preserve symplectic or multisymplectic structure and
momentum maps when the discrete method is derived from an appropriate action. This
is valuable for long-time geodesic integration and compatible Maxwell evolution,
but not grounds for replacing all explicit stepping.

Marsden, Patrick, and Shkoller develop discrete variational principles for nonlinear
PDEs. Stern and collaborators combine discrete differential forms and variational
integration for computational electrodynamics.

Repository consequence:

- begin with a bounded Hamiltonian geodesic fixture and compare against existing
  explicit adapters;
- report long-time invariants, reversibility, and momentum behavior rather than only
  local truncation error;
- gate multisymplectic Maxwell behind the compatible forms/Hodge work;
- attach Noether evidence only to formulations with a recorded symmetry and action.

Primary sources:

- [Marsden, Patrick, and Shkoller, "Multisymplectic geometry, variational integrators, and nonlinear PDEs"](https://arxiv.org/abs/math/9807080)
- [Stern et al., "Geometric Computational Electrodynamics with Variational Integrators and Discrete Differential Forms"](https://arxiv.org/abs/0707.4470)

## Jets, Automatic Differentiation, And Adjoints

Jet language can organize values and derivatives, but repository callers need
Jacobians, residuals, sensitivities, and evidence rather than public jet bundles.
The existing verification gateway already provides the correct locality: Symbolica,
Numerica, and centered finite differences remain implementation details.

Adjoint transport is a distinct solver capability. Consistent adjoint-driven
importance sampling uses adjoint information to bias forward histories and adjust
weights. A forward solver alone does not establish an adjoint seam.

Repository consequence:

- deepen the existing mathematical gateway instead of exporting AD types;
- require derivative agreement and dot-product dual-consistency tests;
- add adjoint claims only after a forward/adjoint pair, reciprocity test, and analytic
  tally-sensitivity fixture exist.

Primary source:

- [Evans and Mosher, "Consistent Adjoint Driven Importance Sampling using Space, Energy and Angle"](https://www.osti.gov/biblio/1052244)

## Probability Measures, Estimators, And Monte Carlo Transport

Monte Carlo histories are samples from physical probability laws. Tallies estimate
random variables and require statistical uncertainty evidence. Source distributions,
weighted histories, stopping events, and estimator variance therefore deserve a
transport-facing seam, while general measure representations remain private.

Repository consequence:

- use native photon histories and relativistic geodesic packets as the first two
  adapters;
- verify free-path and outcome distributions, unbiased weighted tallies, variance
  scaling, replay, and packet-to-field conservation;
- distinguish deterministic verification from statistical uncertainty;
- compile geometric point, beam, surface, and interface sources into valid discrete
  sampling laws instead of treating a delta function as a ready-to-run source.

Primary and authoritative technical sources:

- [Kulesza et al., "MCNP Code Version 6.3.1 Theory & User Manual"](https://www.osti.gov/biblio/2372634)
- [OpenMC, "Introduction"](https://docs.openmc.org/en/stable/methods/introduction.html)
- [OpenMC, "Tallies"](https://docs.openmc.org/en/stable/methods/tallies.html)

## Uncertainty Quantification And Polynomial Chaos

Uncertain material, EOS, opacity, source, and geometry inputs are different from
discretization error and model validation. Polynomial chaos can provide efficient
moment estimates when parameter dependence is sufficiently smooth, but shocks or
loss of hyperbolicity can defeat the expected spectral behavior.

Repository consequence:

- keep UQ in a separate PRD from stochastic transport estimators;
- compare direct ensembles and polynomial chaos against analytic uncertain models;
- record validity limits and failure evidence near nonsmooth parameter dependence;
- never promote an uncertain prediction as validation evidence merely because it
  has a confidence interval.

Primary source:

- [Xiu and Karniadakis, "Modeling uncertainty in flow simulations via generalized polynomial chaos"](https://www.sci.utah.edu/~dxiu/Papers/XiuK_JCP03.pdf)

## Topics Without A Present Seam

The following topics have plausible uses but lack two adapters or a named
Verification Problem in the repository:

- spectral/harmonic analysis and wavelets for angular radiation, tensor modes, AMR
  indicators, and localized error;
- geometric measure theory and cut cells for mesh intersections and low-regularity
  interfaces;
- optimal transport for conservative remapping;
- homogenization for explicit resolved-versus-effective material models;
- persistent homology for analysis of evolving structures;
- Clifford algebra for spin or polarized transport;
- dynamical systems for named equilibria or bifurcations;
- sheaves, category theory, twistors, noncommutative geometry, and higher categories.

They belong in the Future-Track Notes Ledger. Kaluza-Klein theory and all
five-dimensional frameworks remain excluded.

## Recommendation

Maintain eight PRDs in one documentation family. Draft PRD 0003 now. Keep the other
six sibling PRDs as activation-gated outlines until their consumers and Verification
Problems are concrete. This provides locality without inventing a general mathematics
framework whose interface would be the table of contents of several textbooks.
