//! Valencia-formulation GRHD state and primitive recovery.

use crate::{
    PhysicsError, SpatialTensor2, SymmetricSpatialTensor2, Vec3, inverse_spatial_metric, vec3,
};

/// Physical fluid variables used by the Valencia GRHD formulation.
///
/// This is deliberately separate from `physics_v1`'s Eulerian hydrodynamics
/// storage: its velocity is measured with a spatial metric and its inverse map
/// from [`ValenciaConserved`] is nonlinear.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct ValenciaPrimitive {
    pub rest_mass_density: f64,
    pub velocity: Vec3,
    pub specific_internal_energy: f64,
    pub pressure: f64,
}

/// Metric-densitized conserved variables for Valencia GRHD.
///
/// These values include the spatial volume factor and are not interchangeable
/// with the flat-space conservative tuple used by `physics_v1`.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct ValenciaConserved {
    pub densitized_rest_mass: f64,
    pub momentum_density: Vec3,
    pub energy_excluding_rest_mass: f64,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct ValenciaGeometry {
    spatial_metric: SymmetricSpatialTensor2,
    inverse_spatial_metric: SpatialTensor2,
    volume_factor: f64,
}

impl ValenciaGeometry {
    pub const FLAT: Self = Self {
        spatial_metric: SymmetricSpatialTensor2::IDENTITY,
        inverse_spatial_metric: SpatialTensor2::IDENTITY,
        volume_factor: 1.0,
    };

    pub fn from_spatial_metric(
        spatial_metric: SymmetricSpatialTensor2,
    ) -> Result<Self, PhysicsError> {
        let determinant = spatial_metric.determinant();
        if !determinant.is_finite() || determinant <= 0.0 {
            return Err(PhysicsError::SingularMetric);
        }
        Ok(Self {
            spatial_metric,
            inverse_spatial_metric: inverse_spatial_metric(spatial_metric)?,
            volume_factor: determinant.sqrt(),
        })
    }

    pub const fn spatial_metric(self) -> SymmetricSpatialTensor2 {
        self.spatial_metric
    }

    pub const fn inverse_spatial_metric(self) -> SpatialTensor2 {
        self.inverse_spatial_metric
    }

    pub const fn volume_factor(self) -> f64 {
        self.volume_factor
    }
}

pub trait ValenciaEquationOfState: Copy {
    fn pressure(&self, density: f64, specific_internal_energy: f64) -> Result<f64, PhysicsError>;
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct ValenciaIdealGas {
    pub gamma: f64,
}
impl ValenciaEquationOfState for ValenciaIdealGas {
    fn pressure(&self, density: f64, energy: f64) -> Result<f64, PhysicsError> {
        if !self.gamma.is_finite()
            || self.gamma <= 1.0
            || !density.is_finite()
            || density < 0.0
            || !energy.is_finite()
            || energy < 0.0
        {
            return Err(PhysicsError::InvalidStep);
        }
        Ok((self.gamma - 1.0) * density * energy)
    }
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct ValenciaPolytrope {
    pub constant: f64,
    pub gamma: f64,
}
impl ValenciaEquationOfState for ValenciaPolytrope {
    fn pressure(&self, density: f64, _energy: f64) -> Result<f64, PhysicsError> {
        if !self.constant.is_finite()
            || self.constant < 0.0
            || !self.gamma.is_finite()
            || self.gamma <= 1.0
            || !density.is_finite()
            || density < 0.0
        {
            return Err(PhysicsError::InvalidStep);
        }
        Ok(self.constant * density.powf(self.gamma))
    }
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct PrimitiveRecoveryPolicy {
    pub density_floor: f64,
    pub pressure_floor: f64,
    pub atmosphere_density: f64,
    pub lorentz_factor_cap: f64,
    pub tolerance: f64,
    pub max_iterations: usize,
}
impl PrimitiveRecoveryPolicy {
    pub const DEFAULT: Self = Self {
        density_floor: 1e-12,
        pressure_floor: 1e-14,
        atmosphere_density: 1e-10,
        lorentz_factor_cap: 100.0,
        tolerance: 1e-10,
        max_iterations: 32,
    };
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum PrimitiveRecoveryDiagnostic {
    NewtonConverged,
    BisectionFallback,
    AtmosphereApplied,
    DensityFloorApplied,
    PressureFloorApplied,
    LorentzFactorCapped,
    InvalidConservedState,
    EquationOfStateOutOfBounds,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PrimitiveRecoveryOutcome {
    pub primitive: ValenciaPrimitive,
    pub diagnostics: Vec<PrimitiveRecoveryDiagnostic>,
    /// Total Newton and fallback iterations used by this recovery attempt.
    pub iterations: usize,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PrimitiveRecoveryError {
    #[error("primitive recovery policy is invalid")]
    InvalidPolicy,
    #[error("Valencia geometry is invalid")]
    InvalidGeometry,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum RecoveryResidualFailure {
    UnphysicalState,
    EquationOfState,
}

pub fn primitive_to_conserved<E: ValenciaEquationOfState>(
    primitive: ValenciaPrimitive,
    eos: E,
    geometry: ValenciaGeometry,
) -> Result<ValenciaConserved, PhysicsError> {
    let rho = primitive.rest_mass_density;
    if !valid_geometry(geometry) {
        return Err(PhysicsError::SingularMetric);
    }
    let covariant_velocity = geometry.spatial_metric.apply_to_vector(primitive.velocity);
    let v2 = primitive.velocity.dot(covariant_velocity);
    if !rho.is_finite()
        || rho <= 0.0
        || !v2.is_finite()
        || v2 >= 1.0
        || !primitive.specific_internal_energy.is_finite()
        || primitive.specific_internal_energy < 0.0
        || !primitive.pressure.is_finite()
    {
        return Err(PhysicsError::InvalidStep);
    }
    let pressure = eos.pressure(rho, primitive.specific_internal_energy)?;
    if !pressure_matches_eos(primitive.pressure, pressure) {
        return Err(PhysicsError::InvalidStep);
    }
    let lorentz = 1.0 / (1.0 - v2).sqrt();
    let enthalpy = 1.0 + primitive.specific_internal_energy + pressure / rho;
    let d = rho * lorentz;
    let q = rho * enthalpy * lorentz * lorentz;
    Ok(ValenciaConserved {
        densitized_rest_mass: geometry.volume_factor * d,
        momentum_density: covariant_velocity * (geometry.volume_factor * q),
        energy_excluding_rest_mass: geometry.volume_factor * (q - pressure - d),
    })
}

pub(crate) fn pressure_matches_eos(actual: f64, expected: f64) -> bool {
    actual.is_finite()
        && expected.is_finite()
        && (actual - expected).abs() <= 1e-10 * (1.0 + expected.abs())
}

pub fn recover_primitives<E: ValenciaEquationOfState>(
    conserved: ValenciaConserved,
    eos: E,
    geometry: ValenciaGeometry,
    policy: PrimitiveRecoveryPolicy,
) -> Result<PrimitiveRecoveryOutcome, PrimitiveRecoveryError> {
    if !valid_policy(policy) {
        return Err(PrimitiveRecoveryError::InvalidPolicy);
    }
    if !valid_geometry(geometry) {
        return Err(PrimitiveRecoveryError::InvalidGeometry);
    }
    if !valid_conserved(conserved) {
        return Ok(atmosphere(
            policy,
            eos,
            PrimitiveRecoveryDiagnostic::InvalidConservedState,
        ));
    }
    let conserved = ValenciaConserved {
        densitized_rest_mass: conserved.densitized_rest_mass / geometry.volume_factor,
        momentum_density: conserved.momentum_density / geometry.volume_factor,
        energy_excluding_rest_mass: conserved.energy_excluding_rest_mass / geometry.volume_factor,
    };
    let d = conserved.densitized_rest_mass.max(policy.density_floor);
    let mut diagnostics = Vec::new();
    if d != conserved.densitized_rest_mass {
        diagnostics.push(PrimitiveRecoveryDiagnostic::DensityFloorApplied);
    }
    let mut pressure = policy
        .pressure_floor
        .max(0.1 * conserved.energy_excluding_rest_mass.max(0.0));
    let mut converged = false;
    let mut iterations = 0;
    for _ in 0..policy.max_iterations {
        iterations += 1;
        let residual = match recovery_residual(conserved, d, pressure, eos, geometry, policy) {
            Ok(value) => value,
            Err(RecoveryResidualFailure::EquationOfState) => {
                push_once(
                    &mut diagnostics,
                    PrimitiveRecoveryDiagnostic::EquationOfStateOutOfBounds,
                );
                break;
            }
            Err(RecoveryResidualFailure::UnphysicalState) => break,
        };
        if residual.abs() <= policy.tolerance * (1.0 + pressure.abs()) {
            converged = true;
            break;
        }
        let step = (pressure.abs() * 1e-6).max(1e-10);
        let next_residual =
            match recovery_residual(conserved, d, pressure + step, eos, geometry, policy) {
                Ok(value) => value,
                Err(RecoveryResidualFailure::EquationOfState) => {
                    push_once(
                        &mut diagnostics,
                        PrimitiveRecoveryDiagnostic::EquationOfStateOutOfBounds,
                    );
                    break;
                }
                Err(RecoveryResidualFailure::UnphysicalState) => break,
            };
        let derivative = (next_residual - residual) / step;
        if !derivative.is_finite() || derivative.abs() < 1e-14 {
            break;
        }
        pressure = (pressure - residual / derivative).max(policy.pressure_floor);
    }
    if converged {
        diagnostics.push(PrimitiveRecoveryDiagnostic::NewtonConverged);
    } else {
        diagnostics.push(PrimitiveRecoveryDiagnostic::BisectionFallback);
        let recovered = match bisection_pressure(conserved, d, eos, geometry, policy) {
            Ok(Some((value, fallback_iterations))) => {
                iterations += fallback_iterations;
                value
            }
            Ok(None) | Err(RecoveryResidualFailure::UnphysicalState) => {
                return Ok(atmosphere_with(policy, eos, diagnostics, iterations));
            }
            Err(RecoveryResidualFailure::EquationOfState) => {
                push_once(
                    &mut diagnostics,
                    PrimitiveRecoveryDiagnostic::EquationOfStateOutOfBounds,
                );
                return Ok(atmosphere_with(policy, eos, diagnostics, iterations));
            }
        };
        pressure = recovered;
    }
    Ok(finish_recovery(
        conserved,
        d,
        pressure,
        eos,
        geometry,
        policy,
        diagnostics.clone(),
        iterations,
    )
    .unwrap_or_else(|| {
        push_once(
            &mut diagnostics,
            PrimitiveRecoveryDiagnostic::EquationOfStateOutOfBounds,
        );
        diagnostics.push(PrimitiveRecoveryDiagnostic::AtmosphereApplied);
        atmosphere_with(policy, eos, diagnostics, iterations)
    }))
}

fn recovery_residual<E: ValenciaEquationOfState>(
    conserved: ValenciaConserved,
    rest_mass: f64,
    pressure: f64,
    eos: E,
    geometry: ValenciaGeometry,
    _policy: PrimitiveRecoveryPolicy,
) -> Result<f64, RecoveryResidualFailure> {
    let total_energy_density = conserved.energy_excluding_rest_mass + rest_mass + pressure;
    let raised_momentum = geometry
        .inverse_spatial_metric
        .apply_to_vector(conserved.momentum_density);
    let momentum_norm_squared = conserved.momentum_density.dot(raised_momentum);
    if total_energy_density <= 0.0
        || momentum_norm_squared >= total_energy_density * total_energy_density
    {
        return Err(RecoveryResidualFailure::UnphysicalState);
    }
    let lorentz_factor =
        1.0 / (1.0 - momentum_norm_squared / (total_energy_density * total_energy_density)).sqrt();
    if !lorentz_factor.is_finite() {
        return Err(RecoveryResidualFailure::UnphysicalState);
    }
    let density = rest_mass / lorentz_factor;
    let specific_enthalpy = total_energy_density / (rest_mass * lorentz_factor);
    let energy = (specific_enthalpy - 1.0 - pressure / density).max(0.0);
    let eos_pressure = eos
        .pressure(density, energy)
        .map_err(|_| RecoveryResidualFailure::EquationOfState)?;
    if !eos_pressure.is_finite() {
        return Err(RecoveryResidualFailure::EquationOfState);
    }
    Ok(pressure - eos_pressure)
}

fn bisection_pressure<E: ValenciaEquationOfState>(
    conserved: ValenciaConserved,
    rest_mass: f64,
    eos: E,
    geometry: ValenciaGeometry,
    policy: PrimitiveRecoveryPolicy,
) -> Result<Option<(f64, usize)>, RecoveryResidualFailure> {
    let mut lower_pressure = policy.pressure_floor;
    let momentum_norm = conserved
        .momentum_density
        .dot(
            geometry
                .inverse_spatial_metric
                .apply_to_vector(conserved.momentum_density),
        )
        .sqrt();
    let mut upper_pressure =
        (conserved.energy_excluding_rest_mass.abs() + rest_mass + momentum_norm).max(1.0) * 10.0;
    let mut lower_residual =
        recovery_residual(conserved, rest_mass, lower_pressure, eos, geometry, policy)?;
    let upper_residual =
        recovery_residual(conserved, rest_mass, upper_pressure, eos, geometry, policy)?;
    if lower_residual.signum() == upper_residual.signum() {
        return Ok(None);
    }
    for iteration in 1..=64 {
        let midpoint = 0.5 * (lower_pressure + upper_pressure);
        let midpoint_residual =
            recovery_residual(conserved, rest_mass, midpoint, eos, geometry, policy)?;
        if midpoint_residual.abs() <= policy.tolerance {
            return Ok(Some((midpoint, iteration)));
        }
        if lower_residual.signum() == midpoint_residual.signum() {
            lower_pressure = midpoint;
            lower_residual = midpoint_residual;
        } else {
            upper_pressure = midpoint;
        }
    }
    Ok(Some((0.5 * (lower_pressure + upper_pressure), 64)))
}

fn finish_recovery<E: ValenciaEquationOfState>(
    conserved: ValenciaConserved,
    rest_mass: f64,
    mut pressure: f64,
    eos: E,
    geometry: ValenciaGeometry,
    policy: PrimitiveRecoveryPolicy,
    mut diagnostics: Vec<PrimitiveRecoveryDiagnostic>,
    iterations: usize,
) -> Option<PrimitiveRecoveryOutcome> {
    if pressure < policy.pressure_floor {
        pressure = policy.pressure_floor;
        diagnostics.push(PrimitiveRecoveryDiagnostic::PressureFloorApplied);
    }
    let total_energy_density = conserved.energy_excluding_rest_mass + rest_mass + pressure;
    let mut velocity = geometry
        .inverse_spatial_metric
        .apply_to_vector(conserved.momentum_density)
        / total_energy_density;
    let mut v2 = velocity.dot(geometry.spatial_metric.apply_to_vector(velocity));
    let max_v2 = 1.0 - 1.0 / (policy.lorentz_factor_cap * policy.lorentz_factor_cap);
    if v2 > max_v2 {
        velocity = velocity * (max_v2 / v2).sqrt();
        v2 = max_v2;
        diagnostics.push(PrimitiveRecoveryDiagnostic::LorentzFactorCapped);
    }
    let lorentz_factor = 1.0 / (1.0 - v2).sqrt();
    let density = (rest_mass / lorentz_factor).max(policy.density_floor);
    let specific_enthalpy = total_energy_density / (rest_mass * lorentz_factor);
    let energy = (specific_enthalpy - 1.0 - pressure / density).max(0.0);
    let recovered_pressure = eos.pressure(density, energy).ok()?;
    if !recovered_pressure.is_finite() || recovered_pressure < 0.0 {
        return None;
    }
    if recovered_pressure < policy.pressure_floor {
        return None;
    }
    Some(PrimitiveRecoveryOutcome {
        primitive: ValenciaPrimitive {
            rest_mass_density: density,
            velocity,
            specific_internal_energy: energy,
            pressure: recovered_pressure,
        },
        diagnostics,
        iterations,
    })
}

fn valid_conserved(c: ValenciaConserved) -> bool {
    c.densitized_rest_mass.is_finite()
        && c.densitized_rest_mass > 0.0
        && c.energy_excluding_rest_mass.is_finite()
        && c.momentum_density.x.is_finite()
        && c.momentum_density.y.is_finite()
        && c.momentum_density.z.is_finite()
}
fn valid_policy(p: PrimitiveRecoveryPolicy) -> bool {
    p.density_floor.is_finite()
        && p.density_floor > 0.0
        && p.pressure_floor.is_finite()
        && p.pressure_floor >= 0.0
        && p.atmosphere_density.is_finite()
        && p.atmosphere_density >= p.density_floor
        && p.lorentz_factor_cap.is_finite()
        && p.lorentz_factor_cap > 1.0
        && p.tolerance.is_finite()
        && p.tolerance > 0.0
        && p.max_iterations > 0
}
fn valid_geometry(geometry: ValenciaGeometry) -> bool {
    geometry.volume_factor.is_finite()
        && geometry.volume_factor > 0.0
        && geometry
            .spatial_metric
            .components
            .iter()
            .flatten()
            .all(|value| value.is_finite())
        && geometry
            .inverse_spatial_metric
            .components
            .iter()
            .flatten()
            .all(|value| value.is_finite())
}
fn push_once(
    diagnostics: &mut Vec<PrimitiveRecoveryDiagnostic>,
    diagnostic: PrimitiveRecoveryDiagnostic,
) {
    if !diagnostics.contains(&diagnostic) {
        diagnostics.push(diagnostic);
    }
}
fn atmosphere<E: ValenciaEquationOfState>(
    policy: PrimitiveRecoveryPolicy,
    eos: E,
    diagnostic: PrimitiveRecoveryDiagnostic,
) -> PrimitiveRecoveryOutcome {
    atmosphere_with(
        policy,
        eos,
        vec![diagnostic, PrimitiveRecoveryDiagnostic::AtmosphereApplied],
        0,
    )
}
fn atmosphere_with<E: ValenciaEquationOfState>(
    policy: PrimitiveRecoveryPolicy,
    eos: E,
    mut diagnostics: Vec<PrimitiveRecoveryDiagnostic>,
    iterations: usize,
) -> PrimitiveRecoveryOutcome {
    if !diagnostics.contains(&PrimitiveRecoveryDiagnostic::AtmosphereApplied) {
        diagnostics.push(PrimitiveRecoveryDiagnostic::AtmosphereApplied);
    }
    let density = policy.atmosphere_density.max(policy.density_floor);
    let pressure = eos.pressure(density, 0.0).unwrap_or_else(|_| {
        push_once(
            &mut diagnostics,
            PrimitiveRecoveryDiagnostic::EquationOfStateOutOfBounds,
        );
        policy.pressure_floor
    });
    if !pressure.is_finite() || pressure < policy.pressure_floor {
        push_once(
            &mut diagnostics,
            PrimitiveRecoveryDiagnostic::EquationOfStateOutOfBounds,
        );
    }
    PrimitiveRecoveryOutcome {
        primitive: ValenciaPrimitive {
            rest_mass_density: density,
            velocity: vec3::ZERO,
            specific_internal_energy: 0.0,
            pressure,
        },
        diagnostics,
        iterations,
    }
}
