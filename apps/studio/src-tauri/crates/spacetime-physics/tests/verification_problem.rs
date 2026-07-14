use spacetime_physics::kernel::EvidenceStatus;
use spacetime_physics::verification::{
    run_verification, GrayM1ImexPayload, ValenciaRecoveryEvidence, VerificationProblem,
    VerificationRequest, VerificationResidual,
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
    assert!(report
        .residuals
        .iter()
        .all(|residual| residual.value == 0.0));
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
    assert!(strict_report
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "verification.math.crosscheck-disagreement"));
    assert!(strict_report
        .residuals
        .iter()
        .any(|residual| !residual.passed()));

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
    assert!(thread_reports
        .iter()
        .all(|report| report.status == EvidenceStatus::Evaluated));
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
fn valencia_jacobians_report_three_way_evidence_and_explicit_rejections() {
    let report = run_verification(
        VerificationRequest::new(VerificationProblem::ValenciaJacobians, 1.0e-6)
            .with_math_worker(env!("CARGO_BIN_EXE_spacetime-math-worker")),
    );

    assert_eq!(
        report.status,
        EvidenceStatus::Evaluated,
        "Valencia verification report: {report:#?}"
    );
    assert_eq!(report.provenance.problem_id, "valencia-jacobians");
    assert_eq!(report.provenance.fact("equation-of-state.gamma"), Some("2"));
    assert_eq!(report.provenance.fact("variables"), Some("rho,vx,epsilon"));
    assert_eq!(report.valencia_jacobians.len(), 6);

    for case_id in ["admissible", "slow-flow", "relativistic", "near-vacuum"] {
        let case = report
            .valencia_jacobians
            .iter()
            .find(|case| case.case_id == case_id)
            .expect("required Valencia fixture");
        assert_eq!(case.status, EvidenceStatus::Evaluated);
        assert_eq!(case.recovery, ValenciaRecoveryEvidence::Recovered);
        let primitive_to_conserved = case
            .primitive_to_conserved
            .expect("evaluated primitive-to-conserved map evidence");
        let flux = case.flux.expect("evaluated flux map evidence");
        assert!(primitive_to_conserved.maximum_disagreement > 0.0);
        assert!(primitive_to_conserved.maximum_disagreement <= 1.0e-6);
        let flux_disagreement = flux.maximum_disagreement;
        assert!(flux_disagreement > 0.0);
        assert!(flux_disagreement <= 1.0e-6);
        let conserved_value_disagreement = primitive_to_conserved.value_disagreement;
        let flux_value_disagreement = flux.value_disagreement;
        assert!((0.0..=1.0e-6).contains(&conserved_value_disagreement));
        assert!((0.0..=1.0e-6).contains(&flux_value_disagreement));
        if case_id == "near-vacuum" {
            assert!(conserved_value_disagreement > 0.0);
            assert!(flux_value_disagreement > 0.0);
        }
        let conserved_condition = primitive_to_conserved.condition_number;
        let flux_condition = flux.condition_number;
        assert!(conserved_condition.is_finite() && conserved_condition > 1.0);
        assert!(flux_condition.is_finite() && flux_condition > 1.0);
    }

    for (case_id, diagnostic_code) in [
        ("singular", "verification.valencia.singular-state"),
        (
            "non-admissible",
            "verification.valencia.non-admissible-state",
        ),
    ] {
        let case = report
            .valencia_jacobians
            .iter()
            .find(|case| case.case_id == case_id)
            .expect("required rejected Valencia fixture");
        assert_eq!(case.status, EvidenceStatus::NotEvaluated);
        assert_eq!(case.recovery, ValenciaRecoveryEvidence::NotAttempted);
        assert!(case.primitive_to_conserved.is_none());
        assert!(case.flux.is_none());
        assert!(report
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == diagnostic_code));
    }

    let diagnostic_codes = report
        .diagnostics
        .iter()
        .map(|diagnostic| diagnostic.code)
        .collect::<std::collections::HashSet<_>>();
    assert_eq!(diagnostic_codes.len(), report.diagnostics.len());
    let required_license_codes: &[&str] = match report
        .provenance
        .fact("symbolica.license-state")
        .expect("worker reports a license state")
    {
        "licensed" => &[],
        "restricted-missing" => &[
            "verification.math.symbolica.license-missing",
            "verification.math.symbolica.license-restricted",
        ],
        "restricted-rejected" => &[
            "verification.math.symbolica.license-rejected",
            "verification.math.symbolica.license-restricted",
        ],
        state => panic!("unexpected Symbolica license state: {state}"),
    };
    assert!(required_license_codes
        .iter()
        .all(|code| diagnostic_codes.contains(code)));

    let strict = run_verification(
        VerificationRequest::new(VerificationProblem::ValenciaJacobians, 0.0)
            .with_math_worker(env!("CARGO_BIN_EXE_spacetime-math-worker")),
    );
    assert_eq!(strict.status, EvidenceStatus::Failed);
    assert!(strict.valencia_jacobians.iter().any(|case| {
        case.status == EvidenceStatus::Failed
            && case
                .primitive_to_conserved
                .is_some_and(|evidence| evidence.maximum_disagreement > 0.0)
    }));
    assert!(strict
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "verification.valencia.jacobian-disagreement"));
}

#[test]
fn gray_m1_and_imex_jacobians_report_limits_exchange_and_rejections() {
    let report = run_verification(
        VerificationRequest::new(VerificationProblem::GrayM1AndImexJacobians, 1.0e-6)
            .with_math_worker(env!("CARGO_BIN_EXE_spacetime-math-worker")),
    );

    assert_eq!(report.status, EvidenceStatus::Evaluated);
    for code in ["gray-m1.closure-jacobian", "gray-m1.imex-source-jacobian"] {
        assert_eq!(
            report
                .evidence
                .iter()
                .find(|entry| entry.code == code)
                .unwrap()
                .status,
            EvidenceStatus::Evaluated
        );
    }
    for case_id in [
        "closure-intermediate",
        "closure-isotropic-limit",
        "closure-free-streaming-limit",
        "exchange-equilibrium",
        "exchange-stiff-emission",
        "exchange-stiff-absorption",
        "closure-nonphysical",
    ] {
        assert!(report
            .gray_m1_imex
            .iter()
            .any(|case| case.case_id == case_id));
    }

    let intermediate = report
        .gray_m1_imex
        .iter()
        .find(|case| case.case_id == "closure-intermediate")
        .unwrap();
    let GrayM1ImexPayload::Closure {
        jacobian: Some(closure),
        ..
    } = intermediate.payload
    else {
        panic!("intermediate closure must carry Jacobian evidence");
    };
    assert!(closure.maximum_disagreement.is_finite());
    assert!(closure.maximum_disagreement <= 1.0e-6);
    assert!(closure.value_disagreement <= 1.0e-6);
    assert!(closure.condition_number.is_finite());

    let isotropic = report
        .gray_m1_imex
        .iter()
        .find(|case| case.case_id == "closure-isotropic-limit")
        .unwrap();
    let GrayM1ImexPayload::Closure {
        reduced_flux,
        eddington_factor,
        ..
    } = isotropic.payload
    else {
        panic!("isotropic limit must remain closure evidence");
    };
    assert_eq!(reduced_flux, 0.0);
    assert_eq!(eddington_factor, 1.0 / 3.0);
    let streaming = report
        .gray_m1_imex
        .iter()
        .find(|case| case.case_id == "closure-free-streaming-limit")
        .unwrap();
    let GrayM1ImexPayload::Closure {
        reduced_flux,
        eddington_factor,
        ..
    } = streaming.payload
    else {
        panic!("streaming limit must remain closure evidence");
    };
    assert_eq!(reduced_flux, 1.0);
    assert_eq!(eddington_factor, 1.0);

    let emission = report
        .gray_m1_imex
        .iter()
        .find(|case| case.case_id == "exchange-stiff-emission")
        .unwrap();
    let GrayM1ImexPayload::ImexSource {
        jacobian,
        eddington_factor,
        exchanged_energy_density,
        conservation_residual,
        ..
    } = emission.payload
    else {
        panic!("emission must carry IMEX source evidence");
    };
    assert!((exchanged_energy_density - 100.0 / 51.0).abs() < 1.0e-14);
    assert_eq!(conservation_residual, 0.0);
    assert_eq!(eddington_factor, 1.0 / 3.0);
    assert!(jacobian.maximum_disagreement <= 1.0e-6);
    let absorption = report
        .gray_m1_imex
        .iter()
        .find(|case| case.case_id == "exchange-stiff-absorption")
        .unwrap();
    let GrayM1ImexPayload::ImexSource {
        eddington_factor,
        exchanged_energy_density,
        conservation_residual,
        ..
    } = absorption.payload
    else {
        panic!("absorption must carry IMEX source evidence");
    };
    assert!((exchanged_energy_density + 100.0 / 51.0).abs() < 1.0e-14);
    assert_eq!(conservation_residual, 0.0);
    assert_eq!(eddington_factor, 1.0 / 3.0);
    let equilibrium = report
        .gray_m1_imex
        .iter()
        .find(|case| case.case_id == "exchange-equilibrium")
        .unwrap();
    let GrayM1ImexPayload::ImexSource {
        eddington_factor,
        exchanged_energy_density,
        conservation_residual,
        ..
    } = equilibrium.payload
    else {
        panic!("equilibrium must carry IMEX source evidence");
    };
    assert_eq!(exchanged_energy_density, 0.0);
    assert_eq!(conservation_residual, 0.0);
    assert_eq!(eddington_factor, 1.0 / 3.0);

    let residual_codes = report
        .residuals
        .iter()
        .map(|residual| residual.code)
        .collect::<std::collections::HashSet<_>>();
    for code in [
        "gray-m1.closure-jacobian-disagreement",
        "gray-m1.closure-value-disagreement",
        "gray-m1.imex-source-jacobian-disagreement",
        "gray-m1.imex-source-value-disagreement",
    ] {
        assert!(residual_codes.contains(code));
    }

    let rejected = report
        .gray_m1_imex
        .iter()
        .find(|case| case.case_id == "closure-nonphysical")
        .unwrap();
    assert_eq!(rejected.status, EvidenceStatus::NotEvaluated);
    assert!(matches!(
        rejected.payload,
        GrayM1ImexPayload::Rejected {
            diagnostic_code: "verification.gray-m1.nonphysical-state"
        }
    ));
    assert!(report
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "verification.gray-m1.nonphysical-state"));
    assert!(report
        .provenance
        .fact("radiation.representation")
        .unwrap()
        .contains("moment fields"));
    assert!(!report
        .provenance
        .fact("radiation.representation")
        .unwrap()
        .contains("packet histories"));

    let strict = run_verification(
        VerificationRequest::new(VerificationProblem::GrayM1AndImexJacobians, 0.0)
            .with_math_worker(env!("CARGO_BIN_EXE_spacetime-math-worker")),
    );
    assert_eq!(strict.status, EvidenceStatus::Failed);
    assert!(strict
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "verification.gray-m1.jacobian-disagreement"));
    assert!(strict.residuals.iter().any(|residual| !residual.passed()));
}

#[test]
fn gray_m1_and_imex_without_a_worker_do_not_manufacture_jacobians() {
    let report = run_verification(VerificationRequest::new(
        VerificationProblem::GrayM1AndImexJacobians,
        1.0e-6,
    ));

    assert_eq!(report.status, EvidenceStatus::NotEvaluated);
    assert!(report.gray_m1_imex.is_empty());
    assert!(report.residuals.is_empty());
    assert_eq!(
        report.diagnostics[0].code,
        "verification.math.worker-unavailable"
    );
    assert!(report
        .evidence
        .iter()
        .all(|evidence| evidence.status == EvidenceStatus::NotEvaluated));
}

#[test]
fn valencia_jacobians_without_a_worker_do_not_manufacture_derivatives() {
    let report = run_verification(VerificationRequest::new(
        VerificationProblem::ValenciaJacobians,
        1.0e-6,
    ));

    assert_eq!(report.status, EvidenceStatus::NotEvaluated);
    assert!(report.valencia_jacobians.is_empty());
    assert!(report.residuals.is_empty());
    assert!(report.evidence.iter().all(|evidence| {
        evidence.status == EvidenceStatus::NotEvaluated
            && matches!(
                evidence.code,
                "valencia.primitive-to-conserved-jacobian" | "valencia.flux-jacobian"
            )
    }));
    assert_eq!(
        report.diagnostics[0].code,
        "verification.math.worker-unavailable"
    );
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
