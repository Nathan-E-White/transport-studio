//! Repository-owned verification problems and evidence reports.
//!
//! This module is the public seam for numerical verification. Solver storage and
//! third-party mathematics types remain behind this interface.

use crate::kernel::{DynamicalSpacetimeKernel, EvidenceStatus, KernelConfig, KernelState};
use crate::math_gateway;
use crate::{CoordinateTime, TimeDuration, UniformGrid3, vec3};

/// Verification scenarios that can be evaluated without promoting a product solver.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum VerificationProblem {
    FlatSpacetimeInvariant,
    AnalyticDerivativeIdentity,
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
    }
}
