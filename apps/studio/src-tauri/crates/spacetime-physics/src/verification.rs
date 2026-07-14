//! Repository-owned verification problems and evidence reports.
//!
//! This module is the public seam for numerical verification. Solver storage and
//! third-party mathematics types remain behind this interface.

use crate::kernel::{DynamicalSpacetimeKernel, EvidenceStatus, KernelConfig, KernelState};
use crate::{CoordinateTime, TimeDuration, UniformGrid3, vec3};

/// Verification scenarios that can be evaluated without promoting a product solver.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum VerificationProblem {
    FlatSpacetimeInvariant,
}

/// Caller-owned settings for one deterministic verification run.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct VerificationRequest {
    pub problem: VerificationProblem,
    pub tolerance: f64,
}

impl VerificationRequest {
    pub const fn new(problem: VerificationProblem, tolerance: f64) -> Self {
        Self { problem, tolerance }
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
}

type VerificationRunner = fn(f64, VerificationProvenance) -> VerificationReport;

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
        };
    }

    (definition.run)(request.tolerance, definition.provenance)
}

fn definition(problem: VerificationProblem) -> VerificationDefinition {
    match problem {
        VerificationProblem::FlatSpacetimeInvariant => VerificationDefinition {
            provenance: VerificationProvenance {
                problem_id: "flat-spacetime-invariant",
                model: "minkowski-bssn-flat-empty",
            },
            run: run_flat_spacetime_invariant,
        },
    }
}

fn run_flat_spacetime_invariant(
    tolerance: f64,
    provenance: VerificationProvenance,
) -> VerificationReport {
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
        },
    }
}
