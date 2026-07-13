//! Deterministic gray-radiation moments and closure evidence.
//!
//! The first seam uses geometric units (`c = 1`), so a realizable moment state obeys
//! `|flux| <= energy_density`. It closes the second moment only; evolution and matter
//! source exchange remain responsibilities of later coupled-kernel slices.

pub use crate::physics_v1::RadiationTransportMode;
use crate::{SymmetricSpatialTensor2, Vec3};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum RadiationClosurePolicy {
    LevermoreM1,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum RadiationAngularRegime {
    IsotropicLimit,
    Intermediate,
    FreeStreamingLimit,
}

/// Gray energy and flux measured in a local Eulerian orthonormal frame.
///
/// Coordinate-basis moments must be projected through the grid-metric adapter before they
/// enter this seam. The Euclidean norm below is therefore a frame norm, not a coordinate norm.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct OrthonormalGrayRadiationMoments {
    pub energy_density: f64,
    pub flux: Vec3,
}

impl OrthonormalGrayRadiationMoments {
    pub const fn new(energy_density: f64, flux: Vec3) -> Self {
        Self {
            energy_density,
            flux,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct RadiationClosureEvidence {
    pub policy: RadiationClosurePolicy,
    pub angular_regime: RadiationAngularRegime,
    pub reduced_flux: f64,
    pub eddington_factor: f64,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct ClosedOrthonormalRadiationMoments {
    pub moments: OrthonormalGrayRadiationMoments,
    /// Radiation pressure components in the same local orthonormal frame as `moments`.
    pub pressure: SymmetricSpatialTensor2,
    pub diagnostics: RadiationClosureEvidence,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum InvalidRadiationStateReason {
    NonFinite,
    NegativeEnergy,
    SuperluminalFlux,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, thiserror::Error)]
pub enum RadiationClosureDiagnostic {
    #[error("invalid radiation state: {reason:?}")]
    InvalidState { reason: InvalidRadiationStateReason },
    #[error("radiation closure failed for {policy:?}")]
    ClosureFailed { policy: RadiationClosurePolicy },
    #[error("unsupported radiation transport mode: {mode:?}")]
    UnsupportedMode { mode: RadiationTransportMode },
}

pub fn close_gray_m1_moments(
    mode: RadiationTransportMode,
    moments: OrthonormalGrayRadiationMoments,
) -> Result<ClosedOrthonormalRadiationMoments, RadiationClosureDiagnostic> {
    if mode != RadiationTransportMode::GrayM1 {
        return Err(RadiationClosureDiagnostic::UnsupportedMode { mode });
    }
    let policy = RadiationClosurePolicy::LevermoreM1;
    if !moments.energy_density.is_finite() {
        return Err(RadiationClosureDiagnostic::InvalidState {
            reason: InvalidRadiationStateReason::NonFinite,
        });
    }
    if moments.energy_density < 0.0 {
        return Err(RadiationClosureDiagnostic::InvalidState {
            reason: InvalidRadiationStateReason::NegativeEnergy,
        });
    }
    let flux_magnitude = moments.flux.norm();
    if !flux_magnitude.is_finite() {
        return Err(RadiationClosureDiagnostic::InvalidState {
            reason: InvalidRadiationStateReason::NonFinite,
        });
    }
    if flux_magnitude > moments.energy_density {
        return Err(RadiationClosureDiagnostic::InvalidState {
            reason: InvalidRadiationStateReason::SuperluminalFlux,
        });
    }

    let reduced_flux = if moments.energy_density == 0.0 {
        0.0
    } else {
        flux_magnitude / moments.energy_density
    };
    let eddington_factor = if reduced_flux == 0.0 {
        1.0 / 3.0
    } else {
        let radicand = 4.0 - 3.0 * reduced_flux * reduced_flux;
        (3.0 + 4.0 * reduced_flux * reduced_flux) / (5.0 + 2.0 * radicand.sqrt())
    };
    if !eddington_factor.is_finite() {
        return Err(RadiationClosureDiagnostic::ClosureFailed { policy });
    }

    let pressure = if flux_magnitude == 0.0 {
        let isotropic_pressure = moments.energy_density / 3.0;
        SymmetricSpatialTensor2::diagonal(
            isotropic_pressure,
            isotropic_pressure,
            isotropic_pressure,
        )
    } else {
        let direction = moments.flux / flux_magnitude;
        let direction_components = [direction.x, direction.y, direction.z];
        let isotropic_weight = (1.0 - eddington_factor) / 2.0;
        let beam_weight = (3.0 * eddington_factor - 1.0) / 2.0;
        let mut components = [[0.0; 3]; 3];
        for i in 0..3 {
            for j in 0..3 {
                let identity = if i == j { 1.0 } else { 0.0 };
                components[i][j] = moments.energy_density
                    * (isotropic_weight * identity
                        + beam_weight * direction_components[i] * direction_components[j]);
            }
        }
        SymmetricSpatialTensor2::new(components)
    };
    let angular_regime = if reduced_flux == 0.0 {
        RadiationAngularRegime::IsotropicLimit
    } else if reduced_flux == 1.0 {
        RadiationAngularRegime::FreeStreamingLimit
    } else {
        RadiationAngularRegime::Intermediate
    };
    Ok(ClosedOrthonormalRadiationMoments {
        moments,
        pressure,
        diagnostics: RadiationClosureEvidence {
            policy,
            angular_regime,
            reduced_flux,
            eddington_factor,
        },
    })
}
