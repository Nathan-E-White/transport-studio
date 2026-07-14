//! One-dimensional finite-volume tracer bullet for flat-metric Valencia GRHD.
//!
//! The seam deliberately fixes the metric, reconstruction, Riemann solver, and boundary policy:
//! piecewise-constant cells, a unit-speed Rusanov flux, zero geometric sources, and fixed end
//! cells. It is a trustworthy behavior path, not a production hydrodynamics solver.

use crate::{
    primitive_to_conserved, recover_primitives, vec3, PhysicsError, PrimitiveRecoveryDiagnostic,
    PrimitiveRecoveryError, PrimitiveRecoveryPolicy, TimeDuration, ValenciaConserved,
    ValenciaEquationOfState, ValenciaGeometry, ValenciaPrimitive, Vec3,
};

// Conservative bound that keeps sums and squares used by primitive recovery representable.
const MAX_RECOVERY_CONSERVED_MAGNITUDE: f64 = 6.0e153;

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct ValenciaFlatFiniteVolumeConfig {
    pub cell_width: f64,
    pub timestep: TimeDuration,
    pub courant_factor: f64,
    pub recovery_policy: PrimitiveRecoveryPolicy,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValenciaCellRecoveryDiagnostics {
    pub before_flux: Vec<PrimitiveRecoveryDiagnostic>,
    pub before_flux_iterations: usize,
    pub after_update: Vec<PrimitiveRecoveryDiagnostic>,
    pub after_update_iterations: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValenciaFiniteVolumeCell {
    pub conserved: ValenciaConserved,
    pub primitive: ValenciaPrimitive,
    pub recovery_diagnostics: ValenciaCellRecoveryDiagnostics,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValenciaFlatFiniteVolumeStep {
    pub cells: Vec<ValenciaFiniteVolumeCell>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ValenciaFiniteVolumeError {
    #[error("finite-volume line requires at least three cells")]
    TooFewCells,
    #[error("cell width must be finite and positive")]
    InvalidCellWidth,
    #[error("timestep must be finite and positive")]
    InvalidTimestep,
    #[error("Courant factor must be finite and in (0, 1]")]
    InvalidCourantFactor,
    #[error("timestep violates the unit-signal-speed CFL bound")]
    CflViolation,
    #[error("cell {index} is outside the finite numerical range of primitive recovery")]
    InputOutsideNumericalRange { index: usize },
    #[error("fixed boundary cell {index} requires a primitive-recovery correction")]
    InvalidBoundaryState { index: usize },
    #[error("finite-volume flux contains a non-finite component")]
    NonFiniteFlux,
    #[error("finite-volume update contains a non-finite component")]
    NonFiniteUpdate,
    #[error(transparent)]
    PrimitiveRecovery(#[from] PrimitiveRecoveryError),
    #[error(transparent)]
    Physics(#[from] PhysicsError),
}

/// Advance one flat-metric, one-dimensional Valencia finite-volume step.
///
/// The speed of light is the Rusanov signal-speed bound, so the public CFL condition is
/// `dt / dx <= courant_factor`. The first and last cells are fixed boundary cells and must not
/// require atmosphere, floor, cap, or another corrective primitive-recovery projection.
pub fn valencia_flat_finite_volume_step_1d<Eos: ValenciaEquationOfState>(
    cells: &[ValenciaConserved],
    eos: Eos,
    config: ValenciaFlatFiniteVolumeConfig,
) -> Result<ValenciaFlatFiniteVolumeStep, ValenciaFiniteVolumeError> {
    validate_config(cells, config)?;

    let mut working = Vec::with_capacity(cells.len());
    for (index, &conserved) in cells.iter().enumerate() {
        if !within_primitive_recovery_range(conserved) {
            return Err(ValenciaFiniteVolumeError::InputOutsideNumericalRange { index });
        }
        let recovered = recover_primitives(
            conserved,
            eos,
            ValenciaGeometry::FLAT,
            config.recovery_policy,
        )?;
        let canonical = primitive_to_conserved(recovered.primitive, eos, ValenciaGeometry::FLAT)?;
        let corrected = recovered
            .diagnostics
            .iter()
            .any(|diagnostic| is_corrective_recovery(*diagnostic));
        if corrected && (index == 0 || index + 1 == cells.len()) {
            return Err(ValenciaFiniteVolumeError::InvalidBoundaryState { index });
        }
        working.push(WorkingCell {
            conserved: if corrected { canonical } else { conserved },
            primitive: recovered.primitive,
            before_flux: recovered.diagnostics,
            before_flux_iterations: recovered.iterations,
        });
    }

    let mut face_fluxes = vec![ValenciaFlux::ZERO; cells.len() + 1];
    for face in 1..cells.len() {
        face_fluxes[face] = rusanov_flux(&working[face - 1], &working[face])?;
    }

    let lambda = config.timestep.seconds() / config.cell_width;
    let mut updated = working
        .iter()
        .map(|cell| cell.conserved)
        .collect::<Vec<_>>();
    for index in 1..cells.len() - 1 {
        updated[index] = apply_flux_difference(
            working[index].conserved,
            face_fluxes[index],
            face_fluxes[index + 1],
            lambda,
        )?;
    }

    let mut result = Vec::with_capacity(cells.len());
    for (index, conserved) in updated.into_iter().enumerate() {
        let recovered = recover_primitives(
            conserved,
            eos,
            ValenciaGeometry::FLAT,
            config.recovery_policy,
        )?;
        let canonical = primitive_to_conserved(recovered.primitive, eos, ValenciaGeometry::FLAT)?;
        let corrected = recovered
            .diagnostics
            .iter()
            .any(|diagnostic| is_corrective_recovery(*diagnostic));
        result.push(ValenciaFiniteVolumeCell {
            conserved: if corrected { canonical } else { conserved },
            primitive: recovered.primitive,
            recovery_diagnostics: ValenciaCellRecoveryDiagnostics {
                before_flux: working[index].before_flux.clone(),
                before_flux_iterations: working[index].before_flux_iterations,
                after_update: recovered.diagnostics,
                after_update_iterations: recovered.iterations,
            },
        });
    }

    Ok(ValenciaFlatFiniteVolumeStep { cells: result })
}

#[derive(Debug, Clone)]
struct WorkingCell {
    conserved: ValenciaConserved,
    primitive: ValenciaPrimitive,
    before_flux: Vec<PrimitiveRecoveryDiagnostic>,
    before_flux_iterations: usize,
}

#[derive(Debug, Copy, Clone)]
struct ValenciaFlux {
    rest_mass: f64,
    momentum: Vec3,
    energy: f64,
}

impl ValenciaFlux {
    const ZERO: Self = Self {
        rest_mass: 0.0,
        momentum: vec3::ZERO,
        energy: 0.0,
    };
}

fn validate_config(
    cells: &[ValenciaConserved],
    config: ValenciaFlatFiniteVolumeConfig,
) -> Result<(), ValenciaFiniteVolumeError> {
    let dt = config.timestep.seconds();
    if cells.len() < 3 {
        return Err(ValenciaFiniteVolumeError::TooFewCells);
    }
    if !config.cell_width.is_finite() {
        return Err(ValenciaFiniteVolumeError::InvalidCellWidth);
    }
    if config.cell_width <= 0.0 {
        return Err(ValenciaFiniteVolumeError::InvalidCellWidth);
    }
    if !dt.is_finite() {
        return Err(ValenciaFiniteVolumeError::InvalidTimestep);
    }
    if dt <= 0.0 {
        return Err(ValenciaFiniteVolumeError::InvalidTimestep);
    }
    if !config.courant_factor.is_finite() {
        return Err(ValenciaFiniteVolumeError::InvalidCourantFactor);
    }
    if config.courant_factor <= 0.0 {
        return Err(ValenciaFiniteVolumeError::InvalidCourantFactor);
    }
    if config.courant_factor > 1.0 {
        return Err(ValenciaFiniteVolumeError::InvalidCourantFactor);
    }
    if dt / config.cell_width > config.courant_factor {
        return Err(ValenciaFiniteVolumeError::CflViolation);
    }
    Ok(())
}

fn physical_flux(cell: &WorkingCell) -> Result<ValenciaFlux, ValenciaFiniteVolumeError> {
    valencia_physical_flux(cell.conserved, cell.primitive)
}

pub(crate) fn valencia_physical_flux_1d(
    conserved: ValenciaConserved,
    primitive: ValenciaPrimitive,
) -> Result<[f64; 3], ValenciaFiniteVolumeError> {
    let flux = valencia_physical_flux(conserved, primitive)?;
    Ok([flux.rest_mass, flux.momentum.x, flux.energy])
}

fn valencia_physical_flux(
    conserved: ValenciaConserved,
    primitive: ValenciaPrimitive,
) -> Result<ValenciaFlux, ValenciaFiniteVolumeError> {
    let velocity_x = primitive.velocity.x;
    ensure_finite_flux(ValenciaFlux {
        rest_mass: conserved.densitized_rest_mass * velocity_x,
        momentum: conserved.momentum_density * velocity_x + vec3::new(primitive.pressure, 0.0, 0.0),
        energy: (conserved.energy_excluding_rest_mass + primitive.pressure) * velocity_x,
    })
}

fn rusanov_flux(
    left: &WorkingCell,
    right: &WorkingCell,
) -> Result<ValenciaFlux, ValenciaFiniteVolumeError> {
    let left_physical = physical_flux(left)?;
    let right_physical = physical_flux(right)?;
    ensure_finite_flux(ValenciaFlux {
        rest_mass: 0.5 * left_physical.rest_mass + 0.5 * right_physical.rest_mass
            - (0.5 * right.conserved.densitized_rest_mass
                - 0.5 * left.conserved.densitized_rest_mass),
        momentum: left_physical.momentum * 0.5 + right_physical.momentum * 0.5
            - (right.conserved.momentum_density * 0.5 - left.conserved.momentum_density * 0.5),
        energy: 0.5 * left_physical.energy + 0.5 * right_physical.energy
            - (0.5 * right.conserved.energy_excluding_rest_mass
                - 0.5 * left.conserved.energy_excluding_rest_mass),
    })
}

fn apply_flux_difference(
    conserved: ValenciaConserved,
    left: ValenciaFlux,
    right: ValenciaFlux,
    lambda: f64,
) -> Result<ValenciaConserved, ValenciaFiniteVolumeError> {
    let rest_mass_change = lambda * right.rest_mass - lambda * left.rest_mass;
    let momentum_change = right.momentum * lambda - left.momentum * lambda;
    let energy_change = lambda * right.energy - lambda * left.energy;
    let updated = ValenciaConserved {
        densitized_rest_mass: conserved.densitized_rest_mass - rest_mass_change,
        momentum_density: conserved.momentum_density - momentum_change,
        energy_excluding_rest_mass: conserved.energy_excluding_rest_mass - energy_change,
    };
    for component in conserved_components(updated) {
        if !component.is_finite() {
            return Err(ValenciaFiniteVolumeError::NonFiniteUpdate);
        }
    }
    Ok(updated)
}

fn ensure_finite_flux(flux: ValenciaFlux) -> Result<ValenciaFlux, ValenciaFiniteVolumeError> {
    for component in [
        flux.rest_mass,
        flux.momentum.x,
        flux.momentum.y,
        flux.momentum.z,
        flux.energy,
    ] {
        if !component.is_finite() {
            return Err(ValenciaFiniteVolumeError::NonFiniteFlux);
        }
    }
    Ok(flux)
}

fn conserved_components(conserved: ValenciaConserved) -> [f64; 5] {
    [
        conserved.densitized_rest_mass,
        conserved.momentum_density.x,
        conserved.momentum_density.y,
        conserved.momentum_density.z,
        conserved.energy_excluding_rest_mass,
    ]
}

fn within_primitive_recovery_range(conserved: ValenciaConserved) -> bool {
    let components = conserved_components(conserved);
    for component in components {
        if !component.is_finite() {
            return true;
        }
    }
    let mut maximum = components[0].abs();
    for component in components.into_iter().skip(1) {
        maximum = maximum.max(component.abs());
    }
    maximum <= MAX_RECOVERY_CONSERVED_MAGNITUDE
}

fn is_corrective_recovery(diagnostic: PrimitiveRecoveryDiagnostic) -> bool {
    !matches!(
        diagnostic,
        PrimitiveRecoveryDiagnostic::NewtonConverged
            | PrimitiveRecoveryDiagnostic::BisectionFallback
    )
}

#[cfg(test)]
mod flux_tests {
    use super::valencia_physical_flux;
    use crate::{vec3, ValenciaConserved, ValenciaPrimitive};

    #[test]
    fn production_flux_preserves_transverse_momentum_advection() {
        let flux = valencia_physical_flux(
            ValenciaConserved {
                densitized_rest_mass: 2.0,
                momentum_density: vec3::new(3.0, 5.0, 7.0),
                energy_excluding_rest_mass: 11.0,
            },
            ValenciaPrimitive {
                rest_mass_density: 1.0,
                velocity: vec3::new(0.25, 0.1, -0.1),
                specific_internal_energy: 1.0,
                pressure: 13.0,
            },
        )
        .unwrap();

        assert_eq!(flux.rest_mass, 0.5);
        assert_eq!(flux.momentum, vec3::new(13.75, 1.25, 1.75));
        assert_eq!(flux.energy, 6.0);
    }
}
