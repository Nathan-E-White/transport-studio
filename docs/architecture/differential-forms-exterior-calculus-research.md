# Differential Forms And Exterior Calculus Research Note

Date: 2026-07-17

## Question And Deliberate Limit

What part of differential forms and exterior calculus has a credible role inside
Transport Studio's internal Mathematical Physics Substrate?

This note stops at the mathematics needed to locate a future module, name its
verification obligations, and identify prerequisites. It is not a differential
geometry textbook, a Rust interface proposal, or a claim that the present grids
already implement discrete exterior calculus (DEC) or finite-element exterior
calculus (FEEC).

## Three Objects That Must Not Be Confused

### Smooth Differential Forms

On a smooth manifold `M`, a smooth `k`-form is a smooth section of the exterior
power of the cotangent bundle, `Λ^k T*M`. Pointwise, it is an alternating
multilinear map of `k` tangent vectors to a scalar. A `0`-form is a function; a
`1`-form measures oriented tangent directions; and a top-degree form can be
integrated over an oriented manifold. The alternating property is what makes the
wedge product graded-anticommutative. Sadun develops these definitions together
with pullback, exterior derivative, integration, Stokes' theorem, and de Rham
cohomology in one coordinate-compatible treatment. [Sadun, *Lecture Notes on
Differential Forms*](https://arxiv.org/abs/1604.07862)

A smooth form is therefore not merely an array with `binomial(n, k)` entries. A
coordinate array represents the form in one local coframe, while the form also
has a pullback law, alternating structure, degree, and geometric integration
meaning. Conversely, an arbitrary rank-`k` tensor is not a `k`-form unless it is
fully antisymmetric in those covariant slots. [Sadun](https://arxiv.org/abs/1604.07862)

### Discrete Cochains And Discrete Forms

In DEC, a primal discrete `k`-form is a `k`-cochain: it assigns a scalar to each
oriented `k`-cell and changes sign when the cell orientation reverses. Its natural
interpretation is an integral of a continuum `k`-form over that cell, not a
pointwise component sample. The discrete exterior derivative is the coboundary
operator induced by the cell boundary/incidence relation. DEC then introduces a
dual complex and metric-dependent discrete operators, commonly including a
discrete Hodge star. [Hirani, *Discrete Exterior
Calculus*](https://thesis.caltech.edu/1885/); [Desbrun, Hirani, Leok, and
Marsden](https://arxiv.org/abs/math/0508341)

This placement matters. In three spatial dimensions, degrees of freedom associated
with vertices, oriented edges, oriented faces, and volumes are different spaces,
not four interpretations of one cell-centered array. The exact identity
`d_(k+1) d_k = 0` comes from boundary-of-boundary being zero; metric approximation
does not create it. [Desbrun et al.](https://arxiv.org/abs/math/0508341)

### Ordinary Tensor Arrays

`GridField3<T>` and `EvolutionGridField3<T>` currently store one `T` at every
cell center of a uniform Cartesian grid. They do not encode oriented edges or
faces, incidence maps, a dual complex, or whether a value is an integral degree of
freedom. [`grid.rs`](../../apps/studio/src-tauri/crates/spacetime-physics/src/grid.rs)

Those arrays remain valid storage for existing finite differences, matter fields,
and diagnostics. They should not be called discrete forms merely because `T` can
hold a scalar, vector, or antisymmetric tensor. A future compatible-calculus
adapter would need an explicit interpretation/projection between continuum fields,
cell-complex cochains, and any reconstructed pointwise values.

## The Continuum Calculus Needed By The Architecture

### Pullback Is The Natural Direction Of Transformation

For a smooth map `f: M -> N`, pullback maps a `k`-form on `N` to a `k`-form on
`M`. It preserves wedge products and commutes with the exterior derivative. This
contravariant direction is what makes forms suitable for chart changes,
parameterized surfaces, and multipatch overlap checks: integrate the pulled-back
form on the parameter domain rather than inventing chart-specific integration
rules. [Sadun](https://arxiv.org/abs/1604.07862)

The architecture consequence is that a later forms module should consume the
chart/section work from PRD 0002, but chart Jacobians are not themselves exterior
calculus. The useful invariant is compatibility of pullback with wedge, `d`, and
integration across an overlap.

### Wedge Product Builds Oriented Densities

The wedge product maps a `k`-form and an `l`-form to a `(k+l)`-form, is
associative, and obeys graded commutativity. It constructs oriented line, area,
volume, and spacetime integrands without first identifying covectors with vectors.
[Sadun](https://arxiv.org/abs/1604.07862)

This is useful for fluxes and conserved currents, but it does not justify a broad
runtime exterior-algebra package. The software value appears when a physics
consumer needs degree-aware integration or conservation identities and would
otherwise duplicate orientation and sign logic.

### Exterior Derivative Is Metric-Independent

The exterior derivative `d: Ω^k(M) -> Ω^(k+1)(M)` is uniquely characterized by
its action on functions, the graded Leibniz rule, and compatibility with local
coordinates; it satisfies `d^2 = 0`. Pullback commutes with `d`. These facts do not
require a Riemannian or Lorentzian metric. [Sadun](https://arxiv.org/abs/1604.07862)

Thus the de Rham sequence

```text
Ω^0 --d--> Ω^1 --d--> ... --d--> Ω^n
```

is a differential complex before a metric enters. This separation is
architecturally valuable: topology/orientation/incidence operations and
metric/material constitutive operations have different failure modes and
verification evidence.

### Integration, Orientation, And Stokes

A `k`-form integrates over an oriented `k`-dimensional chain. Reversing orientation
reverses the integral. Generalized Stokes states that the integral of `dω` over a
chain equals the integral of `ω` over its oriented boundary. [Sadun](https://arxiv.org/abs/1604.07862)

Stokes is the central conservation identity, not decorative notation. It connects
local differential statements to boundary fluxes and provides a chart-independent
test of orientation, boundary incidence, and pullback. On a multipatch domain, the
same identity additionally requires shared interfaces to receive opposite induced
orientations so that internal contributions cancel.

## What Requires A Metric, Inner Product, Or Constitutive Law

### Hodge Star

On an oriented metric `n`-manifold, the Hodge star maps `k`-forms to
`(n-k)`-forms. Unlike `d`, it depends on the metric and orientation. In material
electromagnetism the analogous primal-to-dual relation can also carry constitutive
information; its discrete realization is therefore not generally just a sign and
cell-volume multiplier. FEEC treats the Hodge Laplacian through Hilbert-space inner
products, while DEC commonly uses primal/dual meshes for the metric-dependent
star. [Arnold, Falk, and Winther](https://arxiv.org/abs/0906.4325); [Hirani](https://thesis.caltech.edu/1885/)

This suggests a strict internal separation between:

- oriented topology and incidence, which determine the discrete `d` operators;
- metric/material data, which determine inner products and Hodge operators; and
- linear solvers and approximation spaces, which determine how Hodge problems are
  computed.

### Codifferential And Hodge Laplacian

Given the `L^2` inner product induced by metric and volume form, the
codifferential is the formal adjoint of `d` with boundary conditions included in
the operator domain. The Hodge Laplacian is `Δ = dδ + δd`. The boundary conditions
are load-bearing: on manifolds with boundary, the relationship among harmonic,
closed, and co-closed forms differs from the closed-manifold case. [Arnold, Falk,
and Winther](https://arxiv.org/abs/0906.4325); [Cappell, DeTurck, Gluck, and
Miller](https://arxiv.org/abs/math/0508372)

Accordingly, “Hodge decomposition” cannot be a single matrix factorization with
implicit boundary policy. A credible Verification Problem must declare topology,
metric, inner product, and absolute/relative or equivalent physical boundary
conditions.

### Hodge Decomposition And de Rham Cohomology

Closed forms satisfy `dω = 0`; exact forms have `ω = dη` and are necessarily
closed. The quotient of closed forms by exact forms is de Rham cohomology. Its
nonzero classes record global features that no local derivative test can remove.
For the de Rham complex, the dimensions of the cohomology groups are the Betti
numbers of the domain. Under suitable Hodge-theory hypotheses, forms decompose
orthogonally into exact, coexact, and harmonic parts, with harmonic fields carrying
the cohomological content. [Arnold, Falk, and
Winther](https://arxiv.org/abs/0906.4325)

For Transport Studio, the immediate value is topology-aware flux evidence and
elliptic projection/cleaning. It is not a reason to add general algebraic topology
to the kernel. A holed-domain fixture is necessary: on a contractible box, the
harmonic sector is too trivial to prove that the topology machinery earns its
keep.

## Relationship To Sections, Connections, And Curvature

A scalar `k`-form is a section of `Λ^k T*M`; a vector-bundle-valued `k`-form is a
section of `Λ^k T*M tensor E`. A connection on `E` extends differentiation to an
exterior covariant derivative on `E`-valued forms. Unlike ordinary `d`, the square
of the exterior covariant derivative need not vanish: curvature is the obstruction.
Connection one-forms are therefore related to, but not interchangeable with,
ordinary scalar `1`-forms. The geometric-field PRD's U(1) connection supplies a
natural future consumer, but the present PRD deliberately limits itself to
analytic pointwise gauge derivatives and holonomy. [PRD 0002](PRD-0002-geometric-field-sections.md);
[Berwick-Evans, Hirani, and Schubel, *Discrete Vector Bundles with Connection and
the Bianchi Identity*](https://arxiv.org/abs/2104.10277)

This distinction prevents a damaging shortcut: `d^2 = 0` is the required identity
for the scalar de Rham complex; it must not be asserted for a covariant derivative
whose curvature is nonzero.

## Physics Consumers

### Maxwell Geometry

Differential forms express the electromagnetic potential as a `1`-form, field
strength as a `2`-form, and charge-current as a degree-appropriate spacetime form.
The homogeneous Maxwell equation is a `d` identity; the sourced equation requires
the Hodge/constitutive relation. Stern and collaborators show that combining
discrete differential forms with a discrete variational principle yields a family
of structure-preserving Maxwell methods and generalizes Yee-type ideas to
unstructured spacetime meshes. [Stern et
al.](https://arxiv.org/abs/0707.4470)

This is the strongest activation consumer because it exercises degree placement,
orientation, exterior derivative, Hodge/constitutive behavior, gauge structure,
and conservation together. A free-standing form algebra would exercise only the
easy portion.

### GRMHD Magnetic Flux And Divergence

In three-space, magnetic flux naturally pairs with oriented faces, while the
divergence constraint is an oriented cell balance. Globally divergence-free MHD
discretizations additionally need compatible normal components across element
interfaces; Rossmanith's DG constrained-transport analysis makes both elementwise
zero divergence and interelement normal continuity explicit. [Rossmanith,
*High-Order DG Methods with Globally Divergence-Free Constrained Transport for
Ideal MHD*](https://arxiv.org/abs/1310.4251)

Forms can therefore supply the representation and incidence identities beneath a
GRMHD constrained-transport adapter. They do not supply the hyperbolic flux,
Riemann solver, limiter, positivity policy, or primitive recovery. Those remain in
the conservation-law and discretization modules.

### Conservation And Multipatch Geometry

Conserved currents pair naturally with oriented hypersurfaces, and Stokes converts
bulk conservation into boundary flux. On chart overlaps, pullback compatibility
and opposite interface orientations are what make the global integral independent
of patch bookkeeping. [Sadun](https://arxiv.org/abs/1604.07862)

This capability should be introduced first as verification evidence. Claiming
coordinate-independent integration requires actual oriented cells/faces and
overlap maps; transforming cell-center components alone is insufficient.

## DEC And FEEC Are Related But Different Commitments

DEC builds discrete calculus directly from a cell complex, its dual, and
combinatorial/geometric operators. The discrete exterior derivative is naturally
an incidence/coboundary operator, while metric dependence is concentrated in
operators such as the Hodge star. Hirani explicitly develops DEC on simplicial
complexes and circumcentric duals and notes that interpolation remains useful for
some operations. [Hirani](https://thesis.caltech.edu/1885/); [Desbrun et
al.](https://arxiv.org/abs/math/0508341)

FEEC instead analyzes finite-element differential forms as a Hilbert complex. Its
stability result requires finite-element spaces that form a subcomplex of the de
Rham complex and uniformly bounded cochain projections that commute with `d`, plus
appropriate approximation properties. It supplies mixed formulations and error
estimates for Hodge-Laplacian problems. [Arnold, Falk, and
Winther](https://arxiv.org/abs/0906.4325)

Consequences:

- an incidence matrix and diagonal star may support a DEC adapter but do not prove
  FEEC stability;
- Whitney or higher-order finite-element forms, commuting projection, Sobolev
  spaces, and approximation estimates are additional FEEC commitments;
- a structure-preserving identity such as `d^2 = 0` is necessary but not sufficient
  evidence for convergence;
- cubical DEC, simplicial DEC, and FEEC should not be configuration labels for one
  unexamined implementation.

## Fit Against The Current Repository

### Cartesian Cell-Centered Grids

The current `UniformGrid3` knows cell centers, cell volume, dimensions, and Cartesian
spacing. `GridField3<T>` and `EvolutionGridField3<T>` hold dense cell-centered
values, while `FiniteDifferenceOperator` differentiates those point samples.
[`grid.rs`](../../apps/studio/src-tauri/crates/spacetime-physics/src/grid.rs);
[`numerics.rs`](../../apps/studio/src-tauri/crates/spacetime-physics/src/numerics.rs)

This substrate lacks the data needed to claim compatible discrete forms:

- explicit oriented vertices, edges, faces, and cells;
- boundary/incidence maps with `boundary boundary = 0`;
- primal/dual measures and Hodge operators;
- degree-specific degrees of freedom;
- trace/interface orientation across patches; and
- projection/reconstruction between continuum sections and cochains.

The first credible structured-grid adapter is therefore an **oriented cubical cell
complex**, even if it reuses the Cartesian grid's extents and spacing. It should not
reinterpret every existing cell-centered `Vec3` as edge circulation or face flux.
That would silently change the numerical meaning of stored values.

### Monte Carlo Histories And Tallies

The native photon path stores point positions and directions and currently scores
scalar path length or detector count into tallies. It does not represent histories
as oriented chains, pull forms back along trajectories, or estimate differential-
form integrals. [`photon_smoke.rs`](../../apps/studio/src-tauri/crates/transport-engine/src/photon_smoke.rs)

A future history could integrate a `1`-form along an oriented trajectory, and
particle crossings could estimate surface-flux integrals. That is a legitimate
consumer of form integration, but it is not the first adapter: Monte Carlo sampling
adds estimator, sign, variance, and deposition semantics that are absent from
deterministic cochain integration. The stochastic-transport PRD should own those
semantics while consuming compatible geometric integration where useful.

## Architecture-Relevant Verification Problems

### 1. Continuum Identities Across Charts

On Cartesian and spherical patches away from singularities, verify pullback
composition, pullback/wedge compatibility, pullback/`d` compatibility, and equal
integrals of a compactly supported form in both charts. Include an orientation
reversal that must flip the integral sign.

This proves the bridge from PRD 0002 without claiming a numerical method.

### 2. Oriented Cubical de Rham Complex

Construct a small Cartesian cubical complex and verify incidence signs,
`boundary boundary = 0`, `d d = 0` in every valid degree, and discrete Stokes on
individual cells and their union. Compare integrated analytic polynomial forms
with exact edge, face, and volume integrals.

This is the minimum credible structured-grid adapter.

### 3. Simplicial Adapter

Repeat the incidence, Stokes, orientation-reversal, and exact-polynomial tests on a
small tetrahedral complex. Shared-face contributions must cancel between adjacent
tetrahedra.

Cubical and simplicial adapters make the cell-complex seam real; two scalar
storage layouts would not.

### 4. Hodge Laplacian And Decomposition

On a bounded domain with declared metric and boundary conditions, solve a
manufactured Hodge-Laplacian problem and demonstrate convergence in stated norms.
Decompose a field into exact, coexact, and harmonic parts, verify orthogonality and
reconstruction, and include a holed domain with a known nontrivial harmonic flux.

This evidence must state the boundary conditions because Hodge theory changes in
their presence. [Cappell et al.](https://arxiv.org/abs/math/0508372)

### 5. Maxwell And GRMHD Fixtures

For Maxwell, verify the discrete Gauss constraints, Faraday/Ampere Stokes balances,
gauge-invariant field strength, conservation behavior, and refinement convergence.
For GRMHD, verify zero cell divergence and compatible normal magnetic flux across
interfaces, then test a smooth induction fixture before shocks. [Stern et
al.](https://arxiv.org/abs/0707.4470); [Rossmanith](https://arxiv.org/abs/1310.4251)

These are independent physics consumers. Passing algebraic complex tests alone
does not establish either capability.

### 6. Multipatch Cancellation

Integrate a smooth conserved flux over a domain split across overlapping or
abutting patches. Verify that pullbacks agree on overlaps, internal interface terms
cancel with opposite orientations, and the external-boundary result matches a
single-patch analytic reference.

## Recommendation

The credible internal module is **compatible field calculus**, not “all exterior
algebra” and not a public generic `DifferentialForm<T, K>` framework. Its value is
to concentrate orientation, degree placement, incidence, integration, metric
duality, compatible projection, and structure-preservation evidence that would
otherwise leak into Maxwell, GRMHD, multipatch integration, and diagnostics.

Activate it only when all of the following are named:

1. an oriented cubical cell-complex adapter;
2. an oriented simplicial cell-complex adapter;
3. Maxwell plus GRMHD magnetic flux, or two comparably independent consumers;
4. a declared metric/constitutive and boundary policy for Hodge operations; and
5. algebraic, topological, and convergence Verification Problems.

Until then, PRD 0002 should expose only the section, chart, frame, orientation, and
connection capabilities that its own Verification Problems require. The present
cell-centered grids and Monte Carlo tallies should remain unchanged rather than be
relabeled as forms.

## Primary Sources

- [Lorenzo Sadun, *Lecture Notes on Differential Forms*](https://arxiv.org/abs/1604.07862)
- [Anil N. Hirani, *Discrete Exterior Calculus*](https://thesis.caltech.edu/1885/)
- [Mathieu Desbrun, Anil N. Hirani, Melvin Leok, and Jerrold E. Marsden,
  *Discrete Exterior Calculus*](https://arxiv.org/abs/math/0508341)
- [Douglas N. Arnold, Richard S. Falk, and Ragnar Winther, *Finite element exterior
  calculus: from Hodge theory to numerical stability*](https://arxiv.org/abs/0906.4325)
- [Ari Stern, Yiying Tong, Mathieu Desbrun, and Jerrold E. Marsden, *Geometric
  Computational Electrodynamics with Variational Integrators and Discrete
  Differential Forms*](https://arxiv.org/abs/0707.4470)
- [James A. Rossmanith, *High-Order Discontinuous Galerkin Finite Element Methods
  with Globally Divergence-Free Constrained Transport for Ideal
  MHD*](https://arxiv.org/abs/1310.4251)
- [Sylvain Cappell, Dennis DeTurck, Herman Gluck, and Edward Y. Miller,
  *Cohomology of Harmonic Forms on Riemannian Manifolds With
  Boundary*](https://arxiv.org/abs/math/0508372)
- [Daniel Berwick-Evans, Anil N. Hirani, and Mark D. Schubel, *Discrete Vector
  Bundles with Connection and the Bianchi
  Identity*](https://arxiv.org/abs/2104.10277)
