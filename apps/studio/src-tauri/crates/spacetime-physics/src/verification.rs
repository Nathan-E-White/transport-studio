//! Repository-owned verification problems and evidence reports.
//!
//! This module is the public seam for numerical verification. Solver storage and
//! third-party mathematics types remain behind this interface.

use crate::kernel::{DynamicalSpacetimeKernel, EvidenceStatus, KernelConfig, KernelState};
use crate::math_gateway;
use crate::radiation::{OrthonormalGrayRadiationMoments, close_gray_m1_moments};
use crate::radiative_shock_tube;
use crate::shock_tube;
use crate::{
    CoordinateTime, LocalRadiationMatterExchangeState, PrimitiveRecoveryDiagnostic,
    PrimitiveRecoveryPolicy, RadiationMatterExchangeConfig, RadiationTransportMode, TimeDuration,
    UniformGrid3, ValenciaGeometry, ValenciaIdealGas, ValenciaPrimitive, primitive_to_conserved,
    radiation_matter_exchange_semi_implicit, recover_primitives, vec3,
};

/// Verification scenarios that can be evaluated without promoting a product solver.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum VerificationProblem {
    FlatSpacetimeInvariant,
    AnalyticDerivativeIdentity,
    ValenciaJacobians,
    GrayM1AndImexJacobians,
    FlatRelativisticShockTube,
    RelativisticRadiativeShockTube,
}

/// Caller-owned settings for one deterministic verification run.
#[derive(Debug, Clone, PartialEq)]
pub struct VerificationRequest {
    pub problem: VerificationProblem,
    pub tolerance: f64,
    pub math_worker: Option<std::path::PathBuf>,
}

impl VerificationRequest {
    pub const fn new(problem: VerificationProblem, tolerance: f64) -> Self {
        Self {
            problem,
            tolerance,
            math_worker: None,
        }
    }

    /// Supply the isolated mathematical worker executable for gateway problems.
    pub fn with_math_worker(mut self, path: impl Into<std::path::PathBuf>) -> Self {
        self.math_worker = Some(path.into());
        self
    }
}

/// Stable, machine-readable verification failure or warning.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerificationDiagnostic {
    pub code: &'static str,
    pub message: String,
}

/// Reproducibility facts attached to one verification report.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerificationProvenance {
    pub problem_id: &'static str,
    pub model: &'static str,
    pub facts: Vec<VerificationProvenanceFact>,
}

impl VerificationProvenance {
    pub fn fact(&self, key: &str) -> Option<&str> {
        self.facts
            .iter()
            .find(|fact| fact.key == key)
            .map(|fact| fact.value.as_str())
    }
}

/// One stable, repository-owned provenance fact.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerificationProvenanceFact {
    pub key: &'static str,
    pub value: String,
}

/// Status of one facet within an otherwise successful or failed report.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct VerificationEvidence {
    pub code: &'static str,
    pub status: EvidenceStatus,
}

/// One named invariant and its acceptance threshold.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct VerificationResidual {
    pub code: &'static str,
    pub value: f64,
    pub tolerance: f64,
}

impl VerificationResidual {
    pub fn passed(self) -> bool {
        self.value.is_finite() && self.value.abs() <= self.tolerance
    }
}

/// Complete evidence returned by the public Verification Problem seam.
#[derive(Debug, Clone, PartialEq)]
pub struct VerificationReport {
    pub status: EvidenceStatus,
    pub provenance: VerificationProvenance,
    pub diagnostics: Vec<VerificationDiagnostic>,
    pub evidence: Vec<VerificationEvidence>,
    pub residuals: Vec<VerificationResidual>,
    pub mathematical_crosscheck: Option<MathematicalCrosscheck>,
    pub valencia_jacobians: Vec<ValenciaJacobianEvidence>,
    pub gray_m1_imex: Vec<GrayM1ImexEvidence>,
    pub flat_shock_tube: Option<FlatShockTubeEvidence>,
    pub radiative_shock_tube: Option<RadiativeShockTubeEvidence>,
}

/// Typed evidence for the deterministic flat-spacetime shock-tube ladder.
#[derive(Debug, Clone, PartialEq)]
pub struct FlatShockTubeEvidence {
    pub fixture: FlatShockTubeFixture,
    pub resolutions: Vec<FlatShockTubeResolutionEvidence>,
    pub finest_profile: Vec<FlatShockTubeCellEvidence>,
    pub convergence: FlatShockTubeConvergenceEvidence,
    pub limiting_cases: FlatShockTubeLimitingCases,
}

/// Repository-owned definition of the left and right shock-tube states.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct FlatShockTubeFixture {
    pub left_density: f64,
    pub left_pressure: f64,
    pub left_velocity: f64,
    pub right_density: f64,
    pub right_pressure: f64,
    pub right_velocity: f64,
}

/// Aggregate numerical evidence for one member of the resolution series.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct FlatShockTubeResolutionEvidence {
    pub cell_count: usize,
    pub steps: usize,
    pub recovery_attempts: usize,
    pub recovery_iterations: usize,
    pub corrected_recoveries: usize,
    pub failed_recoveries: usize,
    pub mass_conservation_residual: f64,
    pub momentum_conservation_residual: f64,
    pub energy_conservation_residual: f64,
}

/// Primitive and conservative state at one cell center on the finest grid.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct FlatShockTubeCellEvidence {
    pub position: f64,
    pub density: f64,
    pub pressure: f64,
    pub velocity: f64,
    pub lorentz_factor: f64,
    pub conserved_rest_mass: f64,
    pub conserved_momentum: f64,
    pub conserved_energy: f64,
}

/// Restriction-based density self-convergence evidence.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct FlatShockTubeConvergenceEvidence {
    pub coarse_to_medium_l1: f64,
    pub medium_to_fine_l1: f64,
    pub observed_order: f64,
}

/// Explicit limiting-case evidence for this hydrodynamics-only problem.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct FlatShockTubeLimitingCases {
    pub maximum_radiation_energy: f64,
    pub maximum_opacity: f64,
}

/// Four limiting-regime reports for the coupled radiative shock tube.
#[derive(Debug, Clone, PartialEq)]
pub struct RadiativeShockTubeEvidence {
    pub fixtures: Vec<RadiativeShockTubeFixtureEvidence>,
}

/// One deterministic opacity/exchange regime of the coupled problem.
#[derive(Debug, Clone, PartialEq)]
pub struct RadiativeShockTubeFixtureEvidence {
    pub case_id: &'static str,
    pub status: EvidenceStatus,
    pub interaction_rate: f64,
    pub equilibrium_radiation_energy: f64,
    pub maximum_exchange: f64,
    pub resolutions: Vec<RadiativeShockTubeResolutionEvidence>,
    pub finest_profile: Vec<RadiativeShockTubeCellEvidence>,
    pub density_convergence: FlatShockTubeConvergenceEvidence,
}

/// Aggregate recovery, realizability, and conservation evidence at one resolution.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct RadiativeShockTubeResolutionEvidence {
    pub cell_count: usize,
    pub steps: usize,
    pub recovery_attempts: usize,
    pub recovery_iterations: usize,
    pub failed_recoveries: usize,
    pub bounded_exchange_backoffs: usize,
    pub maximum_backoff_exponent: usize,
    pub maximum_reduced_flux: f64,
    pub rest_mass_conservation_residual: f64,
    pub total_energy_conservation_residual: f64,
    pub total_momentum_conservation_residual: f64,
}

/// Matter and gray-M1 state at one finest-grid cell center.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct RadiativeShockTubeCellEvidence {
    pub matter: FlatShockTubeCellEvidence,
    pub radiation_energy: f64,
    pub radiation_flux: f64,
    pub radiation_pressure: f64,
    pub reduced_flux: f64,
}

/// Three independent estimates of one derivative.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct MathematicalCrosscheck {
    pub symbolic_derivative: f64,
    pub hyperdual_derivative: f64,
    pub finite_difference_derivative: f64,
    pub maximum_disagreement: f64,
    pub maximum_expression_value_disagreement: f64,
}

/// Recovery outcome observed before evaluating one Valencia Jacobian fixture.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ValenciaRecoveryEvidence {
    NotAttempted,
    Recovered,
    Corrected,
    Failed,
}

/// Repository-owned three-way Jacobian evidence for one Valencia fixture.
#[derive(Debug, Clone, PartialEq)]
pub struct ValenciaJacobianEvidence {
    pub case_id: &'static str,
    pub status: EvidenceStatus,
    pub recovery: ValenciaRecoveryEvidence,
    pub primitive_to_conserved: Option<JacobianMapEvidence>,
    pub flux: Option<JacobianMapEvidence>,
}

/// Three-way derivative and point-value evidence for one Valencia map.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct JacobianMapEvidence {
    pub maximum_disagreement: f64,
    pub value_disagreement: f64,
    pub condition_number: f64,
}

impl JacobianMapEvidence {
    fn passed(self, tolerance: f64) -> bool {
        self.maximum_disagreement.is_finite()
            && self.maximum_disagreement <= tolerance
            && self.value_disagreement.is_finite()
            && self.value_disagreement <= tolerance
            && self.condition_number.is_finite()
    }
}

/// Closure or local source evidence for one deterministic gray-M1 fixture.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct GrayM1ImexEvidence {
    pub case_id: &'static str,
    pub status: EvidenceStatus,
    pub payload: GrayM1ImexPayload,
}

/// Evidence payloads keep closure, source, and rejected states unambiguous.
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum GrayM1ImexPayload {
    Closure {
        jacobian: Option<JacobianMapEvidence>,
        reduced_flux: f64,
        eddington_factor: f64,
    },
    ImexSource {
        jacobian: JacobianMapEvidence,
        reduced_flux: f64,
        eddington_factor: f64,
        /// Positive values transfer local thermal matter energy into radiation.
        exchanged_energy_density: f64,
        conservation_residual: f64,
    },
    Rejected {
        diagnostic_code: &'static str,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum RadiationJacobianKind {
    Closure,
    ImexSource,
}

type VerificationRunner = fn(&VerificationRequest, VerificationProvenance) -> VerificationReport;

struct VerificationDefinition {
    provenance: VerificationProvenance,
    run: VerificationRunner,
}

/// Evaluate one deterministic Verification Problem.
pub fn run_verification(request: VerificationRequest) -> VerificationReport {
    let definition = definition(request.problem);
    if !request.tolerance.is_finite() || request.tolerance < 0.0 {
        return VerificationReport {
            status: EvidenceStatus::Failed,
            provenance: definition.provenance,
            diagnostics: vec![VerificationDiagnostic {
                code: "verification.request.invalid-tolerance",
                message: "verification tolerance must be finite and non-negative".to_string(),
            }],
            evidence: vec![],
            residuals: vec![],
            mathematical_crosscheck: None,
            valencia_jacobians: vec![],
            gray_m1_imex: vec![],
            flat_shock_tube: None,
            radiative_shock_tube: None,
        };
    }

    (definition.run)(&request, definition.provenance)
}

fn definition(problem: VerificationProblem) -> VerificationDefinition {
    match problem {
        VerificationProblem::FlatSpacetimeInvariant => VerificationDefinition {
            provenance: VerificationProvenance {
                problem_id: "flat-spacetime-invariant",
                model: "minkowski-bssn-flat-empty",
                facts: vec![],
            },
            run: run_flat_spacetime_invariant,
        },
        VerificationProblem::AnalyticDerivativeIdentity => VerificationDefinition {
            provenance: VerificationProvenance {
                problem_id: "analytic-derivative-identity",
                model: "f(x)=x^3+2*x at x=2",
                facts: vec![],
            },
            run: run_analytic_derivative_identity,
        },
        VerificationProblem::ValenciaJacobians => VerificationDefinition {
            provenance: VerificationProvenance {
                problem_id: "valencia-jacobians",
                model: "flat-1d-valencia-ideal-gas",
                facts: vec![],
            },
            run: run_valencia_jacobians,
        },
        VerificationProblem::GrayM1AndImexJacobians => VerificationDefinition {
            provenance: VerificationProvenance {
                problem_id: "gray-m1-imex-jacobians",
                model: "gray-m1-closure-local-backward-euler-exchange",
                facts: vec![],
            },
            run: run_gray_m1_imex_jacobians,
        },
        VerificationProblem::FlatRelativisticShockTube => VerificationDefinition {
            provenance: VerificationProvenance {
                problem_id: "flat-relativistic-shock-tube",
                model: "minkowski-valencia-rusanov-shock-tube",
                facts: vec![
                    VerificationProvenanceFact {
                        key: "units",
                        value: "normalized-c=1".to_string(),
                    },
                    VerificationProvenanceFact {
                        key: "domain",
                        value: "[-0.5,0.5]".to_string(),
                    },
                    VerificationProvenanceFact {
                        key: "boundary-policy",
                        value: "fixed-end-cells".to_string(),
                    },
                    VerificationProvenanceFact {
                        key: "final-time",
                        value: "0.1".to_string(),
                    },
                    VerificationProvenanceFact {
                        key: "resolution-series",
                        value: "32,64,128".to_string(),
                    },
                ],
            },
            run: run_flat_relativistic_shock_tube,
        },
        VerificationProblem::RelativisticRadiativeShockTube => VerificationDefinition {
            provenance: VerificationProvenance {
                problem_id: "relativistic-radiative-shock-tube",
                model: "minkowski-valencia-gray-m1-bounded-imex-shock-tube",
                facts: vec![
                    VerificationProvenanceFact {
                        key: "units",
                        value: "normalized-c=1".to_string(),
                    },
                    VerificationProvenanceFact {
                        key: "domain",
                        value: "[-0.5,0.5]".to_string(),
                    },
                    VerificationProvenanceFact {
                        key: "boundary-policy",
                        value: "fixed-end-cells".to_string(),
                    },
                    VerificationProvenanceFact {
                        key: "final-time",
                        value: "0.1".to_string(),
                    },
                    VerificationProvenanceFact {
                        key: "resolution-series",
                        value: "32,64,128".to_string(),
                    },
                    VerificationProvenanceFact {
                        key: "coupling-policy",
                        value: "stationary-imex-request-conservative-moving-state-projection"
                            .to_string(),
                    },
                ],
            },
            run: run_relativistic_radiative_shock_tube,
        },
    }
}

fn run_relativistic_radiative_shock_tube(
    request: &VerificationRequest,
    mut provenance: VerificationProvenance,
) -> VerificationReport {
    let mut physics = match radiative_shock_tube::run_relativistic_radiative_shock_tube() {
        Ok(physics) => physics,
        Err(error) => {
            return VerificationReport {
                status: EvidenceStatus::Failed,
                provenance,
                diagnostics: vec![VerificationDiagnostic {
                    code: "verification.radiative-shock.execution-failed",
                    message: error,
                }],
                evidence: vec![],
                residuals: vec![],
                mathematical_crosscheck: None,
                valencia_jacobians: vec![],
                gray_m1_imex: vec![],
                flat_shock_tube: None,
                radiative_shock_tube: None,
            };
        }
    };
    let math_provenance = definition(VerificationProblem::GrayM1AndImexJacobians).provenance;
    let math_report = run_gray_m1_imex_jacobians(request, math_provenance);
    provenance
        .facts
        .extend(math_report.provenance.facts.clone());

    let mut residuals = math_report.residuals.clone();
    for fixture in &physics.fixtures {
        for resolution in &fixture.resolutions {
            residuals.extend([
                VerificationResidual {
                    code: "radiative-shock.rest-mass-conservation",
                    value: resolution.rest_mass_conservation_residual,
                    tolerance: request.tolerance,
                },
                VerificationResidual {
                    code: "radiative-shock.total-energy-conservation",
                    value: resolution.total_energy_conservation_residual,
                    tolerance: request.tolerance,
                },
                VerificationResidual {
                    code: "radiative-shock.total-momentum-conservation",
                    value: resolution.total_momentum_conservation_residual,
                    tolerance: request.tolerance,
                },
            ]);
        }
    }
    let recovery_passed = physics.fixtures.iter().all(radiative_recovery_passed);
    let realizability_passed = physics.fixtures.iter().all(radiative_realizability_passed);
    let conservation_passed = physics
        .fixtures
        .iter()
        .all(|fixture| radiative_conservation_passed(fixture, request.tolerance));
    let convergence_passed = physics.fixtures.iter().all(radiative_convergence_passed);
    let bounded_imex_passed = radiative_bounded_imex_passed(&physics);
    let fixture_acceptance = physics
        .fixtures
        .iter()
        .map(|fixture| radiative_fixture_passed(fixture, request.tolerance))
        .collect::<Vec<_>>();
    let physics_passed = fixture_acceptance.iter().all(|&passed| passed) && bounded_imex_passed;
    for (fixture, passed) in physics.fixtures.iter_mut().zip(fixture_acceptance) {
        fixture.status = evidence_status(passed);
    }
    let status = if physics_passed && math_report.status == EvidenceStatus::Evaluated {
        EvidenceStatus::Evaluated
    } else if physics_passed && math_report.status == EvidenceStatus::NotEvaluated {
        EvidenceStatus::NotEvaluated
    } else {
        EvidenceStatus::Failed
    };
    let mut diagnostics = math_report.diagnostics;
    if !physics_passed {
        diagnostics.push(VerificationDiagnostic {
            code: "verification.radiative-shock.evidence-failed",
            message: "radiative shock-tube evidence failed realizability, conservation, recovery, convergence, or bounded IMEX behavior"
                .to_string(),
        });
    }
    let mut evidence = physics
        .fixtures
        .iter()
        .map(|fixture| VerificationEvidence {
            code: match fixture.case_id {
                "hydrodynamic-limit" => "radiative-shock.hydrodynamic-limit",
                "equilibrium" => "radiative-shock.equilibrium",
                "optically-thin" => "radiative-shock.optically-thin",
                "optically-thick" => "radiative-shock.optically-thick",
                _ => "radiative-shock.unknown-fixture",
            },
            status: fixture.status,
        })
        .collect::<Vec<_>>();
    evidence.extend([
        VerificationEvidence {
            code: "radiative-shock.primitive-recovery",
            status: evidence_status(recovery_passed),
        },
        VerificationEvidence {
            code: "radiative-shock.realizability",
            status: evidence_status(realizability_passed),
        },
        VerificationEvidence {
            code: "radiative-shock.total-conservation",
            status: evidence_status(conservation_passed),
        },
        VerificationEvidence {
            code: "radiative-shock.self-convergence",
            status: evidence_status(convergence_passed),
        },
        VerificationEvidence {
            code: "radiative-shock.bounded-imex",
            status: evidence_status(bounded_imex_passed),
        },
        VerificationEvidence {
            code: "radiative-shock.mathematical-crosscheck",
            status: math_report.status,
        },
    ]);
    VerificationReport {
        status,
        provenance,
        diagnostics,
        evidence,
        residuals,
        mathematical_crosscheck: None,
        valencia_jacobians: vec![],
        gray_m1_imex: math_report.gray_m1_imex,
        flat_shock_tube: None,
        radiative_shock_tube: Some(physics),
    }
}

fn radiative_fixture_passed(fixture: &RadiativeShockTubeFixtureEvidence, tolerance: f64) -> bool {
    fixture.status == EvidenceStatus::Evaluated
        && radiative_recovery_passed(fixture)
        && radiative_realizability_passed(fixture)
        && radiative_conservation_passed(fixture, tolerance)
        && radiative_convergence_passed(fixture)
}

#[cfg(test)]
fn radiative_resolution_passed(
    resolution: &RadiativeShockTubeResolutionEvidence,
    tolerance: f64,
) -> bool {
    resolution.failed_recoveries == 0
        && resolution.maximum_reduced_flux.is_finite()
        && resolution.maximum_reduced_flux <= 1.0
        && resolution.rest_mass_conservation_residual.abs() <= tolerance
        && resolution.total_energy_conservation_residual.abs() <= tolerance
        && resolution.total_momentum_conservation_residual.abs() <= tolerance
}

fn radiative_recovery_passed(fixture: &RadiativeShockTubeFixtureEvidence) -> bool {
    fixture
        .resolutions
        .iter()
        .all(|resolution| resolution.failed_recoveries == 0)
}

fn radiative_realizability_passed(fixture: &RadiativeShockTubeFixtureEvidence) -> bool {
    fixture.resolutions.iter().all(|resolution| {
        resolution.maximum_reduced_flux.is_finite() && resolution.maximum_reduced_flux <= 1.0
    })
}

fn radiative_conservation_passed(
    fixture: &RadiativeShockTubeFixtureEvidence,
    tolerance: f64,
) -> bool {
    fixture.resolutions.iter().all(|resolution| {
        resolution.rest_mass_conservation_residual.abs() <= tolerance
            && resolution.total_energy_conservation_residual.abs() <= tolerance
            && resolution.total_momentum_conservation_residual.abs() <= tolerance
    })
}

fn radiative_convergence_passed(fixture: &RadiativeShockTubeFixtureEvidence) -> bool {
    fixture.density_convergence.coarse_to_medium_l1.is_finite()
        && fixture.density_convergence.medium_to_fine_l1.is_finite()
        && fixture.density_convergence.observed_order.is_finite()
        && fixture.density_convergence.medium_to_fine_l1
            < fixture.density_convergence.coarse_to_medium_l1
        && fixture.density_convergence.observed_order > 0.0
}

fn radiative_bounded_imex_passed(physics: &RadiativeShockTubeEvidence) -> bool {
    physics
        .fixtures
        .iter()
        .find(|fixture| fixture.case_id == "optically-thick")
        .is_some_and(|fixture| {
            fixture
                .resolutions
                .iter()
                .all(|resolution| resolution.bounded_exchange_backoffs > 0)
        })
}

fn run_flat_relativistic_shock_tube(
    request: &VerificationRequest,
    provenance: VerificationProvenance,
) -> VerificationReport {
    match shock_tube::run_flat_relativistic_shock_tube() {
        Ok(evidence) => {
            let residuals = evidence
                .resolutions
                .iter()
                .flat_map(|resolution| {
                    [
                        VerificationResidual {
                            code: "shock-tube.mass-conservation",
                            value: resolution.mass_conservation_residual,
                            tolerance: request.tolerance,
                        },
                        VerificationResidual {
                            code: "shock-tube.momentum-conservation",
                            value: resolution.momentum_conservation_residual,
                            tolerance: request.tolerance,
                        },
                        VerificationResidual {
                            code: "shock-tube.energy-conservation",
                            value: resolution.energy_conservation_residual,
                            tolerance: request.tolerance,
                        },
                    ]
                })
                .collect::<Vec<_>>();
            let recovery_passed = evidence.resolutions.iter().all(|resolution| {
                resolution.corrected_recoveries == 0 && resolution.failed_recoveries == 0
            });
            let convergence_passed = evidence.convergence.coarse_to_medium_l1.is_finite()
                && evidence.convergence.medium_to_fine_l1.is_finite()
                && evidence.convergence.observed_order.is_finite()
                && evidence.convergence.coarse_to_medium_l1 > 0.0
                && evidence.convergence.medium_to_fine_l1 > 0.0
                && evidence.convergence.medium_to_fine_l1
                    < evidence.convergence.coarse_to_medium_l1
                && evidence.convergence.observed_order > 0.0;
            let residuals_passed = residuals.iter().all(|residual| residual.passed());
            let passed = recovery_passed && convergence_passed && residuals_passed;
            let status = evidence_status(passed);
            let mut diagnostics = Vec::new();
            if !recovery_passed {
                diagnostics.push(VerificationDiagnostic {
                    code: "verification.shock-tube.primitive-recovery-failed",
                    message:
                        "shock-tube evolution required a corrective or failed primitive recovery"
                            .to_string(),
                });
            }
            if !convergence_passed {
                diagnostics.push(VerificationDiagnostic {
                    code: "verification.shock-tube.self-convergence-failed",
                    message: "shock-tube density profile did not self-converge".to_string(),
                });
            }
            if !residuals_passed {
                diagnostics.push(VerificationDiagnostic {
                    code: "verification.shock-tube.conservation-failed",
                    message: "shock-tube conservation residual exceeded tolerance".to_string(),
                });
            }
            VerificationReport {
                status,
                provenance,
                diagnostics,
                evidence: vec![
                    VerificationEvidence {
                        code: "shock-tube.profiles",
                        status,
                    },
                    VerificationEvidence {
                        code: "shock-tube.primitive-recovery",
                        status: evidence_status(recovery_passed),
                    },
                    VerificationEvidence {
                        code: "shock-tube.self-convergence",
                        status: evidence_status(convergence_passed),
                    },
                    VerificationEvidence {
                        code: "shock-tube.zero-radiation-limit",
                        status: EvidenceStatus::Evaluated,
                    },
                    VerificationEvidence {
                        code: "shock-tube.zero-opacity-limit",
                        status: EvidenceStatus::Evaluated,
                    },
                ],
                residuals,
                mathematical_crosscheck: None,
                valencia_jacobians: vec![],
                gray_m1_imex: vec![],
                flat_shock_tube: Some(evidence),
                radiative_shock_tube: None,
            }
        }
        Err(error) => VerificationReport {
            status: EvidenceStatus::Failed,
            provenance,
            diagnostics: vec![VerificationDiagnostic {
                code: "verification.shock-tube.execution-failed",
                message: error,
            }],
            evidence: vec![VerificationEvidence {
                code: "shock-tube.profiles",
                status: EvidenceStatus::Failed,
            }],
            residuals: vec![],
            mathematical_crosscheck: None,
            valencia_jacobians: vec![],
            gray_m1_imex: vec![],
            flat_shock_tube: None,
            radiative_shock_tube: None,
        },
    }
}

fn run_flat_spacetime_invariant(
    request: &VerificationRequest,
    provenance: VerificationProvenance,
) -> VerificationReport {
    let tolerance = request.tolerance;
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 1, 1]);
    let config = KernelConfig::flat_empty(grid, CoordinateTime::ZERO);
    let result = KernelState::from_config(&config)
        .map_err(|error| error.to_string())
        .and_then(|state| {
            DynamicalSpacetimeKernel::new(config)
                .step(state, TimeDuration::from_seconds(0.25))
                .map_err(|failure| failure.error.to_string())
        });

    match result {
        Ok(result) => {
            let bssn = result.diagnostics.bssn;
            let residuals = vec![
                VerificationResidual {
                    code: "bssn.hamiltonian-linf",
                    value: bssn.hamiltonian_linf,
                    tolerance,
                },
                VerificationResidual {
                    code: "bssn.momentum-linf",
                    value: bssn.momentum_linf,
                    tolerance,
                },
                VerificationResidual {
                    code: "bssn.determinant-linf",
                    value: bssn.determinant_linf,
                    tolerance,
                },
                VerificationResidual {
                    code: "bssn.trace-free-linf",
                    value: bssn.trace_free_linf,
                    tolerance,
                },
            ];
            let passed = residuals.iter().all(|residual| residual.passed());
            VerificationReport {
                status: if passed {
                    EvidenceStatus::Evaluated
                } else {
                    EvidenceStatus::Failed
                },
                provenance,
                diagnostics: if passed {
                    vec![]
                } else {
                    vec![VerificationDiagnostic {
                        code: "verification.flat-spacetime.residual-exceeded",
                        message: "flat-spacetime invariant exceeded its tolerance".to_string(),
                    }]
                },
                evidence: vec![
                    VerificationEvidence {
                        code: "flat-spacetime.constraints",
                        status: if passed {
                            EvidenceStatus::Evaluated
                        } else {
                            EvidenceStatus::Failed
                        },
                    },
                    VerificationEvidence {
                        code: "mathematical-crosscheck",
                        status: EvidenceStatus::NotEvaluated,
                    },
                ],
                residuals,
                mathematical_crosscheck: None,
                valencia_jacobians: vec![],
                gray_m1_imex: vec![],
                flat_shock_tube: None,
                radiative_shock_tube: None,
            }
        }
        Err(error) => VerificationReport {
            status: EvidenceStatus::Failed,
            provenance,
            diagnostics: vec![VerificationDiagnostic {
                code: "verification.flat-spacetime.kernel-failed",
                message: error.to_string(),
            }],
            evidence: vec![VerificationEvidence {
                code: "flat-spacetime.constraints",
                status: EvidenceStatus::Failed,
            }],
            residuals: vec![],
            mathematical_crosscheck: None,
            valencia_jacobians: vec![],
            gray_m1_imex: vec![],
            flat_shock_tube: None,
            radiative_shock_tube: None,
        },
    }
}

fn run_analytic_derivative_identity(
    request: &VerificationRequest,
    mut provenance: VerificationProvenance,
) -> VerificationReport {
    let Some(worker_path) = request.math_worker.as_deref() else {
        return VerificationReport {
            status: EvidenceStatus::NotEvaluated,
            provenance,
            diagnostics: vec![VerificationDiagnostic {
                code: "verification.math.worker-unavailable",
                message: "an isolated mathematical worker was not supplied".to_string(),
            }],
            evidence: vec![VerificationEvidence {
                code: "mathematical-crosscheck",
                status: EvidenceStatus::NotEvaluated,
            }],
            residuals: vec![],
            mathematical_crosscheck: None,
            valencia_jacobians: vec![],
            gray_m1_imex: vec![],
            flat_shock_tube: None,
            radiative_shock_tube: None,
        };
    };
    let tolerance = request.tolerance;
    let result = match math_gateway::crosscheck_derivative(worker_path) {
        Ok(result) => result,
        Err(error) => {
            return VerificationReport {
                status: EvidenceStatus::Failed,
                provenance,
                diagnostics: vec![VerificationDiagnostic {
                    code: "verification.math.symbolic-evaluation-failed",
                    message: error,
                }],
                evidence: vec![VerificationEvidence {
                    code: "mathematical-crosscheck",
                    status: EvidenceStatus::Failed,
                }],
                residuals: vec![],
                mathematical_crosscheck: None,
                valencia_jacobians: vec![],
                gray_m1_imex: vec![],
                flat_shock_tube: None,
                radiative_shock_tube: None,
            };
        }
    };

    provenance.facts = vec![
        VerificationProvenanceFact {
            key: "symbolica.version",
            value: "2.1.0".to_string(),
        },
        VerificationProvenanceFact {
            key: "numerica.version",
            value: "2.1.0".to_string(),
        },
        VerificationProvenanceFact {
            key: "expression.sha256",
            value: result.expression_sha256,
        },
        VerificationProvenanceFact {
            key: "derivative.convention",
            value: "ordinary-first-derivative".to_string(),
        },
        VerificationProvenanceFact {
            key: "finite-difference.step",
            value: "1e-5".to_string(),
        },
        VerificationProvenanceFact {
            key: "tolerance",
            value: format!("{tolerance:e}")
                .replace("e-0", "e-")
                .replace("e+0", "e+"),
        },
        VerificationProvenanceFact {
            key: "symbolica.license-state",
            value: result.symbolica_license.provenance_value().to_string(),
        },
    ];

    let pairwise_disagreements = [
        (result.symbolic_derivative - result.hyperdual_derivative).abs(),
        (result.symbolic_derivative - result.finite_difference_derivative).abs(),
        (result.hyperdual_derivative - result.finite_difference_derivative).abs(),
    ];
    let maximum_disagreement = pairwise_disagreements.into_iter().fold(0.0, f64::max);
    let residuals = vec![
        VerificationResidual {
            code: "derivative.maximum-disagreement",
            value: maximum_disagreement,
            tolerance,
        },
        VerificationResidual {
            code: "expression.maximum-value-disagreement",
            value: result.maximum_value_disagreement,
            tolerance,
        },
    ];
    let passed = residuals.iter().all(|residual| residual.passed());
    let mut diagnostics: Vec<_> = result
        .symbolica_license
        .diagnostic_codes()
        .iter()
        .map(|&code| VerificationDiagnostic {
            code,
            message: "Symbolica is operating without a confirmed license; upstream terms apply"
                .to_string(),
        })
        .collect();
    if !passed {
        diagnostics.push(VerificationDiagnostic {
            code: "verification.math.crosscheck-disagreement",
            message: "mathematical cross-check evidence disagrees beyond the requested tolerance"
                .to_string(),
        });
    }

    VerificationReport {
        status: if passed {
            EvidenceStatus::Evaluated
        } else {
            EvidenceStatus::Failed
        },
        provenance,
        diagnostics,
        evidence: vec![VerificationEvidence {
            code: "mathematical-crosscheck",
            status: if passed {
                EvidenceStatus::Evaluated
            } else {
                EvidenceStatus::Failed
            },
        }],
        residuals,
        mathematical_crosscheck: Some(MathematicalCrosscheck {
            symbolic_derivative: result.symbolic_derivative,
            hyperdual_derivative: result.hyperdual_derivative,
            finite_difference_derivative: result.finite_difference_derivative,
            maximum_disagreement,
            maximum_expression_value_disagreement: result.maximum_value_disagreement,
        }),
        valencia_jacobians: vec![],
        gray_m1_imex: vec![],
        flat_shock_tube: None,
        radiative_shock_tube: None,
    }
}

fn run_valencia_jacobians(
    request: &VerificationRequest,
    mut provenance: VerificationProvenance,
) -> VerificationReport {
    let Some(worker_path) = request.math_worker.as_deref() else {
        return VerificationReport {
            status: EvidenceStatus::NotEvaluated,
            provenance,
            diagnostics: vec![VerificationDiagnostic {
                code: "verification.math.worker-unavailable",
                message: "an isolated mathematical worker was not supplied".to_string(),
            }],
            evidence: vec![
                VerificationEvidence {
                    code: "valencia.primitive-to-conserved-jacobian",
                    status: EvidenceStatus::NotEvaluated,
                },
                VerificationEvidence {
                    code: "valencia.flux-jacobian",
                    status: EvidenceStatus::NotEvaluated,
                },
            ],
            residuals: vec![],
            mathematical_crosscheck: None,
            valencia_jacobians: vec![],
            gray_m1_imex: vec![],
            flat_shock_tube: None,
            radiative_shock_tube: None,
        };
    };

    provenance.facts = vec![
        VerificationProvenanceFact {
            key: "symbolica.version",
            value: "2.1.0".to_string(),
        },
        VerificationProvenanceFact {
            key: "numerica.version",
            value: "2.1.0".to_string(),
        },
        VerificationProvenanceFact {
            key: "equation-of-state.gamma",
            value: "2".to_string(),
        },
        VerificationProvenanceFact {
            key: "variables",
            value: "rho,vx,epsilon".to_string(),
        },
        VerificationProvenanceFact {
            key: "jacobian.convention",
            value: "rows=outputs;columns=inputs".to_string(),
        },
        VerificationProvenanceFact {
            key: "finite-difference.convention",
            value: "centered-relative-step-1e-6-floor-1e-8".to_string(),
        },
        VerificationProvenanceFact {
            key: "tolerance",
            value: format!("{:e}", request.tolerance)
                .replace("e-0", "e-")
                .replace("e+0", "e+"),
        },
    ];

    let eos = ValenciaIdealGas { gamma: 2.0 };
    let fixtures = [
        ("admissible", [1.0, 0.2, 0.5], None),
        ("slow-flow", [1.0, 1.0e-3, 0.5], None),
        ("relativistic", [1.0, 0.9, 0.5], None),
        ("near-vacuum", [1.0e-9, 0.1, 0.1], None),
        (
            "singular",
            [1.0, 1.0, 0.5],
            Some("verification.valencia.singular-state"),
        ),
        (
            "non-admissible",
            [-1.0, 0.2, 0.5],
            Some("verification.valencia.non-admissible-state"),
        ),
    ];
    let mut diagnostics = Vec::new();
    let mut residuals = Vec::new();
    let mut cases = Vec::new();
    let mut evaluated_cases_passed = true;
    let mut license_state = None;

    for (case_id, [density, velocity, energy], rejection_code) in fixtures {
        let primitive = ValenciaPrimitive {
            rest_mass_density: density,
            velocity: vec3::new(velocity, 0.0, 0.0),
            specific_internal_energy: energy,
            pressure: density * energy,
        };
        let conserved = match primitive_to_conserved(primitive, eos, ValenciaGeometry::FLAT) {
            Ok(conserved) => conserved,
            Err(error) => {
                if let Some(code) = rejection_code {
                    diagnostics.push(VerificationDiagnostic {
                        code,
                        message: format!(
                            "Valencia fixture {case_id} was rejected before differentiation"
                        ),
                    });
                    cases.push(empty_valencia_case(
                        case_id,
                        EvidenceStatus::NotEvaluated,
                        ValenciaRecoveryEvidence::NotAttempted,
                    ));
                    continue;
                }
                diagnostics.push(VerificationDiagnostic {
                    code: "verification.valencia.primitive-map-failed",
                    message: format!("Valencia fixture {case_id} failed: {error}"),
                });
                cases.push(empty_valencia_case(
                    case_id,
                    EvidenceStatus::Failed,
                    ValenciaRecoveryEvidence::NotAttempted,
                ));
                evaluated_cases_passed = false;
                continue;
            }
        };

        let recovery = match recover_primitives(
            conserved,
            eos,
            ValenciaGeometry::FLAT,
            PrimitiveRecoveryPolicy::DEFAULT,
        ) {
            Ok(outcome) => recovery_evidence(&outcome.diagnostics),
            Err(_) => ValenciaRecoveryEvidence::Failed,
        };
        if recovery != ValenciaRecoveryEvidence::Recovered {
            diagnostics.push(VerificationDiagnostic {
                code: "verification.valencia.primitive-recovery-failed",
                message: format!(
                    "Valencia fixture {case_id} required correction or failed primitive recovery"
                ),
            });
            cases.push(empty_valencia_case(
                case_id,
                EvidenceStatus::Failed,
                recovery,
            ));
            evaluated_cases_passed = false;
            continue;
        }

        let result = match math_gateway::crosscheck_valencia_jacobians(
            worker_path,
            [density, velocity, energy],
            |state| production_valencia_maps(state, eos),
        ) {
            Ok(result) => result,
            Err(error) => {
                diagnostics.push(VerificationDiagnostic {
                    code: "verification.valencia.symbolic-evaluation-failed",
                    message: error,
                });
                cases.push(empty_valencia_case(
                    case_id,
                    EvidenceStatus::Failed,
                    recovery,
                ));
                evaluated_cases_passed = false;
                continue;
            }
        };
        license_state = Some(result.symbolica_license);
        for &code in result.symbolica_license.diagnostic_codes() {
            if !diagnostics.iter().any(|diagnostic| diagnostic.code == code) {
                diagnostics.push(VerificationDiagnostic {
                    code,
                    message:
                        "Symbolica is operating without a confirmed license; upstream terms apply"
                            .to_string(),
                });
            }
        }
        let passed = [
            result.primitive_to_conserved.maximum_disagreement,
            result.flux.maximum_disagreement,
            result.primitive_to_conserved.value_disagreement,
            result.flux.value_disagreement,
        ]
        .into_iter()
        .all(|value| value.is_finite() && value <= request.tolerance)
            && result.primitive_to_conserved.condition_number.is_some()
            && result.flux.condition_number.is_some();
        if !passed {
            diagnostics.push(VerificationDiagnostic {
                code: "verification.valencia.jacobian-disagreement",
                message: format!("Valencia fixture {case_id} failed its Jacobian cross-check"),
            });
            evaluated_cases_passed = false;
        }
        residuals.extend([
            VerificationResidual {
                code: "valencia.primitive-to-conserved-jacobian-disagreement",
                value: result.primitive_to_conserved.maximum_disagreement,
                tolerance: request.tolerance,
            },
            VerificationResidual {
                code: "valencia.flux-jacobian-disagreement",
                value: result.flux.maximum_disagreement,
                tolerance: request.tolerance,
            },
            VerificationResidual {
                code: "valencia.primitive-to-conserved-value-disagreement",
                value: result.primitive_to_conserved.value_disagreement,
                tolerance: request.tolerance,
            },
            VerificationResidual {
                code: "valencia.flux-value-disagreement",
                value: result.flux.value_disagreement,
                tolerance: request.tolerance,
            },
        ]);
        cases.push(ValenciaJacobianEvidence {
            case_id,
            status: if passed {
                EvidenceStatus::Evaluated
            } else {
                EvidenceStatus::Failed
            },
            recovery,
            primitive_to_conserved: result.primitive_to_conserved.condition_number.map(
                |condition_number| JacobianMapEvidence {
                    maximum_disagreement: result.primitive_to_conserved.maximum_disagreement,
                    value_disagreement: result.primitive_to_conserved.value_disagreement,
                    condition_number,
                },
            ),
            flux: result
                .flux
                .condition_number
                .map(|condition_number| JacobianMapEvidence {
                    maximum_disagreement: result.flux.maximum_disagreement,
                    value_disagreement: result.flux.value_disagreement,
                    condition_number,
                }),
        });
    }

    if let Some(license_state) = license_state {
        provenance.facts.push(VerificationProvenanceFact {
            key: "symbolica.license-state",
            value: license_state.provenance_value().to_string(),
        });
    }
    let status = if evaluated_cases_passed {
        EvidenceStatus::Evaluated
    } else {
        EvidenceStatus::Failed
    };
    VerificationReport {
        status,
        provenance,
        diagnostics,
        evidence: vec![
            VerificationEvidence {
                code: "valencia.primitive-to-conserved-jacobian",
                status,
            },
            VerificationEvidence {
                code: "valencia.flux-jacobian",
                status,
            },
        ],
        residuals,
        mathematical_crosscheck: None,
        valencia_jacobians: cases,
        gray_m1_imex: vec![],
        flat_shock_tube: None,
        radiative_shock_tube: None,
    }
}

fn run_gray_m1_imex_jacobians(
    request: &VerificationRequest,
    mut provenance: VerificationProvenance,
) -> VerificationReport {
    let Some(worker_path) = request.math_worker.as_deref() else {
        return VerificationReport {
            status: EvidenceStatus::NotEvaluated,
            provenance,
            diagnostics: vec![VerificationDiagnostic {
                code: "verification.math.worker-unavailable",
                message: "an isolated mathematical worker was not supplied".to_string(),
            }],
            evidence: vec![
                VerificationEvidence {
                    code: "gray-m1.closure-jacobian",
                    status: EvidenceStatus::NotEvaluated,
                },
                VerificationEvidence {
                    code: "gray-m1.imex-source-jacobian",
                    status: EvidenceStatus::NotEvaluated,
                },
            ],
            residuals: vec![],
            mathematical_crosscheck: None,
            valencia_jacobians: vec![],
            gray_m1_imex: vec![],
            flat_shock_tube: None,
            radiative_shock_tube: None,
        };
    };

    provenance.facts = vec![
        VerificationProvenanceFact {
            key: "symbolica.version",
            value: "2.1.0".to_string(),
        },
        VerificationProvenanceFact {
            key: "numerica.version",
            value: "2.1.0".to_string(),
        },
        VerificationProvenanceFact {
            key: "radiation.representation",
            value: "deterministic gray-M1 moment fields".to_string(),
        },
        VerificationProvenanceFact {
            key: "closure.variables",
            value: "energy-density,orthonormal-x-flux".to_string(),
        },
        VerificationProvenanceFact {
            key: "source.variables",
            value: "matter-internal-energy-density,radiation-energy-density".to_string(),
        },
        VerificationProvenanceFact {
            key: "jacobian.convention",
            value: "rows=outputs;columns=inputs".to_string(),
        },
        VerificationProvenanceFact {
            key: "finite-difference.convention",
            value: "centered-relative-step-1e-6-floor-1".to_string(),
        },
    ];

    let mut diagnostics = Vec::new();
    let mut residuals = Vec::new();
    let mut cases = Vec::new();
    let mut license_state = None;

    let intermediate_state = [2.0, 1.0];
    match math_gateway::crosscheck_gray_m1_jacobian(
        worker_path,
        intermediate_state,
        production_gray_m1_map,
    ) {
        Ok(result) => {
            license_state = Some(result.symbolica_license);
            let evidence = gateway_map_evidence(result.map);
            let case_passed = evidence.is_some_and(|map| map.passed(request.tolerance));
            residuals.extend(gateway_residuals(
                RadiationJacobianKind::Closure,
                result.map,
                request.tolerance,
            ));
            match production_gray_m1(intermediate_state) {
                Ok((reduced_flux, eddington_factor)) => cases.push(GrayM1ImexEvidence {
                    case_id: "closure-intermediate",
                    status: evidence_status(case_passed),
                    payload: GrayM1ImexPayload::Closure {
                        jacobian: evidence,
                        reduced_flux,
                        eddington_factor,
                    },
                }),
                Err(error) => {
                    diagnostics.push(VerificationDiagnostic {
                        code: "verification.gray-m1.closure-failed",
                        message: error,
                    });
                    cases.push(rejected_gray_m1_case(
                        "closure-intermediate",
                        EvidenceStatus::Failed,
                        "verification.gray-m1.closure-failed",
                    ));
                }
            }
        }
        Err(error) => {
            diagnostics.push(VerificationDiagnostic {
                code: "verification.gray-m1.symbolic-evaluation-failed",
                message: error,
            });
            cases.push(rejected_gray_m1_case(
                "closure-intermediate",
                EvidenceStatus::Failed,
                "verification.gray-m1.symbolic-evaluation-failed",
            ));
        }
    }

    for (case_id, state) in [
        ("closure-isotropic-limit", [2.0, 0.0]),
        ("closure-free-streaming-limit", [2.0, 2.0]),
    ] {
        match production_gray_m1(state) {
            Ok((reduced_flux, eddington_factor)) => cases.push(GrayM1ImexEvidence {
                case_id,
                status: EvidenceStatus::Evaluated,
                payload: GrayM1ImexPayload::Closure {
                    jacobian: None,
                    reduced_flux,
                    eddington_factor,
                },
            }),
            Err(error) => {
                diagnostics.push(VerificationDiagnostic {
                    code: "verification.gray-m1.closure-limit-failed",
                    message: error,
                });
                cases.push(rejected_gray_m1_case(
                    case_id,
                    EvidenceStatus::Failed,
                    "verification.gray-m1.closure-limit-failed",
                ));
            }
        }
    }

    let nonphysical = [1.0, 1.1];
    let nonphysical_rejected = production_gray_m1_map(nonphysical).is_err();
    let (nonphysical_code, nonphysical_message) = if nonphysical_rejected {
        (
            "verification.gray-m1.nonphysical-state",
            "superluminal gray-M1 flux was rejected before differentiation",
        )
    } else {
        (
            "verification.gray-m1.nonphysical-state-accepted",
            "superluminal gray-M1 flux was incorrectly accepted",
        )
    };
    diagnostics.push(VerificationDiagnostic {
        code: nonphysical_code,
        message: nonphysical_message.to_string(),
    });
    cases.push(rejected_gray_m1_case(
        "closure-nonphysical",
        if nonphysical_rejected {
            EvidenceStatus::NotEvaluated
        } else {
            EvidenceStatus::Failed
        },
        nonphysical_code,
    ));

    let eos = ValenciaIdealGas { gamma: 2.0 };
    for (case_id, state, equilibrium_energy) in [
        ("exchange-equilibrium", [2.0, 2.0], 2.0),
        ("exchange-stiff-emission", [5.0, 1.0], 3.0),
        ("exchange-stiff-absorption", [2.0, 3.0], 1.0),
    ] {
        let interaction_rate = 100.0;
        let timestep = 0.5;
        let production =
            |state| production_imex_map(state, eos, interaction_rate, timestep, equilibrium_energy);
        match math_gateway::crosscheck_imex_source_jacobian(
            worker_path,
            state,
            interaction_rate,
            timestep,
            equilibrium_energy,
            production,
        ) {
            Ok(result) => {
                license_state = Some(result.symbolica_license);
                let outcome = production_imex_outcome(
                    state,
                    eos,
                    interaction_rate,
                    timestep,
                    equilibrium_energy,
                );
                let evidence = gateway_map_evidence(result.map);
                let case_passed = evidence.is_some_and(|map| map.passed(request.tolerance));
                residuals.extend(gateway_residuals(
                    RadiationJacobianKind::ImexSource,
                    result.map,
                    request.tolerance,
                ));
                match (outcome, evidence) {
                    (Ok(outcome), Some(jacobian)) => cases.push(GrayM1ImexEvidence {
                        case_id,
                        status: evidence_status(case_passed),
                        payload: GrayM1ImexPayload::ImexSource {
                            jacobian,
                            reduced_flux: 0.0,
                            eddington_factor: isotropic_eddington_factor(),
                            exchanged_energy_density: outcome.diagnostics.exchanged_energy_density,
                            conservation_residual: outcome.diagnostics.conservation_residual,
                        },
                    }),
                    (Err(error), _) => {
                        diagnostics.push(VerificationDiagnostic {
                            code: "verification.gray-m1.imex-source-failed",
                            message: error,
                        });
                        cases.push(rejected_gray_m1_case(
                            case_id,
                            EvidenceStatus::Failed,
                            "verification.gray-m1.imex-source-failed",
                        ));
                    }
                    (Ok(_), None) => cases.push(rejected_gray_m1_case(
                        case_id,
                        EvidenceStatus::Failed,
                        "verification.gray-m1.jacobian-unavailable",
                    )),
                }
            }
            Err(error) => {
                diagnostics.push(VerificationDiagnostic {
                    code: "verification.gray-m1.symbolic-evaluation-failed",
                    message: error,
                });
                cases.push(rejected_gray_m1_case(
                    case_id,
                    EvidenceStatus::Failed,
                    "verification.gray-m1.symbolic-evaluation-failed",
                ));
            }
        }
    }

    let passed = gray_m1_report_passed(&cases, &residuals);
    if let Some(license_state) = license_state {
        provenance.facts.push(VerificationProvenanceFact {
            key: "symbolica.license-state",
            value: license_state.provenance_value().to_string(),
        });
        for &code in license_state.diagnostic_codes() {
            diagnostics.push(VerificationDiagnostic {
                code,
                message: "Symbolica is operating without a confirmed license; upstream terms apply"
                    .to_string(),
            });
        }
    }
    append_gray_m1_disagreement_diagnostic(passed, &mut diagnostics);
    let status = evidence_status(passed);
    VerificationReport {
        status,
        provenance,
        diagnostics,
        evidence: vec![
            VerificationEvidence {
                code: "gray-m1.closure-jacobian",
                status,
            },
            VerificationEvidence {
                code: "gray-m1.imex-source-jacobian",
                status,
            },
        ],
        residuals,
        mathematical_crosscheck: None,
        valencia_jacobians: vec![],
        gray_m1_imex: cases,
        flat_shock_tube: None,
        radiative_shock_tube: None,
    }
}

fn evidence_status(passed: bool) -> EvidenceStatus {
    if passed {
        EvidenceStatus::Evaluated
    } else {
        EvidenceStatus::Failed
    }
}

fn isotropic_eddington_factor() -> f64 {
    1.0 / 3.0
}

fn append_gray_m1_disagreement_diagnostic(
    passed: bool,
    diagnostics: &mut Vec<VerificationDiagnostic>,
) {
    if !passed {
        diagnostics.push(VerificationDiagnostic {
            code: "verification.gray-m1.jacobian-disagreement",
            message: "gray-M1 or IMEX source evidence exceeded its tolerance".to_string(),
        });
    }
}

fn gray_m1_report_passed(cases: &[GrayM1ImexEvidence], residuals: &[VerificationResidual]) -> bool {
    cases
        .iter()
        .all(|case| case.status != EvidenceStatus::Failed)
        && residuals.iter().all(|residual| residual.passed())
}

fn gateway_map_evidence(map: math_gateway::JacobianGatewayEvidence) -> Option<JacobianMapEvidence> {
    map.condition_number
        .map(|condition_number| JacobianMapEvidence {
            maximum_disagreement: map.maximum_disagreement,
            value_disagreement: map.value_disagreement,
            condition_number,
        })
}

fn gateway_residuals(
    kind: RadiationJacobianKind,
    map: math_gateway::JacobianGatewayEvidence,
    tolerance: f64,
) -> [VerificationResidual; 2] {
    let (jacobian_code, value_code) = match kind {
        RadiationJacobianKind::Closure => (
            "gray-m1.closure-jacobian-disagreement",
            "gray-m1.closure-value-disagreement",
        ),
        RadiationJacobianKind::ImexSource => (
            "gray-m1.imex-source-jacobian-disagreement",
            "gray-m1.imex-source-value-disagreement",
        ),
    };
    [
        VerificationResidual {
            code: jacobian_code,
            value: map.maximum_disagreement,
            tolerance,
        },
        VerificationResidual {
            code: value_code,
            value: map.value_disagreement,
            tolerance,
        },
    ]
}

fn rejected_gray_m1_case(
    case_id: &'static str,
    status: EvidenceStatus,
    diagnostic_code: &'static str,
) -> GrayM1ImexEvidence {
    GrayM1ImexEvidence {
        case_id,
        status,
        payload: GrayM1ImexPayload::Rejected { diagnostic_code },
    }
}

fn production_gray_m1([energy, flux]: [f64; 2]) -> Result<(f64, f64), String> {
    let closed = close_production_gray_m1([energy, flux])?;
    Ok((
        closed.diagnostics.reduced_flux,
        closed.diagnostics.eddington_factor,
    ))
}

fn close_production_gray_m1(
    [energy, flux]: [f64; 2],
) -> Result<crate::radiation::ClosedOrthonormalRadiationMoments, String> {
    close_gray_m1_moments(
        RadiationTransportMode::GrayM1,
        OrthonormalGrayRadiationMoments::new(energy, vec3::new(flux, 0.0, 0.0)),
    )
    .map_err(|error| format!("production gray-M1 closure failed: {error}"))
}

fn production_gray_m1_map(state: [f64; 2]) -> Result<[f64; 2], String> {
    let closed = close_production_gray_m1(state)?;
    Ok([
        closed.diagnostics.eddington_factor,
        closed.pressure.component(0, 0),
    ])
}

fn production_imex_map(
    state: [f64; 2],
    eos: ValenciaIdealGas,
    interaction_rate: f64,
    timestep: f64,
    equilibrium_energy: f64,
) -> Result<[f64; 2], String> {
    let outcome =
        production_imex_outcome(state, eos, interaction_rate, timestep, equilibrium_energy)?;
    Ok([
        outcome.state.matter.rest_mass_density * outcome.state.matter.specific_internal_energy,
        outcome.state.radiation.energy_density,
    ])
}

fn production_imex_outcome(
    [matter_energy, radiation_energy]: [f64; 2],
    eos: ValenciaIdealGas,
    interaction_rate: f64,
    timestep: f64,
    equilibrium_energy: f64,
) -> Result<crate::RadiationMatterExchangeOutcome, String> {
    let matter = ValenciaPrimitive {
        rest_mass_density: 1.0,
        velocity: vec3::ZERO,
        specific_internal_energy: matter_energy,
        pressure: matter_energy,
    };
    radiation_matter_exchange_semi_implicit(
        LocalRadiationMatterExchangeState {
            matter,
            radiation: OrthonormalGrayRadiationMoments::new(radiation_energy, vec3::ZERO),
        },
        eos,
        RadiationMatterExchangeConfig {
            timestep: TimeDuration::from_seconds(timestep),
            interaction_rate,
            equilibrium_radiation_energy_density: equilibrium_energy,
        },
    )
    .map_err(|failure| format!("production IMEX source failed: {:?}", failure.diagnostics))
}

fn recovery_evidence(diagnostics: &[PrimitiveRecoveryDiagnostic]) -> ValenciaRecoveryEvidence {
    if diagnostics.iter().any(|diagnostic| {
        matches!(
            diagnostic,
            PrimitiveRecoveryDiagnostic::AtmosphereApplied
                | PrimitiveRecoveryDiagnostic::DensityFloorApplied
                | PrimitiveRecoveryDiagnostic::PressureFloorApplied
                | PrimitiveRecoveryDiagnostic::LorentzFactorCapped
                | PrimitiveRecoveryDiagnostic::InvalidConservedState
                | PrimitiveRecoveryDiagnostic::EquationOfStateOutOfBounds
        )
    }) {
        ValenciaRecoveryEvidence::Corrected
    } else {
        ValenciaRecoveryEvidence::Recovered
    }
}

fn empty_valencia_case(
    case_id: &'static str,
    status: EvidenceStatus,
    recovery: ValenciaRecoveryEvidence,
) -> ValenciaJacobianEvidence {
    ValenciaJacobianEvidence {
        case_id,
        status,
        recovery,
        primitive_to_conserved: None,
        flux: None,
    }
}

fn production_valencia_maps(state: [f64; 3], eos: ValenciaIdealGas) -> Result<[f64; 6], String> {
    let [density, velocity, energy] = state;
    let primitive = ValenciaPrimitive {
        rest_mass_density: density,
        velocity: vec3::new(velocity, 0.0, 0.0),
        specific_internal_energy: energy,
        pressure: density * energy,
    };
    let conserved = primitive_to_conserved(primitive, eos, ValenciaGeometry::FLAT)
        .map_err(|error| format!("production primitive-to-conserved map failed: {error}"))?;
    let flux = crate::grhd::valencia_physical_flux_1d(conserved, primitive)
        .map_err(|error| format!("production Valencia flux map failed: {error}"))?;
    Ok([
        conserved.densitized_rest_mass,
        conserved.momentum_density.x,
        conserved.energy_excluding_rest_mass,
        flux[0],
        flux[1],
        flux[2],
    ])
}

#[cfg(test)]
mod gray_m1_verification_tests {
    use super::{
        JacobianMapEvidence, RadiationJacobianKind, VerificationResidual,
        append_gray_m1_disagreement_diagnostic, gateway_residuals, gray_m1_report_passed,
        isotropic_eddington_factor, production_gray_m1_map, rejected_gray_m1_case,
    };
    use crate::kernel::EvidenceStatus;
    use crate::math_gateway::JacobianGatewayEvidence;

    #[test]
    fn map_and_report_acceptance_require_every_invariant() {
        let passing = JacobianMapEvidence {
            maximum_disagreement: 1.0e-8,
            value_disagreement: 2.0e-8,
            condition_number: 3.0,
        };
        assert!(passing.passed(1.0e-6));
        assert!(
            !JacobianMapEvidence {
                maximum_disagreement: 2.0e-6,
                ..passing
            }
            .passed(1.0e-6)
        );
        assert!(
            !JacobianMapEvidence {
                value_disagreement: 2.0e-6,
                ..passing
            }
            .passed(1.0e-6)
        );
        assert!(
            !JacobianMapEvidence {
                condition_number: f64::NAN,
                ..passing
            }
            .passed(1.0e-6)
        );

        let evaluated =
            rejected_gray_m1_case("evaluated", EvidenceStatus::Evaluated, "expected-rejection");
        let failed = rejected_gray_m1_case("failed", EvidenceStatus::Failed, "failure");
        let good_residual = VerificationResidual {
            code: "good",
            value: 0.0,
            tolerance: 0.0,
        };
        let bad_residual = VerificationResidual {
            code: "bad",
            value: 1.0,
            tolerance: 0.0,
        };
        assert!(gray_m1_report_passed(
            std::slice::from_ref(&evaluated),
            &[good_residual]
        ));
        assert!(!gray_m1_report_passed(&[failed], &[good_residual]));
        assert!(!gray_m1_report_passed(&[evaluated], &[bad_residual]));
    }

    #[test]
    fn closure_and_source_residuals_keep_distinct_stable_codes() {
        let map = JacobianGatewayEvidence {
            maximum_disagreement: 1.0,
            value_disagreement: 2.0,
            condition_number: Some(3.0),
        };
        let closure = gateway_residuals(RadiationJacobianKind::Closure, map, 4.0);
        assert_eq!(closure[0].code, "gray-m1.closure-jacobian-disagreement");
        assert_eq!(closure[1].code, "gray-m1.closure-value-disagreement");
        let source = gateway_residuals(RadiationJacobianKind::ImexSource, map, 4.0);
        assert_eq!(source[0].code, "gray-m1.imex-source-jacobian-disagreement");
        assert_eq!(source[1].code, "gray-m1.imex-source-value-disagreement");

        assert_eq!(isotropic_eddington_factor(), 1.0 / 3.0);
        let mut diagnostics = Vec::new();
        append_gray_m1_disagreement_diagnostic(true, &mut diagnostics);
        assert!(diagnostics.is_empty());
        append_gray_m1_disagreement_diagnostic(false, &mut diagnostics);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(
            diagnostics[0].code,
            "verification.gray-m1.jacobian-disagreement"
        );

        let production = production_gray_m1_map([2.0, 1.0]).unwrap();
        assert!(production[0] > 1.0 / 3.0 && production[0] < 1.0);
        assert!((production[1] - 2.0 * production[0]).abs() < 1.0e-14);
        assert!(production_gray_m1_map([1.0, 1.1]).is_err());
    }
}

#[cfg(test)]
mod radiative_shock_acceptance_tests {
    use super::{
        radiative_bounded_imex_passed, radiative_fixture_passed, radiative_resolution_passed,
    };
    use crate::{kernel::EvidenceStatus, radiative_shock_tube};

    const TOLERANCE: f64 = 1.0e-8;

    #[test]
    fn resolution_acceptance_requires_every_recovery_realizability_and_conservation_invariant() {
        let physics = radiative_shock_tube::run_relativistic_radiative_shock_tube().unwrap();
        let passing = physics.fixtures[0].resolutions[0];
        assert!(radiative_resolution_passed(&passing, TOLERANCE));

        let mut candidate = passing;
        candidate.failed_recoveries = 1;
        assert!(!radiative_resolution_passed(&candidate, TOLERANCE));

        let mut candidate = passing;
        candidate.maximum_reduced_flux = f64::NAN;
        assert!(!radiative_resolution_passed(&candidate, TOLERANCE));

        let mut candidate = passing;
        candidate.maximum_reduced_flux = 1.0;
        assert!(radiative_resolution_passed(&candidate, TOLERANCE));
        candidate.maximum_reduced_flux = 1.0 + f64::EPSILON;
        assert!(!radiative_resolution_passed(&candidate, TOLERANCE));

        let mut candidate = passing;
        candidate.rest_mass_conservation_residual = TOLERANCE;
        assert!(radiative_resolution_passed(&candidate, TOLERANCE));
        candidate.rest_mass_conservation_residual = TOLERANCE * 2.0;
        assert!(!radiative_resolution_passed(&candidate, TOLERANCE));

        let mut candidate = passing;
        candidate.total_energy_conservation_residual = TOLERANCE;
        assert!(radiative_resolution_passed(&candidate, TOLERANCE));
        candidate.total_energy_conservation_residual = TOLERANCE * 2.0;
        assert!(!radiative_resolution_passed(&candidate, TOLERANCE));

        let mut candidate = passing;
        candidate.total_momentum_conservation_residual = TOLERANCE;
        assert!(radiative_resolution_passed(&candidate, TOLERANCE));
        candidate.total_momentum_conservation_residual = TOLERANCE * 2.0;
        assert!(!radiative_resolution_passed(&candidate, TOLERANCE));
    }

    #[test]
    fn fixture_acceptance_requires_status_finite_strictly_improving_convergence() {
        let physics = radiative_shock_tube::run_relativistic_radiative_shock_tube().unwrap();
        let passing = physics.fixtures[0].clone();
        assert!(radiative_fixture_passed(&passing, TOLERANCE));

        let mut candidate = passing.clone();
        candidate.status = EvidenceStatus::Failed;
        assert!(!radiative_fixture_passed(&candidate, TOLERANCE));

        let mut candidate = passing.clone();
        candidate.resolutions[0].failed_recoveries = 1;
        assert!(!radiative_fixture_passed(&candidate, TOLERANCE));

        let mut candidate = passing.clone();
        candidate.resolutions[0].maximum_reduced_flux = 1.0 + f64::EPSILON;
        assert!(!radiative_fixture_passed(&candidate, TOLERANCE));

        for residual in 0..3 {
            let mut candidate = passing.clone();
            match residual {
                0 => candidate.resolutions[0].rest_mass_conservation_residual = TOLERANCE * 2.0,
                1 => candidate.resolutions[0].total_energy_conservation_residual = TOLERANCE * 2.0,
                _ => {
                    candidate.resolutions[0].total_momentum_conservation_residual = TOLERANCE * 2.0
                }
            }
            assert!(!radiative_fixture_passed(&candidate, TOLERANCE));
        }

        for field in 0..3 {
            let mut candidate = passing.clone();
            match field {
                0 => candidate.density_convergence.coarse_to_medium_l1 = f64::NAN,
                1 => candidate.density_convergence.medium_to_fine_l1 = f64::NAN,
                _ => candidate.density_convergence.observed_order = f64::NAN,
            }
            assert!(!radiative_fixture_passed(&candidate, TOLERANCE));
        }

        let mut candidate = passing.clone();
        candidate.density_convergence.medium_to_fine_l1 =
            candidate.density_convergence.coarse_to_medium_l1;
        assert!(!radiative_fixture_passed(&candidate, TOLERANCE));

        let mut candidate = passing;
        candidate.density_convergence.observed_order = 0.0;
        assert!(!radiative_fixture_passed(&candidate, TOLERANCE));
    }

    #[test]
    fn bounded_imex_acceptance_requires_backoff_in_every_thick_resolution() {
        let passing = radiative_shock_tube::run_relativistic_radiative_shock_tube().unwrap();
        assert!(radiative_bounded_imex_passed(&passing));

        let mut candidate = passing;
        candidate.fixtures[3].resolutions[0].bounded_exchange_backoffs = 0;
        assert!(!radiative_bounded_imex_passed(&candidate));
    }
}
