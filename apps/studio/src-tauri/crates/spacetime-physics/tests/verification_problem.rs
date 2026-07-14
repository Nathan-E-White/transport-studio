use spacetime_physics::kernel::EvidenceStatus;
use spacetime_physics::verification::{
    GrayM1ImexPayload, ValenciaRecoveryEvidence, VerificationProblem, VerificationRequest,
    VerificationResidual, run_verification,
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
        assert!(
            report
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == diagnostic_code)
        );
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
    assert!(
        required_license_codes
            .iter()
            .all(|code| diagnostic_codes.contains(code))
    );

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
    assert!(
        strict
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "verification.valencia.jacobian-disagreement")
    );
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
        assert!(
            report
                .gray_m1_imex
                .iter()
                .any(|case| case.case_id == case_id)
        );
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
    assert!(
        report
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "verification.gray-m1.nonphysical-state")
    );
    assert!(
        report
            .provenance
            .fact("radiation.representation")
            .unwrap()
            .contains("moment fields")
    );
    assert!(
        !report
            .provenance
            .fact("radiation.representation")
            .unwrap()
            .contains("packet histories")
    );

    let strict = run_verification(
        VerificationRequest::new(VerificationProblem::GrayM1AndImexJacobians, 0.0)
            .with_math_worker(env!("CARGO_BIN_EXE_spacetime-math-worker")),
    );
    assert_eq!(strict.status, EvidenceStatus::Failed);
    assert!(
        strict
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "verification.gray-m1.jacobian-disagreement")
    );
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
    assert!(
        report
            .evidence
            .iter()
            .all(|evidence| evidence.status == EvidenceStatus::NotEvaluated)
    );
}

#[test]
fn flat_relativistic_shock_tube_reports_profiles_conservation_and_convergence() {
    let report = run_verification(VerificationRequest::new(
        VerificationProblem::FlatRelativisticShockTube,
        1.0e-10,
    ));

    assert_eq!(report.status, EvidenceStatus::Evaluated, "{report:#?}");
    assert!(report.diagnostics.is_empty(), "{report:#?}");
    assert_eq!(report.provenance.problem_id, "flat-relativistic-shock-tube");
    assert_eq!(report.provenance.fact("units"), Some("normalized-c=1"));
    assert_eq!(report.provenance.fact("domain"), Some("[-0.5,0.5]"));
    assert_eq!(
        report.provenance.fact("boundary-policy"),
        Some("fixed-end-cells")
    );
    assert_eq!(report.provenance.fact("final-time"), Some("0.1"));
    assert_eq!(
        report.provenance.fact("resolution-series"),
        Some("32,64,128")
    );

    let shock = report
        .flat_shock_tube
        .expect("shock-tube problem returns typed evidence");
    assert_eq!(
        shock
            .resolutions
            .iter()
            .map(|resolution| resolution.cell_count)
            .collect::<Vec<_>>(),
        vec![32, 64, 128]
    );
    assert_eq!(shock.finest_profile.len(), 128);
    assert_eq!(
        shock
            .resolutions
            .iter()
            .map(|resolution| (
                resolution.cell_count,
                resolution.steps,
                resolution.recovery_attempts,
                resolution.recovery_iterations
            ))
            .collect::<Vec<_>>(),
        vec![
            (32, 8, 512, 1_194),
            (64, 16, 2_048, 4_716),
            (128, 32, 8_192, 18_617)
        ]
    );
    assert_eq!(shock.fixture.left_density, 1.0);
    assert_eq!(shock.fixture.left_pressure, 1.0);
    assert_eq!(shock.fixture.right_density, 0.125);
    assert_eq!(shock.fixture.right_pressure, 0.1);
    assert_eq!(shock.fixture.left_velocity, 0.0);
    assert_eq!(shock.fixture.right_velocity, 0.0);

    for cell in &shock.finest_profile {
        assert!(cell.position.is_finite());
        assert!(cell.density.is_finite() && cell.density > 0.0);
        assert!(cell.pressure.is_finite() && cell.pressure >= 0.0);
        assert!(cell.velocity.is_finite() && cell.velocity.abs() < 1.0);
        assert!(cell.lorentz_factor.is_finite() && cell.lorentz_factor >= 1.0);
        assert!(
            (cell.lorentz_factor * cell.lorentz_factor * (1.0 - cell.velocity * cell.velocity)
                - 1.0)
                .abs()
                <= 1.0e-12
        );
        assert!(cell.conserved_rest_mass.is_finite());
        assert!(cell.conserved_momentum.is_finite());
        assert!(cell.conserved_energy.is_finite());
    }
    assert_eq!(shock.finest_profile.first().unwrap().density, 1.0);
    assert_eq!(shock.finest_profile.last().unwrap().density, 0.125);
    assert_eq!(
        shock.finest_profile.first().unwrap().position,
        -0.496_093_75
    );
    assert_eq!(shock.finest_profile.last().unwrap().position, 0.496_093_75);
    assert!(
        shock
            .finest_profile
            .windows(2)
            .all(
                |cells| (cells[1].position - cells[0].position - 1.0 / 128.0).abs() <= f64::EPSILON
            )
    );
    assert!(shock.finest_profile[63].velocity > 0.0);
    assert!(shock.finest_profile[64].velocity > 0.0);

    assert!(shock.resolutions.iter().all(|resolution| {
        resolution.steps > 0
            && resolution.recovery_attempts > 0
            && resolution.recovery_iterations >= resolution.recovery_attempts
            && resolution.corrected_recoveries == 0
            && resolution.failed_recoveries == 0
            && resolution.mass_conservation_residual.abs() <= 1.0e-10
            && resolution.momentum_conservation_residual.abs() <= 1.0e-10
            && resolution.energy_conservation_residual.abs() <= 1.0e-10
    }));
    let finest_cell_width = 1.0 / shock.finest_profile.len() as f64;
    let final_mass = shock
        .finest_profile
        .iter()
        .map(|cell| cell.conserved_rest_mass * finest_cell_width)
        .sum::<f64>();
    let final_momentum = shock
        .finest_profile
        .iter()
        .map(|cell| cell.conserved_momentum * finest_cell_width)
        .sum::<f64>();
    let final_energy = shock
        .finest_profile
        .iter()
        .map(|cell| cell.conserved_energy * finest_cell_width)
        .sum::<f64>();
    assert!((final_mass - 0.562_5).abs() <= 1.0e-10);
    assert!((final_momentum - 0.09).abs() <= 1.0e-10);
    assert!((final_energy - 1.375).abs() <= 1.0e-10);
    assert!(shock.convergence.coarse_to_medium_l1 > 0.0);
    assert!((shock.convergence.coarse_to_medium_l1 - 0.006_922_137_395_246_156).abs() <= 1.0e-12);
    assert!((shock.convergence.medium_to_fine_l1 - 0.004_497_561_008_049_108).abs() <= 1.0e-12);
    assert!((shock.convergence.observed_order - 0.622_074_726_041_052_2).abs() <= 1.0e-12);
    assert!(shock.convergence.medium_to_fine_l1 > 0.0);
    assert!(shock.convergence.medium_to_fine_l1 < shock.convergence.coarse_to_medium_l1);
    assert!(shock.convergence.observed_order > 0.0);
    assert_eq!(shock.limiting_cases.maximum_radiation_energy, 0.0);
    assert_eq!(shock.limiting_cases.maximum_opacity, 0.0);

    assert!(report.residuals.iter().all(|residual| residual.passed()));
    for code in [
        "shock-tube.profiles",
        "shock-tube.primitive-recovery",
        "shock-tube.self-convergence",
        "shock-tube.zero-radiation-limit",
        "shock-tube.zero-opacity-limit",
    ] {
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
}

#[test]
fn flat_relativistic_shock_tube_is_deterministic_for_identical_requests() {
    let request = VerificationRequest::new(VerificationProblem::FlatRelativisticShockTube, 1.0e-10);

    assert_eq!(run_verification(request.clone()), run_verification(request));
}

#[test]
fn flat_relativistic_shock_tube_retains_evidence_when_zero_tolerance_exposes_roundoff() {
    let report = run_verification(VerificationRequest::new(
        VerificationProblem::FlatRelativisticShockTube,
        0.0,
    ));

    assert_eq!(report.status, EvidenceStatus::Failed, "{report:#?}");
    assert!(report.flat_shock_tube.is_some());
    assert!(
        report
            .residuals
            .iter()
            .any(|residual| residual.value != 0.0)
    );
    assert!(
        report
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "verification.shock-tube.conservation-failed")
    );
    assert_eq!(
        report
            .evidence
            .iter()
            .find(|entry| entry.code == "shock-tube.profiles")
            .unwrap()
            .status,
        EvidenceStatus::Failed
    );
    assert_eq!(
        report
            .evidence
            .iter()
            .find(|entry| entry.code == "shock-tube.primitive-recovery")
            .unwrap()
            .status,
        EvidenceStatus::Evaluated
    );
    assert_eq!(
        report
            .evidence
            .iter()
            .find(|entry| entry.code == "shock-tube.self-convergence")
            .unwrap()
            .status,
        EvidenceStatus::Evaluated
    );
}

#[test]
fn radiative_shock_tube_reports_four_coupled_limits_and_mathematical_evidence() {
    let report = run_verification(
        VerificationRequest::new(VerificationProblem::RelativisticRadiativeShockTube, 1.0e-8)
            .with_math_worker(env!("CARGO_BIN_EXE_spacetime-math-worker")),
    );

    assert_eq!(report.status, EvidenceStatus::Evaluated, "{report:#?}");
    assert_eq!(
        report.provenance.problem_id,
        "relativistic-radiative-shock-tube"
    );
    assert_eq!(report.provenance.fact("units"), Some("normalized-c=1"));
    assert_eq!(
        report.provenance.fact("resolution-series"),
        Some("32,64,128")
    );
    assert_eq!(report.provenance.fact("symbolica.version"), Some("2.1.0"));
    assert_eq!(report.provenance.fact("numerica.version"), Some("2.1.0"));
    assert!(!report.gray_m1_imex.is_empty());

    let coupled = report
        .radiative_shock_tube
        .expect("coupled problem returns typed radiative shock evidence");
    let assert_close = |actual: f64, expected: f64, tolerance: f64| {
        assert!(
            (actual - expected).abs() <= tolerance,
            "expected {expected:.17e}, got {actual:.17e}"
        );
    };
    assert_eq!(
        coupled
            .fixtures
            .iter()
            .map(|fixture| fixture.case_id)
            .collect::<Vec<_>>(),
        vec![
            "hydrodynamic-limit",
            "equilibrium",
            "optically-thin",
            "optically-thick"
        ]
    );

    let expected_iterations = [
        [1_194, 4_716, 18_617],
        [1_194, 4_716, 18_617],
        [1_290, 5_127, 20_096],
        [1_330, 5_289, 20_648],
    ];
    let expected_radiation_boundaries = [(0.0, 0.0), (0.1, 0.1), (0.12, 0.04), (0.04, 0.04)];
    let expected_convergence = [
        (0.006_922_137_395_246_156, 0.004_497_561_008_049_108),
        (0.006_922_137_395_246_156, 0.004_497_561_008_049_108),
        (0.006_923_220_377_128_035, 0.004_498_934_767_490_298),
        (0.007_039_298_834_027_547, 0.004_594_068_046_523_831),
    ];
    for (fixture_index, fixture) in coupled.fixtures.iter().enumerate() {
        assert_eq!(fixture.status, EvidenceStatus::Evaluated, "{fixture:#?}");
        assert_eq!(fixture.resolutions.len(), 3);
        assert_eq!(fixture.finest_profile.len(), 128);
        assert!(fixture.density_convergence.coarse_to_medium_l1 > 0.0);
        assert!(
            fixture.density_convergence.medium_to_fine_l1
                < fixture.density_convergence.coarse_to_medium_l1
        );
        assert!(fixture.density_convergence.observed_order > 0.0);
        assert!(fixture.resolutions.iter().all(|resolution| {
            resolution.maximum_reduced_flux.is_finite()
                && resolution.maximum_reduced_flux <= 1.0
                && resolution.recovery_iterations >= resolution.recovery_attempts
                && resolution.failed_recoveries == 0
                && resolution.rest_mass_conservation_residual.abs() <= 1.0e-8
                && resolution.total_energy_conservation_residual.abs() <= 1.0e-8
                && resolution.total_momentum_conservation_residual.abs() <= 1.0e-8
        }));
        for (resolution_index, resolution) in fixture.resolutions.iter().enumerate() {
            let expected_cell_count = 32 << resolution_index;
            let expected_steps = 8 << resolution_index;
            assert_eq!(resolution.cell_count, expected_cell_count);
            assert_eq!(resolution.steps, expected_steps);
            assert_eq!(
                resolution.recovery_attempts,
                expected_cell_count * expected_steps * 2
            );
            assert_eq!(
                resolution.recovery_iterations,
                expected_iterations[fixture_index][resolution_index]
            );
        }
        let (expected_coarse, expected_fine) = expected_convergence[fixture_index];
        assert_close(
            fixture.density_convergence.coarse_to_medium_l1,
            expected_coarse,
            1.0e-14,
        );
        assert_close(
            fixture.density_convergence.medium_to_fine_l1,
            expected_fine,
            1.0e-14,
        );
        let left = &fixture.finest_profile[0];
        let right = &fixture.finest_profile[127];
        assert_eq!(left.matter.position, -0.496_093_75);
        assert_eq!(right.matter.position, 0.496_093_75);
        assert_eq!(left.matter.density, 1.0);
        assert_eq!(right.matter.density, 0.125);
        assert_eq!(
            (left.radiation_energy, right.radiation_energy),
            expected_radiation_boundaries[fixture_index]
        );
        assert!(fixture.finest_profile.iter().all(|cell| {
            cell.matter.density > 0.0
                && cell.radiation_energy >= 0.0
                && cell.radiation_flux.abs() <= cell.radiation_energy + 1.0e-12
                && cell.reduced_flux >= 0.0
                && cell.reduced_flux <= 1.0
        }));
    }

    let hydrodynamic = &coupled.fixtures[0];
    assert_eq!(hydrodynamic.interaction_rate, 0.0);
    assert!(
        hydrodynamic
            .finest_profile
            .iter()
            .all(|cell| cell.radiation_energy == 0.0 && cell.radiation_flux == 0.0)
    );
    let equilibrium = &coupled.fixtures[1];
    assert!(
        equilibrium.maximum_exchange.abs() <= 1.0e-12,
        "equilibrium exchange was {:.17e}",
        equilibrium.maximum_exchange
    );
    let thin = &coupled.fixtures[2];
    assert!(thin.interaction_rate > 0.0 && thin.interaction_rate < 1.0);
    assert!(
        thin.finest_profile
            .iter()
            .any(|cell| cell.radiation_flux.abs() > 0.0)
    );
    let thick = &coupled.fixtures[3];
    assert!(thick.interaction_rate >= 100.0);
    assert!(thick.maximum_exchange > 0.0);

    assert_close(thin.maximum_exchange, 4.993_757_802_746_568e-5, 1.0e-14);
    assert_close(thick.maximum_exchange, 2.222_222_222_222_222_3e-2, 1.0e-14);
    assert!(
        thick
            .resolutions
            .iter()
            .all(|resolution| resolution.bounded_exchange_backoffs > 0
                && resolution.maximum_backoff_exponent > 0)
    );
    assert_eq!(
        thick
            .resolutions
            .iter()
            .map(|resolution| resolution.bounded_exchange_backoffs)
            .collect::<Vec<_>>(),
        vec![66, 219, 803]
    );
    assert_eq!(
        thick
            .resolutions
            .iter()
            .map(|resolution| resolution.maximum_backoff_exponent)
            .collect::<Vec<_>>(),
        vec![9, 21, 37]
    );
    for (cell, expected) in [
        (
            &thin.finest_profile[63],
            (
                0.520_384_537_377_602_5,
                0.434_357_137_834_177_2,
                0.311_791_932_867_520_77,
                1.052_464_952_476_087_8,
                0.077_005_296_856_430_32,
                0.021_376_297_611_088_894,
            ),
        ),
        (
            &thin.finest_profile[64],
            (
                0.480_145_673_163_201_56,
                0.397_159_549_268_693_23,
                0.341_621_322_850_652_2,
                1.064_013_517_762_825_2,
                0.075_659_191_789_802_46,
                0.021_814_996_068_204_07,
            ),
        ),
        (
            &thick.finest_profile[63],
            (
                0.525_203_843_332_011_3,
                0.448_369_669_245_006_8,
                0.306_951_965_877_818_7,
                1.050_723_677_227_667_8,
                0.000_443_861_894_616_960_5,
                -0.000_443_861_894_421_500_77,
            ),
        ),
        (
            &thick.finest_profile[64],
            (
                0.485_853_211_543_684_66,
                0.412_420_022_841_005_93,
                0.334_985_438_492_375_9,
                1.061_319_535_366_733,
                0.000_320_348_558_351_219_4,
                -0.000_320_348_558_049_413_46,
            ),
        ),
    ] {
        assert_close(cell.matter.density, expected.0, 1.0e-13);
        assert_close(cell.matter.pressure, expected.1, 1.0e-13);
        assert_close(cell.matter.velocity, expected.2, 1.0e-13);
        assert_close(cell.matter.lorentz_factor, expected.3, 1.0e-13);
        assert_close(cell.radiation_energy, expected.4, 1.0e-13);
        assert_close(cell.radiation_flux, expected.5, 1.0e-13);
        assert_close(
            cell.reduced_flux,
            cell.radiation_flux.abs() / cell.radiation_energy,
            1.0e-14,
        );
    }

    for code in [
        "radiative-shock.hydrodynamic-limit",
        "radiative-shock.equilibrium",
        "radiative-shock.optically-thin",
        "radiative-shock.optically-thick",
        "radiative-shock.primitive-recovery",
        "radiative-shock.realizability",
        "radiative-shock.total-conservation",
        "radiative-shock.self-convergence",
        "radiative-shock.bounded-imex",
        "radiative-shock.mathematical-crosscheck",
    ] {
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

    let without_worker = run_verification(VerificationRequest::new(
        VerificationProblem::RelativisticRadiativeShockTube,
        1.0e-8,
    ));
    assert_eq!(without_worker.status, EvidenceStatus::NotEvaluated);
    assert!(without_worker.radiative_shock_tube.is_some());
    assert!(
        !without_worker
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "verification.radiative-shock.evidence-failed")
    );

    let strict_without_worker = run_verification(VerificationRequest::new(
        VerificationProblem::RelativisticRadiativeShockTube,
        0.0,
    ));
    assert_eq!(strict_without_worker.status, EvidenceStatus::Failed);
    assert!(
        strict_without_worker
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "verification.radiative-shock.evidence-failed")
    );

    let strict = run_verification(
        VerificationRequest::new(VerificationProblem::RelativisticRadiativeShockTube, 0.0)
            .with_math_worker(env!("CARGO_BIN_EXE_spacetime-math-worker")),
    );
    assert_eq!(strict.status, EvidenceStatus::Failed);
    assert!(
        strict
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "verification.radiative-shock.evidence-failed")
    );
    assert_eq!(
        strict
            .evidence
            .iter()
            .find(|entry| entry.code == "radiative-shock.total-conservation")
            .unwrap()
            .status,
        EvidenceStatus::Failed
    );
    for code in [
        "radiative-shock.primitive-recovery",
        "radiative-shock.realizability",
        "radiative-shock.self-convergence",
        "radiative-shock.bounded-imex",
    ] {
        assert_eq!(
            strict
                .evidence
                .iter()
                .find(|entry| entry.code == code)
                .unwrap()
                .status,
            EvidenceStatus::Evaluated,
            "{code} should not inherit a conservation-only failure"
        );
    }
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
