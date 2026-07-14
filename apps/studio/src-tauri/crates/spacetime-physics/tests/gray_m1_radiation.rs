use approx::assert_abs_diff_eq;
use spacetime_physics::expert::radiation::{
    InvalidRadiationStateReason, OrthonormalGrayRadiationMoments, RadiationAngularRegime,
    RadiationClosureDiagnostic, RadiationClosurePolicy, RadiationTransportMode,
    close_gray_m1_moments,
};
use spacetime_physics::expert::vec3;

#[test]
fn optically_thick_m1_limit_is_isotropic() {
    let result = close_gray_m1_moments(
        RadiationTransportMode::GrayM1,
        OrthonormalGrayRadiationMoments::new(3.0, vec3::ZERO),
    )
    .expect("valid thick-limit moments should close");

    assert_eq!(
        result.diagnostics.policy,
        RadiationClosurePolicy::LevermoreM1
    );
    assert_eq!(
        result.diagnostics.angular_regime,
        RadiationAngularRegime::IsotropicLimit,
    );
    assert_abs_diff_eq!(result.diagnostics.reduced_flux, 0.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(
        result.diagnostics.eddington_factor,
        1.0 / 3.0,
        epsilon = 1.0e-12
    );
    assert_abs_diff_eq!(result.pressure.component(0, 0), 1.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(result.pressure.component(1, 1), 1.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(result.pressure.component(2, 2), 1.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(result.pressure.component(0, 1), 0.0, epsilon = 1.0e-12);
}

#[test]
fn optically_thin_m1_limit_is_a_directed_beam() {
    let result = close_gray_m1_moments(
        RadiationTransportMode::GrayM1,
        OrthonormalGrayRadiationMoments::new(2.0, vec3::new(2.0, 0.0, 0.0)),
    )
    .expect("a causal free-streaming state should close");

    assert_eq!(
        result.diagnostics.angular_regime,
        RadiationAngularRegime::FreeStreamingLimit,
    );
    assert_abs_diff_eq!(result.diagnostics.reduced_flux, 1.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(result.diagnostics.eddington_factor, 1.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(result.pressure.component(0, 0), 2.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(result.pressure.component(1, 1), 0.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(result.pressure.component(2, 2), 0.0, epsilon = 1.0e-12);
}

#[test]
fn intermediate_m1_closure_preserves_energy_as_the_pressure_trace() {
    let result = close_gray_m1_moments(
        RadiationTransportMode::GrayM1,
        OrthonormalGrayRadiationMoments::new(2.0, vec3::new(1.0, 0.0, 0.0)),
    )
    .expect("a causal intermediate state should close");

    assert_eq!(
        result.diagnostics.angular_regime,
        RadiationAngularRegime::Intermediate,
    );
    assert_abs_diff_eq!(result.diagnostics.reduced_flux, 0.5, epsilon = 1.0e-12);
    assert_abs_diff_eq!(
        result.diagnostics.eddington_factor,
        0.464_816_241_512_003_57,
        epsilon = 1.0e-12,
    );
    assert_abs_diff_eq!(result.pressure.trace(), 2.0, epsilon = 1.0e-12);
    assert!(result.pressure.component(0, 0) > result.pressure.component(1, 1));
    assert_abs_diff_eq!(
        result.pressure.component(1, 1),
        result.pressure.component(2, 2),
        epsilon = 1.0e-12,
    );
    for (i, j) in [(0, 1), (0, 2), (1, 0), (1, 2), (2, 0), (2, 1)] {
        assert_abs_diff_eq!(result.pressure.component(i, j), 0.0, epsilon = 1.0e-12);
    }
}

#[test]
fn zero_energy_and_flux_are_a_valid_vacuum_state() {
    let result = close_gray_m1_moments(
        RadiationTransportMode::GrayM1,
        OrthonormalGrayRadiationMoments::new(0.0, vec3::ZERO),
    )
    .expect("vacuum moments should close");

    assert_eq!(result.pressure.trace(), 0.0);
    assert_eq!(
        result.diagnostics.angular_regime,
        RadiationAngularRegime::IsotropicLimit,
    );
}

#[test]
fn invalid_radiation_states_have_specific_diagnostics() {
    let negative = close_gray_m1_moments(
        RadiationTransportMode::GrayM1,
        OrthonormalGrayRadiationMoments::new(-1.0, vec3::ZERO),
    );
    assert_eq!(
        negative,
        Err(RadiationClosureDiagnostic::InvalidState {
            reason: InvalidRadiationStateReason::NegativeEnergy,
        }),
    );

    let acausal = close_gray_m1_moments(
        RadiationTransportMode::GrayM1,
        OrthonormalGrayRadiationMoments::new(1.0, vec3::new(1.01, 0.0, 0.0)),
    );
    assert_eq!(
        acausal,
        Err(RadiationClosureDiagnostic::InvalidState {
            reason: InvalidRadiationStateReason::SuperluminalFlux,
        }),
    );

    let non_finite = close_gray_m1_moments(
        RadiationTransportMode::GrayM1,
        OrthonormalGrayRadiationMoments::new(f64::NAN, vec3::ZERO),
    );
    assert_eq!(
        non_finite,
        Err(RadiationClosureDiagnostic::InvalidState {
            reason: InvalidRadiationStateReason::NonFinite,
        }),
    );

    for flux in [
        vec3::new(0.0, f64::NAN, 0.0),
        vec3::new(0.0, 0.0, f64::INFINITY),
    ] {
        assert_eq!(
            close_gray_m1_moments(
                RadiationTransportMode::GrayM1,
                OrthonormalGrayRadiationMoments::new(1.0, flux),
            ),
            Err(RadiationClosureDiagnostic::InvalidState {
                reason: InvalidRadiationStateReason::NonFinite,
            }),
        );
    }
}

#[test]
fn unsupported_future_modes_are_not_reported_as_closure_failures() {
    let result = close_gray_m1_moments(
        RadiationTransportMode::MultigroupDiffusion,
        OrthonormalGrayRadiationMoments::new(1.0, vec3::ZERO),
    );

    assert_eq!(
        result,
        Err(RadiationClosureDiagnostic::UnsupportedMode {
            mode: RadiationTransportMode::MultigroupDiffusion,
        }),
    );
}
