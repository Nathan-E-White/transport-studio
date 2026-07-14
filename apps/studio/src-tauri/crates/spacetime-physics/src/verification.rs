//! Repository-owned verification problems and evidence reports.
//!
//! This module is the public seam for numerical verification. Solver storage and
//! third-party mathematics types remain behind this interface.

use crate::kernel::{DynamicalSpacetimeKernel, EvidenceStatus, KernelConfig, KernelState};
use crate::math_gateway;
use crate::{
    primitive_to_conserved, recover_primitives, vec3, CoordinateTime, PrimitiveRecoveryDiagnostic,
    PrimitiveRecoveryPolicy, TimeDuration, UniformGrid3, ValenciaGeometry, ValenciaIdealGas,
    ValenciaPrimitive,
};

/// Verification scenarios that can be evaluated without promoting a product solver.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum VerificationProblem {
    FlatSpacetimeInvariant,
    AnalyticDerivativeIdentity,
    ValenciaJacobians,
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
    }
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
