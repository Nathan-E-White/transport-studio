use approx::assert_abs_diff_eq;
use spacetime_physics::expert::radiation::OrthonormalGrayRadiationMoments;
use spacetime_physics::expert::{
    ExchangeFailureReason, ExchangeFailureStage, ExchangeFallback, ExchangeStiffnessHandling,
    LocalRadiationMatterExchangeState, PhysicsError, RadiationMatterExchangeConfig, TimeDuration,
    ValenciaEquationOfState, ValenciaIdealGas, ValenciaPolytrope, ValenciaPrimitive,
    radiation_matter_exchange_semi_implicit, vec3,
};

#[test]
fn stiff_local_exchange_conserves_matter_plus_radiation_energy() {
    let eos = ValenciaIdealGas { gamma: 1.4 };
    let state = LocalRadiationMatterExchangeState {
        matter: matter(eos, 2.0, 1.0),
        radiation: OrthonormalGrayRadiationMoments::new(1.0, vec3::ZERO),
    };

    let result = radiation_matter_exchange_semi_implicit(
        state,
        eos,
        RadiationMatterExchangeConfig {
            timestep: TimeDuration::from_seconds(0.5),
            interaction_rate: 10.0,
            equilibrium_radiation_energy_density: 3.0,
        },
    )
    .unwrap();

    let initial_total = 2.0 * 1.0 + 1.0;
    let final_total = result.state.matter.rest_mass_density
        * result.state.matter.specific_internal_energy
        + result.state.radiation.energy_density;
    assert_abs_diff_eq!(final_total, initial_total, epsilon = 1.0e-12);
    assert_abs_diff_eq!(
        result.state.radiation.energy_density,
        8.0 / 3.0,
        epsilon = 1.0e-12
    );
    assert_abs_diff_eq!(
        result.state.matter.specific_internal_energy,
        1.0 / 6.0,
        epsilon = 1.0e-12
    );
    assert_eq!(
        result.diagnostics.stiffness_handling,
        ExchangeStiffnessHandling::BackwardEuler
    );
    assert_eq!(result.diagnostics.fallback, ExchangeFallback::None);
    assert_abs_diff_eq!(result.state.matter.pressure, 2.0 / 15.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(
        result.diagnostics.conservation_residual,
        0.0,
        epsilon = 1.0e-12
    );
    assert_abs_diff_eq!(
        result.diagnostics.equilibrium_residual,
        -1.0 / 3.0,
        epsilon = 1.0e-12
    );
}

#[test]
fn exchange_fallback_limits_radiation_heating_to_available_matter_energy() {
    let eos = ValenciaIdealGas { gamma: 1.4 };
    let state = LocalRadiationMatterExchangeState {
        matter: matter(eos, 1.0, 0.2),
        radiation: OrthonormalGrayRadiationMoments::new(0.0, vec3::ZERO),
    };

    let result = radiation_matter_exchange_semi_implicit(
        state,
        eos,
        RadiationMatterExchangeConfig {
            timestep: TimeDuration::from_seconds(1.0),
            interaction_rate: 100.0,
            equilibrium_radiation_energy_density: 10.0,
        },
    )
    .unwrap();

    assert_eq!(
        result.diagnostics.fallback,
        ExchangeFallback::MatterEnergyLimited
    );
    assert_abs_diff_eq!(
        result.diagnostics.exchanged_energy_density,
        0.2,
        epsilon = 1.0e-12
    );
    assert_abs_diff_eq!(
        result.state.matter.specific_internal_energy,
        0.0,
        epsilon = 1.0e-12
    );
    assert_abs_diff_eq!(
        result.state.radiation.energy_density,
        0.2,
        epsilon = 1.0e-12
    );

    let exact_limit = LocalRadiationMatterExchangeState {
        matter: matter(eos, 1.0, 1.0),
        radiation: OrthonormalGrayRadiationMoments::new(0.0, vec3::ZERO),
    };
    let exact = radiation_matter_exchange_semi_implicit(
        exact_limit,
        eos,
        RadiationMatterExchangeConfig {
            timestep: TimeDuration::from_seconds(1.0),
            interaction_rate: 1.0,
            equilibrium_radiation_energy_density: 2.0,
        },
    )
    .unwrap();
    assert_eq!(exact.diagnostics.fallback, ExchangeFallback::None);
    assert_abs_diff_eq!(
        exact.state.matter.specific_internal_energy,
        0.0,
        epsilon = 1.0e-12
    );
}

#[test]
fn invalid_or_unsupported_exchange_states_fail_with_unchanged_state_and_diagnostics() {
    let eos = ValenciaIdealGas { gamma: 1.4 };
    let valid = LocalRadiationMatterExchangeState {
        matter: matter(eos, 1.0, 0.5),
        radiation: OrthonormalGrayRadiationMoments::new(1.0, vec3::ZERO),
    };
    let config = RadiationMatterExchangeConfig {
        timestep: TimeDuration::from_seconds(0.1),
        interaction_rate: 2.0,
        equilibrium_radiation_energy_density: 0.5,
    };
    let cases = [
        (
            LocalRadiationMatterExchangeState {
                matter: ValenciaPrimitive {
                    rest_mass_density: -1.0,
                    ..valid.matter
                },
                ..valid
            },
            config,
            ExchangeFailureReason::InvalidMatterState,
        ),
        (
            LocalRadiationMatterExchangeState {
                matter: ValenciaPrimitive {
                    rest_mass_density: 0.0,
                    ..valid.matter
                },
                ..valid
            },
            config,
            ExchangeFailureReason::InvalidMatterState,
        ),
        (
            LocalRadiationMatterExchangeState {
                matter: ValenciaPrimitive {
                    specific_internal_energy: -1.0,
                    ..valid.matter
                },
                ..valid
            },
            config,
            ExchangeFailureReason::InvalidMatterState,
        ),
        (
            LocalRadiationMatterExchangeState {
                matter: ValenciaPrimitive {
                    pressure: -1.0,
                    ..valid.matter
                },
                ..valid
            },
            config,
            ExchangeFailureReason::InvalidMatterState,
        ),
        (
            LocalRadiationMatterExchangeState {
                matter: ValenciaPrimitive {
                    pressure: valid.matter.pressure + 0.1,
                    ..valid.matter
                },
                ..valid
            },
            config,
            ExchangeFailureReason::InvalidMatterState,
        ),
        (
            LocalRadiationMatterExchangeState {
                matter: ValenciaPrimitive {
                    velocity: vec3::new(0.1, 0.0, 0.0),
                    ..valid.matter
                },
                ..valid
            },
            config,
            ExchangeFailureReason::UnsupportedMovingMatter,
        ),
        (
            LocalRadiationMatterExchangeState {
                radiation: OrthonormalGrayRadiationMoments::new(-1.0, vec3::ZERO),
                ..valid
            },
            config,
            ExchangeFailureReason::InvalidRadiationState,
        ),
        (
            LocalRadiationMatterExchangeState {
                radiation: OrthonormalGrayRadiationMoments::new(1.0, vec3::new(0.1, 0.0, 0.0)),
                ..valid
            },
            config,
            ExchangeFailureReason::UnsupportedRadiationFlux,
        ),
        (
            valid,
            RadiationMatterExchangeConfig {
                timestep: TimeDuration::from_seconds(0.0),
                ..config
            },
            ExchangeFailureReason::InvalidConfiguration,
        ),
        (
            valid,
            RadiationMatterExchangeConfig {
                interaction_rate: -1.0,
                ..config
            },
            ExchangeFailureReason::InvalidConfiguration,
        ),
        (
            valid,
            RadiationMatterExchangeConfig {
                interaction_rate: f64::NAN,
                ..config
            },
            ExchangeFailureReason::InvalidConfiguration,
        ),
        (
            valid,
            RadiationMatterExchangeConfig {
                equilibrium_radiation_energy_density: -1.0,
                ..config
            },
            ExchangeFailureReason::InvalidConfiguration,
        ),
        (
            valid,
            RadiationMatterExchangeConfig {
                equilibrium_radiation_energy_density: f64::NAN,
                ..config
            },
            ExchangeFailureReason::InvalidConfiguration,
        ),
    ];

    for (state, config, reason) in cases {
        let failure = radiation_matter_exchange_semi_implicit(state, eos, config).unwrap_err();
        assert_eq!(failure.state, state);
        assert_eq!(failure.diagnostics.failure_reason, reason);
        assert_eq!(
            failure.diagnostics.stage,
            ExchangeFailureStage::BeforeEvaluation
        );
    }
}

#[test]
fn zero_coupling_is_valid_and_final_eos_failure_is_diagnosed() {
    let eos = ValenciaIdealGas { gamma: 1.4 };
    let state = LocalRadiationMatterExchangeState {
        matter: matter(eos, 1.0, 1.0),
        radiation: OrthonormalGrayRadiationMoments::new(1.0, vec3::ZERO),
    };
    let uncoupled = radiation_matter_exchange_semi_implicit(
        state,
        eos,
        RadiationMatterExchangeConfig {
            timestep: TimeDuration::from_seconds(0.1),
            interaction_rate: 0.0,
            equilibrium_radiation_energy_density: 0.0,
        },
    )
    .unwrap();
    assert_eq!(uncoupled.state, state);
    let cold = LocalRadiationMatterExchangeState {
        matter: matter(eos, 1.0, 0.0),
        radiation: OrthonormalGrayRadiationMoments::new(0.0, vec3::ZERO),
    };
    assert_eq!(
        radiation_matter_exchange_semi_implicit(
            cold,
            eos,
            RadiationMatterExchangeConfig {
                timestep: TimeDuration::from_seconds(0.1),
                interaction_rate: 0.0,
                equilibrium_radiation_energy_density: 0.0,
            },
        )
        .unwrap()
        .state,
        cold
    );

    let failure = radiation_matter_exchange_semi_implicit(
        state,
        RejectLowEnergyEos,
        RadiationMatterExchangeConfig {
            timestep: TimeDuration::from_seconds(1.0),
            interaction_rate: 10.0,
            equilibrium_radiation_energy_density: 2.0,
        },
    )
    .unwrap_err();
    assert_eq!(
        failure.diagnostics.failure_reason,
        ExchangeFailureReason::EquationOfStateFailure
    );
    assert!(matches!(
        failure.diagnostics.stage,
        ExchangeFailureStage::BackwardEuler { .. }
    ));

    for bad_eos in [BadPressureEos::Negative, BadPressureEos::NonFinite] {
        let failure = radiation_matter_exchange_semi_implicit(
            state,
            bad_eos,
            RadiationMatterExchangeConfig {
                timestep: TimeDuration::from_seconds(0.1),
                interaction_rate: 1.0,
                equilibrium_radiation_energy_density: 1.0,
            },
        )
        .unwrap_err();
        assert_eq!(
            failure.diagnostics.failure_reason,
            ExchangeFailureReason::EquationOfStateFailure
        );
    }

    let failure = radiation_matter_exchange_semi_implicit(
        state,
        NegativeLowEnergyEos,
        RadiationMatterExchangeConfig {
            timestep: TimeDuration::from_seconds(1.0),
            interaction_rate: 10.0,
            equilibrium_radiation_energy_density: 2.0,
        },
    )
    .unwrap_err();
    assert_eq!(
        failure.diagnostics.failure_reason,
        ExchangeFailureReason::EquationOfStateFailure
    );
}

#[test]
fn eos_pressure_tolerance_accepts_roundoff_but_rejects_material_mismatch() {
    let eos = ValenciaIdealGas { gamma: 1.4 };
    let base = matter(eos, 2.0, 3.0);
    let tolerance = 1.0e-10 * (1.0 + base.pressure.abs());
    let config = RadiationMatterExchangeConfig {
        timestep: TimeDuration::from_seconds(0.1),
        interaction_rate: 0.0,
        equilibrium_radiation_energy_density: 1.0,
    };
    let state_with_pressure = |pressure| LocalRadiationMatterExchangeState {
        matter: ValenciaPrimitive { pressure, ..base },
        radiation: OrthonormalGrayRadiationMoments::new(1.0, vec3::ZERO),
    };

    radiation_matter_exchange_semi_implicit(
        state_with_pressure(base.pressure + 0.5 * tolerance),
        eos,
        config,
    )
    .unwrap();
    let failure = radiation_matter_exchange_semi_implicit(
        state_with_pressure(base.pressure + 2.0 * tolerance),
        eos,
        config,
    )
    .unwrap_err();
    assert_eq!(
        failure.diagnostics.failure_reason,
        ExchangeFailureReason::InvalidMatterState
    );
}

#[test]
fn nonfinite_specific_energy_from_tiny_density_fails_without_updating_state() {
    let eos = ValenciaPolytrope {
        constant: 0.0,
        gamma: 2.0,
    };
    let state = LocalRadiationMatterExchangeState {
        matter: ValenciaPrimitive {
            rest_mass_density: f64::MIN_POSITIVE / 16.0,
            velocity: vec3::ZERO,
            specific_internal_energy: 0.0,
            pressure: 0.0,
        },
        radiation: OrthonormalGrayRadiationMoments::new(1.0, vec3::ZERO),
    };

    let failure = radiation_matter_exchange_semi_implicit(
        state,
        eos,
        RadiationMatterExchangeConfig {
            timestep: TimeDuration::from_seconds(1.0),
            interaction_rate: 1.0,
            equilibrium_radiation_energy_density: 0.0,
        },
    )
    .unwrap_err();

    assert_eq!(failure.state, state);
    assert_eq!(
        failure.diagnostics.failure_reason,
        ExchangeFailureReason::NonFiniteEnergyAccounting
    );
    assert_eq!(
        failure.diagnostics.stage,
        ExchangeFailureStage::BackwardEuler {
            stiffness_parameter: 1.0
        }
    );
}

#[derive(Debug, Copy, Clone)]
struct RejectLowEnergyEos;

impl ValenciaEquationOfState for RejectLowEnergyEos {
    fn pressure(&self, density: f64, energy: f64) -> Result<f64, PhysicsError> {
        if energy < 0.5 {
            Err(PhysicsError::InvalidStep)
        } else {
            Ok((1.4 - 1.0) * density * energy)
        }
    }
}

#[derive(Debug, Copy, Clone)]
enum BadPressureEos {
    Negative,
    NonFinite,
}

impl ValenciaEquationOfState for BadPressureEos {
    fn pressure(&self, _density: f64, _energy: f64) -> Result<f64, PhysicsError> {
        Ok(match self {
            Self::Negative => -1.0,
            Self::NonFinite => f64::NAN,
        })
    }
}

#[derive(Debug, Copy, Clone)]
struct NegativeLowEnergyEos;

impl ValenciaEquationOfState for NegativeLowEnergyEos {
    fn pressure(&self, density: f64, energy: f64) -> Result<f64, PhysicsError> {
        if energy < 0.5 {
            Ok(-1.0)
        } else {
            Ok((1.4 - 1.0) * density * energy)
        }
    }
}

fn matter(
    eos: ValenciaIdealGas,
    rest_mass_density: f64,
    specific_internal_energy: f64,
) -> ValenciaPrimitive {
    ValenciaPrimitive {
        rest_mass_density,
        velocity: vec3::ZERO,
        specific_internal_energy,
        pressure: eos
            .pressure(rest_mass_density, specific_internal_energy)
            .unwrap(),
    }
}
