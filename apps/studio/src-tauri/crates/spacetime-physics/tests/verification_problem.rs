use spacetime_physics::kernel::EvidenceStatus;
use spacetime_physics::verification::{
    VerificationProblem, VerificationRequest, VerificationResidual, run_verification,
};

#[test]
fn flat_spacetime_invariant_is_observable_through_the_verification_api() {
    let report = run_verification(VerificationRequest::new(
        VerificationProblem::FlatSpacetimeInvariant,
        1.0e-12,
    ));

    assert_eq!(report.status, EvidenceStatus::Evaluated);
    assert_eq!(report.provenance.problem_id, "flat-spacetime-invariant");
    assert_eq!(report.provenance.model, "minkowski-bssn-flat-empty");
    assert!(report.diagnostics.is_empty());
    assert_eq!(report.evidence.len(), 2);
    assert_eq!(report.evidence[0].status, EvidenceStatus::Evaluated);
    assert_eq!(report.evidence[1].code, "mathematical-crosscheck");
    assert_eq!(report.evidence[1].status, EvidenceStatus::NotEvaluated);
    assert_eq!(report.residuals.len(), 4);
    assert!(
        report
            .residuals
            .iter()
            .all(|residual| residual.value == 0.0)
    );
    assert!(report.residuals.iter().all(|residual| residual.passed()));
}

#[test]
fn invalid_verification_tolerance_returns_a_stable_failed_report() {
    let report = run_verification(VerificationRequest::new(
        VerificationProblem::FlatSpacetimeInvariant,
        f64::NAN,
    ));

    assert_eq!(report.status, EvidenceStatus::Failed);
    assert!(report.residuals.is_empty());
    assert_eq!(report.diagnostics.len(), 1);
    assert_eq!(
        report.diagnostics[0].code,
        "verification.request.invalid-tolerance"
    );

    let negative = run_verification(VerificationRequest::new(
        VerificationProblem::FlatSpacetimeInvariant,
        -1.0,
    ));
    assert_eq!(negative.status, EvidenceStatus::Failed);

    let exact = run_verification(VerificationRequest::new(
        VerificationProblem::FlatSpacetimeInvariant,
        0.0,
    ));
    assert_eq!(exact.status, EvidenceStatus::Evaluated);
}

#[test]
fn residual_acceptance_rejects_exceeded_and_nonfinite_evidence() {
    let exceeded = VerificationResidual {
        code: "worked.residual",
        value: 2.0,
        tolerance: 1.0,
    };
    let nonfinite = VerificationResidual {
        code: "worked.nonfinite",
        value: f64::INFINITY,
        tolerance: f64::INFINITY,
    };

    assert!(!exceeded.passed());
    assert!(!nonfinite.passed());
}
