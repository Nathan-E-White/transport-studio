# PRD 0001: Relativistic Multiphysics Domain Spine

## Status

Accepted as the issue #1 planning spine.

## Problem Statement

Transport Studio already has a visible physics roadmap and an early `spacetime-physics` crate surface, but the next general-relativistic radiation-hydrodynamics step needs shared product, domain, and architecture language before implementation starts.

Without that language, later slices can accidentally blur different claims:

- fixed-background transport versus dynamical spacetime evolution
- diffusion or moment radiation versus sampled Monte Carlo histories
- runnable kernel verification versus product-facing solver promotion
- conserved numerical state versus primitive physical state
- single-block kernel work versus production AMR capability

That ambiguity would let the app look more capable than it is. The project needs a source-backed spine that keeps the first implementable slice small, testable, and honest.

## Solution

Frame the broader umbrella as Relativistic Multiphysics, with the first implementable slice named Dynamical Spacetime Coupling.

Dynamical Spacetime Coupling means matter/radiation stress-energy can source spacetime geometry evolution, and the updated geometry can feed the next matter/radiation update. The slice remains crate-kernel work in `spacetime-physics`. Product-facing runnable solver promotion remains gated until solver capability metadata, validation evidence, reporting language, and UI claims are updated together.

This issue delivers the documentation spine only:

- this PRD
- a source-backed research note
- glossary additions in `CONTEXT.md`
- ADR 0007 recording the staged architecture decision

## User Stories

- As a physics-kernel implementer, I need the first GR rad-hydro slice named and bounded so I can write tests without inventing product claims.
- As a domain-model reviewer, I need glossary terms that separate ADM, BSSN, Valencia GRHD, gray M1 radiation, primitive recovery, AMR, and Monte Carlo packets.
- As a frontend/product implementer, I need to know that Relativistic Multiphysics is not yet a product-facing runnable solver.
- As a reviewer, I need source-backed rationale for the chosen formulation stack before code lands.
- As a future agent, I need explicit TDD seams so the implementation can proceed vertically without smearing responsibilities across the app.

## Implementation Decisions

- Use Relativistic Multiphysics as the umbrella term for future coupled spacetime, matter, radiation, EOS, opacity, AMR, and diagnostics work.
- Name the first implementable slice Dynamical Spacetime Coupling.
- Keep the first slice in the `spacetime-physics` crate/kernel layer.
- Keep `transport-engine`, TypeScript solver registries, and UI run surfaces gated until the kernel has verification evidence and contract language.
- Use BSSN as the staged spacetime evolution formulation.
- Use 1+log slicing and Gamma-driver shift as the staged gauge language for BSSN evolution.
- Use Valencia GRHD as the staged hydrodynamics formulation.
- Use gray M1 as the staged radiation moment model.
- Start AMR-aware but single-block: preserve AMR concepts while avoiding multi-block orchestration in the first kernel slice.
- Treat Monte Carlo packets as a bridge for source/deposition experiments and validation probes, not as the primary radiation evolution for this slice.

## TDD Seams

The agreed test-first seams are:

- kernel seam: deterministic coupled step inputs, outputs, and failure modes
- primitive recovery seam: conservative-to-primitive conversion, admissibility checks, and failure diagnostics
- grid metric adapter seam: sampling BSSN/metric state onto matter/radiation update locations
- packet deposition seam: accumulating packet-carried source terms into continuum fields without making packets the main radiation solver
- BSSN/constraint diagnostics seam: Hamiltonian, momentum, and algebraic constraint checks around geometry updates
- single-block AMR adapter seam: block metadata, restriction/prolongation placeholders, and refinement diagnostics without multi-block evolution

## Testing Decisions

- Documentation is verified by review and link integrity in this issue.
- Later implementation should begin with focused Rust tests in `spacetime-physics`.
- Early tests should prefer small deterministic fixtures over broad simulation campaigns.
- Primitive recovery tests must include admissible states, non-admissible states, and convergence/failure reporting.
- BSSN tests must include flat-space preservation, algebraic projection behavior, and constraint diagnostics.
- Radiation tests must identify gray-M1 limitations rather than treating it as full transport.
- AMR tests must prove the single-block adapter preserves domain intent without claiming full regridding support.
- Product-facing tests are deferred until the solver is intentionally promoted through backend capability metadata and reporting.

## Out Of Scope

- No new runnable product solver in this issue.
- No UI controls, solver registry changes, or report-surface promotion.
- No production GR radiation-hydrodynamics claim.
- No multi-block AMR implementation.
- No full frequency-dependent or angle-resolved radiation transport.
- No replacement of existing Monte Carlo transport paths.
- No criticality, depletion, or weapon-effects solver expansion.

## Further Notes

The implementation order should stay boring and sharp:

1. Keep glossary and ADR language stable.
2. Add tests at the kernel seams.
3. Implement the smallest coupled kernel behavior that makes those tests meaningful.
4. Promote capability metadata only after the kernel emits reviewable diagnostics.
5. Expose product-facing workflows only after reports can distinguish solved, validated, placeholder, and unsupported facets.

## Related Documents

- [Relativistic Multiphysics Research Note](relativistic-multiphysics-research.md)
- [ADR 0007: Staged Relativistic Multiphysics Kernel Promotion](ADR-0007.md)
- [V1 Physics Engine Completion Plan](V1-physics-engine-plan.md)
- [Transport Studio Context](../../CONTEXT.md)
