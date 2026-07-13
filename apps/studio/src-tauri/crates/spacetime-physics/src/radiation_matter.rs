//! Local semi-implicit thermal exchange between stationary Valencia matter and isotropic gray M1.
//!
//! This tracer bullet is deliberately a zero-momentum source step in a shared local Eulerian
//! orthonormal frame. Moving matter and nonzero radiation flux require a four-force treatment and
//! are rejected here rather than being approximated as scalar energy exchange.

use crate::radiation::{OrthonormalGrayRadiationMoments, close_gray_m1_moments};
use crate::valencia::pressure_matches_eos;
use crate::{
    RadiationTransportMode, TimeDuration, ValenciaEquationOfState, ValenciaPrimitive, vec3,
};

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct LocalRadiationMatterExchangeState {
    pub matter: ValenciaPrimitive,
    pub radiation: OrthonormalGrayRadiationMoments,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct RadiationMatterExchangeConfig {
    pub timestep: TimeDuration,
    pub interaction_rate: f64,
    pub equilibrium_radiation_energy_density: f64,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ExchangeStiffnessHandling {
    BackwardEuler,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub enum ExchangeFailureStage {
    BeforeEvaluation,
    BackwardEuler { stiffness_parameter: f64 },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ExchangeFallback {
    None,
    MatterEnergyLimited,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ExchangeFailureReason {
    InvalidConfiguration,
    InvalidMatterState,
    UnsupportedMovingMatter,
    InvalidRadiationState,
    UnsupportedRadiationFlux,
    NonFiniteStiffness,
    NonFiniteEnergyAccounting,
    EquationOfStateFailure,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct RadiationMatterExchangeDiagnostics {
    pub stiffness_handling: ExchangeStiffnessHandling,
    pub fallback: ExchangeFallback,
    pub stiffness_parameter: f64,
    /// Positive values transfer local thermal matter energy into radiation.
    pub exchanged_energy_density: f64,
    pub conservation_residual: f64,
    pub equilibrium_residual: f64,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct RadiationMatterExchangeFailureDiagnostics {
    pub failure_reason: ExchangeFailureReason,
    pub stage: ExchangeFailureStage,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct RadiationMatterExchangeOutcome {
    pub state: LocalRadiationMatterExchangeState,
    pub diagnostics: RadiationMatterExchangeDiagnostics,
}

/// Failed exchange with the unchanged input state and typed diagnostics.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct RadiationMatterExchangeFailure {
    pub state: LocalRadiationMatterExchangeState,
    pub diagnostics: RadiationMatterExchangeFailureDiagnostics,
}

pub fn radiation_matter_exchange_semi_implicit<Eos: ValenciaEquationOfState>(
    state: LocalRadiationMatterExchangeState,
    eos: Eos,
    config: RadiationMatterExchangeConfig,
) -> Result<RadiationMatterExchangeOutcome, RadiationMatterExchangeFailure> {
    let dt = config.timestep.seconds();
    if !dt.is_finite() || dt <= 0.0 {
        return Err(failure(
            state,
            ExchangeFailureReason::InvalidConfiguration,
            None,
        ));
    }
    if !config.interaction_rate.is_finite() || config.interaction_rate < 0.0 {
        return Err(failure(
            state,
            ExchangeFailureReason::InvalidConfiguration,
            None,
        ));
    }
    if !config.equilibrium_radiation_energy_density.is_finite()
        || config.equilibrium_radiation_energy_density < 0.0
    {
        return Err(failure(
            state,
            ExchangeFailureReason::InvalidConfiguration,
            None,
        ));
    }

    if !valid_matter_scalars(state.matter) {
        return Err(failure(
            state,
            ExchangeFailureReason::InvalidMatterState,
            None,
        ));
    }
    if state.matter.velocity != vec3::ZERO {
        return Err(failure(
            state,
            ExchangeFailureReason::UnsupportedMovingMatter,
            None,
        ));
    }
    let expected_pressure = match eos.pressure(
        state.matter.rest_mass_density,
        state.matter.specific_internal_energy,
    ) {
        Ok(pressure) => pressure,
        _ => {
            return Err(failure(
                state,
                ExchangeFailureReason::EquationOfStateFailure,
                None,
            ));
        }
    };
    if !expected_pressure.is_finite() {
        return Err(failure(
            state,
            ExchangeFailureReason::EquationOfStateFailure,
            None,
        ));
    }
    if expected_pressure < 0.0 {
        return Err(failure(
            state,
            ExchangeFailureReason::EquationOfStateFailure,
            None,
        ));
    }
    if !pressure_matches_eos(state.matter.pressure, expected_pressure) {
        return Err(failure(
            state,
            ExchangeFailureReason::InvalidMatterState,
            None,
        ));
    }

    if close_gray_m1_moments(RadiationTransportMode::GrayM1, state.radiation).is_err() {
        return Err(failure(
            state,
            ExchangeFailureReason::InvalidRadiationState,
            None,
        ));
    }
    if state.radiation.flux != vec3::ZERO {
        return Err(failure(
            state,
            ExchangeFailureReason::UnsupportedRadiationFlux,
            None,
        ));
    }

    let stiffness = config.interaction_rate * dt;
    if !stiffness.is_finite() {
        return Err(failure(
            state,
            ExchangeFailureReason::NonFiniteStiffness,
            None,
        ));
    }
    let implicit_fraction = stiffness / (1.0 + stiffness);
    let requested_exchange = implicit_fraction
        * (config.equilibrium_radiation_energy_density - state.radiation.energy_density);
    let initial_matter_energy =
        state.matter.rest_mass_density * state.matter.specific_internal_energy;
    let initial_total = initial_matter_energy + state.radiation.energy_density;
    if !initial_matter_energy.is_finite() {
        return Err(failure(
            state,
            ExchangeFailureReason::NonFiniteEnergyAccounting,
            Some(stiffness),
        ));
    }
    if !initial_total.is_finite() {
        return Err(failure(
            state,
            ExchangeFailureReason::NonFiniteEnergyAccounting,
            Some(stiffness),
        ));
    }

    let (exchange, fallback) = if requested_exchange > initial_matter_energy {
        (initial_matter_energy, ExchangeFallback::MatterEnergyLimited)
    } else {
        (requested_exchange, ExchangeFallback::None)
    };
    let final_matter_energy = initial_matter_energy - exchange;
    let final_radiation_energy = state.radiation.energy_density + exchange;
    let final_total = final_matter_energy + final_radiation_energy;
    if !final_matter_energy.is_finite() {
        return Err(failure(
            state,
            ExchangeFailureReason::NonFiniteEnergyAccounting,
            Some(stiffness),
        ));
    }
    if !final_radiation_energy.is_finite() {
        return Err(failure(
            state,
            ExchangeFailureReason::NonFiniteEnergyAccounting,
            Some(stiffness),
        ));
    }
    if !final_total.is_finite() {
        return Err(failure(
            state,
            ExchangeFailureReason::NonFiniteEnergyAccounting,
            Some(stiffness),
        ));
    }

    let specific_internal_energy = final_matter_energy / state.matter.rest_mass_density;
    if !specific_internal_energy.is_finite() {
        return Err(failure(
            state,
            ExchangeFailureReason::NonFiniteEnergyAccounting,
            Some(stiffness),
        ));
    }
    let pressure = match eos.pressure(state.matter.rest_mass_density, specific_internal_energy) {
        Ok(pressure) => pressure,
        _ => {
            return Err(failure(
                state,
                ExchangeFailureReason::EquationOfStateFailure,
                Some(stiffness),
            ));
        }
    };
    if !pressure.is_finite() {
        return Err(failure(
            state,
            ExchangeFailureReason::EquationOfStateFailure,
            Some(stiffness),
        ));
    }
    if pressure < 0.0 {
        return Err(failure(
            state,
            ExchangeFailureReason::EquationOfStateFailure,
            Some(stiffness),
        ));
    }
    let next_state = LocalRadiationMatterExchangeState {
        matter: ValenciaPrimitive {
            specific_internal_energy,
            pressure,
            ..state.matter
        },
        radiation: OrthonormalGrayRadiationMoments::new(final_radiation_energy, vec3::ZERO),
    };
    Ok(RadiationMatterExchangeOutcome {
        state: next_state,
        diagnostics: RadiationMatterExchangeDiagnostics {
            stiffness_handling: ExchangeStiffnessHandling::BackwardEuler,
            fallback,
            stiffness_parameter: stiffness,
            exchanged_energy_density: exchange,
            conservation_residual: final_total - initial_total,
            equilibrium_residual: final_radiation_energy
                - config.equilibrium_radiation_energy_density,
        },
    })
}

fn valid_matter_scalars(matter: ValenciaPrimitive) -> bool {
    if !matter.rest_mass_density.is_finite() {
        return false;
    }
    if matter.rest_mass_density <= 0.0 {
        return false;
    }
    if !matter.specific_internal_energy.is_finite() {
        return false;
    }
    if matter.specific_internal_energy < 0.0 {
        return false;
    }
    if !matter.pressure.is_finite() {
        return false;
    }
    if matter.pressure < 0.0 {
        return false;
    }
    for velocity in [matter.velocity.x, matter.velocity.y, matter.velocity.z] {
        if !velocity.is_finite() {
            return false;
        }
    }
    true
}

fn failure(
    state: LocalRadiationMatterExchangeState,
    reason: ExchangeFailureReason,
    stiffness: Option<f64>,
) -> RadiationMatterExchangeFailure {
    RadiationMatterExchangeFailure {
        state,
        diagnostics: RadiationMatterExchangeFailureDiagnostics {
            failure_reason: reason,
            stage: match stiffness {
                Some(stiffness_parameter) => ExchangeFailureStage::BackwardEuler {
                    stiffness_parameter,
                },
                None => ExchangeFailureStage::BeforeEvaluation,
            },
        },
    }
}
