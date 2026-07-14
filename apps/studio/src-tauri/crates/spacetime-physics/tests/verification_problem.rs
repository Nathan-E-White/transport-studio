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
    assert!(report.mathematical_crosscheck.is_none());
}

#[test]
fn analytic_derivative_identity_crosschecks_three_independent_methods() {
    let worker = env!("CARGO_BIN_EXE_spacetime-math-worker");
    let report = run_verification(
        VerificationRequest::new(VerificationProblem::AnalyticDerivativeIdentity, 1.0e-8)
            .with_math_worker(worker),
    );

    assert_eq!(report.status, EvidenceStatus::Evaluated);
    assert_eq!(report.provenance.problem_id, "analytic-derivative-identity");
    assert_eq!(report.provenance.model, "f(x)=x^3+2*x at x=2");
    assert_eq!(report.provenance.fact("symbolica.version"), Some("2.1.0"));
    assert_eq!(report.provenance.fact("numerica.version"), Some("2.1.0"));
    assert_eq!(
        report.provenance.fact("derivative.convention"),
        Some("ordinary-first-derivative")
    );
    assert_eq!(report.provenance.fact("tolerance"), Some("1e-8"));
    assert_eq!(
        report.provenance.fact("finite-difference.step"),
        Some("1e-5")
    );
    assert_eq!(
        report.provenance.fact("expression.sha256"),
        Some("29ac12f965d1e3abc1b02dd3cdcbd33594376475c2de5556db0ba4ceb49f0cbf")
    );
    let license_state = report.provenance.fact("symbolica.license-state");
    if std::env::var_os("SYMBOLICA_LICENSE").is_none() {
        assert_eq!(license_state, Some("restricted-missing"));
    } else {
        assert!(matches!(
            license_state,
            Some("licensed" | "restricted-rejected")
        ));
    }

    let crosscheck = report
        .mathematical_crosscheck
        .expect("analytic identity should return cross-check evidence");
    assert!((crosscheck.symbolic_derivative - 14.0).abs() < 1.0e-12);
    assert!((crosscheck.hyperdual_derivative - 14.0).abs() < 1.0e-12);
    assert!((crosscheck.finite_difference_derivative - 14.0).abs() < 1.0e-8);
    assert!(crosscheck.maximum_disagreement <= 1.0e-8);
    assert_eq!(crosscheck.maximum_expression_value_disagreement, 0.0);
    assert!(report.residuals.iter().all(|residual| residual.passed()));
    assert!(report.evidence.iter().any(|evidence| {
        evidence.code == "mathematical-crosscheck" && evidence.status == EvidenceStatus::Evaluated
    }));
    assert!(report.diagnostics.iter().all(|diagnostic| {
        diagnostic.code == "verification.math.symbolica.license-missing"
            || diagnostic.code == "verification.math.symbolica.license-rejected"
            || diagnostic.code == "verification.math.symbolica.license-restricted"
    }));

    // Restricted Symbolica permits one owning thread per process, so exercise
    // the second tolerance through the same public acceptance test.
    let strict_report = run_verification(
        VerificationRequest::new(VerificationProblem::AnalyticDerivativeIdentity, 0.0)
            .with_math_worker(worker),
    );

    assert_eq!(strict_report.status, EvidenceStatus::Failed);
    assert!(
        strict_report
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "verification.math.crosscheck-disagreement")
    );
    assert!(
        strict_report
            .residuals
            .iter()
            .any(|residual| !residual.passed())
    );

    let thread_reports: Vec<_> = (0..2)
        .map(|_| {
            std::thread::spawn(|| {
                run_verification(
                    VerificationRequest::new(
                        VerificationProblem::AnalyticDerivativeIdentity,
                        1.0e-8,
                    )
                    .with_math_worker(env!("CARGO_BIN_EXE_spacetime-math-worker")),
                )
            })
        })
        .map(|thread| thread.join().expect("verification thread should not abort"))
        .collect();
    assert!(
        thread_reports
            .iter()
            .all(|report| report.status == EvidenceStatus::Evaluated)
    );
}

#[test]
fn analytic_derivative_without_a_worker_is_explicitly_not_evaluated() {
    let report = run_verification(VerificationRequest::new(
        VerificationProblem::AnalyticDerivativeIdentity,
        1.0e-8,
    ));

    assert_eq!(report.status, EvidenceStatus::NotEvaluated);
    assert_eq!(report.diagnostics.len(), 1);
    assert_eq!(
        report.diagnostics[0].code,
        "verification.math.worker-unavailable"
    );
    assert!(report.mathematical_crosscheck.is_none());
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
