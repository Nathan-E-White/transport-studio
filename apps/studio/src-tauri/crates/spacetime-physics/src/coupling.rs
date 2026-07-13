use crate::RadiationTransportMode;
use crate::radiation::{OrthonormalGrayRadiationMoments, close_gray_m1_moments};
use crate::{
    BoundaryConditions3, BssnConstraintDiagnostics, BssnGridFields, ConservativeMatterGrid,
    EquationOfState, EvolutionGridField3, MatterMetricCellGrid, PhysicsError,
    enforce_bssn_algebraic_constraints,
};
use crate::{
    ConstraintDiagnosticsOperator, EinsteinTensor, StressEnergyContribution, StressEnergyTensor,
    SymmetricSpatialTensor2, TimeDuration, ValenciaEquationOfState, ValenciaGeometry,
    ValenciaPrimitive, Vec3, primitive_to_conserved, vec3,
};

const STRESS_ENERGY_SYMMETRY_TOLERANCE: f64 = 1.0e-12;
const STRESS_ENERGY_SYMMETRIC_PAIRS: [(usize, usize); 6] =
    [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)];

/// Origin of the stress-energy presented to one BSSN source cell.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum BssnSourcePath {
    Vacuum,
    Matter,
    Radiation,
    Combined,
}

/// Eulerian-orthonormal 3+1 projection of one stress-energy tensor.
///
/// This narrow slice interprets `T00` as energy density, `T0i` as momentum density, and `Tij`
/// as spatial stress in the local Eulerian orthonormal frame. A coordinate-basis projection for
/// general lapse and shift remains future work.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct BssnSourceProjection {
    pub energy_density: f64,
    pub momentum_density: Vec3,
    pub spatial_stress: SymmetricSpatialTensor2,
    pub spatial_stress_trace: f64,
}

impl BssnSourceProjection {
    pub const ZERO: Self = Self {
        energy_density: 0.0,
        momentum_density: vec3::ZERO,
        spatial_stress: SymmetricSpatialTensor2::ZERO,
        spatial_stress_trace: 0.0,
    };

    pub fn from_eulerian_orthonormal_tensor(
        tensor: StressEnergyTensor,
    ) -> Result<Self, PhysicsError> {
        if tensor
            .components
            .iter()
            .flatten()
            .any(|value| !value.is_finite())
        {
            return Err(PhysicsError::InvalidStep);
        }
        for (mu, nu) in STRESS_ENERGY_SYMMETRIC_PAIRS {
            let lhs = tensor.components[mu][nu];
            let rhs = tensor.components[nu][mu];
            let scale = 1.0 + lhs.abs().max(rhs.abs());
            if (lhs - rhs).abs() > STRESS_ENERGY_SYMMETRY_TOLERANCE * scale {
                return Err(PhysicsError::InvalidStep);
            }
        }
        let symmetric_component = |mu: usize, nu: usize| {
            0.5 * tensor.components[mu][nu] + 0.5 * tensor.components[nu][mu]
        };
        let spatial_stress = SymmetricSpatialTensor2::new([
            [
                tensor.components[1][1],
                symmetric_component(1, 2),
                symmetric_component(1, 3),
            ],
            [
                symmetric_component(1, 2),
                tensor.components[2][2],
                symmetric_component(2, 3),
            ],
            [
                symmetric_component(1, 3),
                symmetric_component(2, 3),
                tensor.components[3][3],
            ],
        ]);
        let momentum_density = vec3::new(
            symmetric_component(0, 1),
            symmetric_component(0, 2),
            symmetric_component(0, 3),
        );
        let spatial_stress_trace = spatial_stress.components[0][0]
            + spatial_stress.components[1][1]
            + spatial_stress.components[2][2];
        if !spatial_stress_trace.is_finite() {
            return Err(PhysicsError::InvalidStep);
        }
        Ok(Self {
            energy_density: tensor.components[0][0],
            momentum_density,
            spatial_stress,
            spatial_stress_trace,
        })
    }
}

/// Canonical local-frame stress-energy from the Valencia GRHD primitive state.
pub fn valencia_stress_energy_in_eulerian_orthonormal_frame<Eos: ValenciaEquationOfState>(
    primitive: ValenciaPrimitive,
    eos: Eos,
) -> Result<StressEnergyTensor, PhysicsError> {
    let conserved = primitive_to_conserved(primitive, eos, ValenciaGeometry::FLAT)?;
    let momentum = conserved.momentum_density.to_packed().data;
    let velocity = primitive.velocity.to_packed().data;
    let mut components = [[0.0; 4]; 4];
    components[0][0] = conserved.energy_excluding_rest_mass + conserved.densitized_rest_mass;
    for axis in 0..3 {
        components[0][axis + 1] = momentum[axis];
        components[axis + 1][0] = momentum[axis];
    }
    for i in 0..3 {
        for j in 0..3 {
            components[i + 1][j + 1] =
                momentum[i] * velocity[j] + if i == j { primitive.pressure } else { 0.0 };
        }
    }
    let tensor = StressEnergyTensor::new(components);
    BssnSourceProjection::from_eulerian_orthonormal_tensor(tensor)?;
    Ok(tensor)
}

/// Canonical local-frame stress-energy from closed gray-M1 radiation moments.
pub fn gray_m1_stress_energy_in_eulerian_orthonormal_frame(
    moments: OrthonormalGrayRadiationMoments,
) -> Result<StressEnergyTensor, PhysicsError> {
    let closed = close_gray_m1_moments(RadiationTransportMode::GrayM1, moments)
        .map_err(|_| PhysicsError::InvalidStep)?;
    let flux = moments.flux.to_packed().data;
    let mut components = [[0.0; 4]; 4];
    components[0][0] = moments.energy_density;
    for axis in 0..3 {
        components[0][axis + 1] = flux[axis];
        components[axis + 1][0] = flux[axis];
    }
    for i in 0..3 {
        for j in 0..3 {
            components[i + 1][j + 1] = closed.pressure.components[i][j];
        }
    }
    Ok(StressEnergyTensor::new(components))
}

/// Project canonical Valencia matter and gray-M1 radiation into one BSSN source cell.
pub fn project_valencia_gray_m1_bssn_sources<Eos: ValenciaEquationOfState>(
    matter: ValenciaPrimitive,
    eos: Eos,
    radiation: OrthonormalGrayRadiationMoments,
) -> Result<(StressEnergyTensor, BssnSourceEvidence), PhysicsError> {
    let matter_tensor = valencia_stress_energy_in_eulerian_orthonormal_frame(matter, eos)?;
    let radiation_tensor = gray_m1_stress_energy_in_eulerian_orthonormal_frame(radiation)?;
    Ok((
        matter_tensor + radiation_tensor,
        project_bssn_sources(matter_tensor, radiation_tensor)?,
    ))
}

/// Separated and total BSSN source evidence for one cell.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct BssnSourceEvidence {
    pub path: BssnSourcePath,
    pub matter: BssnSourceProjection,
    pub radiation: BssnSourceProjection,
    pub total: BssnSourceProjection,
}

impl BssnSourceEvidence {
    pub const VACUUM: Self = Self {
        path: BssnSourcePath::Vacuum,
        matter: BssnSourceProjection::ZERO,
        radiation: BssnSourceProjection::ZERO,
        total: BssnSourceProjection::ZERO,
    };
}

pub fn project_bssn_sources(
    matter: StressEnergyTensor,
    radiation: StressEnergyTensor,
) -> Result<BssnSourceEvidence, PhysicsError> {
    let matter_projection = BssnSourceProjection::from_eulerian_orthonormal_tensor(matter)?;
    let radiation_projection = BssnSourceProjection::from_eulerian_orthonormal_tensor(radiation)?;
    let path = match (
        matter != StressEnergyTensor::ZERO,
        radiation != StressEnergyTensor::ZERO,
    ) {
        (false, false) => BssnSourcePath::Vacuum,
        (true, false) => BssnSourcePath::Matter,
        (false, true) => BssnSourcePath::Radiation,
        (true, true) => BssnSourcePath::Combined,
    };
    Ok(BssnSourceEvidence {
        path,
        matter: matter_projection,
        radiation: radiation_projection,
        total: BssnSourceProjection::from_eulerian_orthonormal_tensor(matter + radiation)?,
    })
}

/// Coupling constants for the Einstein field equations.
///
/// With SI-like units, the source factor is 8πG/c⁴. Codes using geometric or
/// normalized units can set these constants accordingly.
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd)]
pub struct RelativisticCouplingConstants {
    pub c: f64,
    pub gravitational_constant: f64,
}

impl RelativisticCouplingConstants {
    pub const fn new(c: f64, gravitational_constant: f64) -> Self {
        Self {
            c,
            gravitational_constant,
        }
    }

    pub fn einstein_source_factor(self) -> Result<f64, PhysicsError> {
        if self.c <= 0.0 {
            return Err(PhysicsError::SpeedOfLightMustBePositive);
        }

        Ok(8.0 * std::f64::consts::PI * self.gravitational_constant / self.c.powi(4))
    }
}

/// Residual form of the Einstein field equations:
///
/// G_μν - (8πG/c⁴) T_μν = 0.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct EinsteinEquationResidual {
    pub components: [[f64; 4]; 4],
}

impl EinsteinEquationResidual {
    pub const ZERO: Self = Self {
        components: [[0.0; 4]; 4],
    };

    pub fn from_tensors(
        geometry: EinsteinTensor,
        source: StressEnergyTensor,
        constants: RelativisticCouplingConstants,
    ) -> Result<Self, PhysicsError> {
        let source_factor = constants.einstein_source_factor()?;
        let mut components = [[0.0; 4]; 4];

        for mu in 0..4 {
            for nu in 0..4 {
                components[mu][nu] =
                    geometry.components[mu][nu] - source_factor * source.components[mu][nu];
            }
        }

        Ok(Self { components })
    }
}

/// Mutable state for a coupled BSSN geometry plus conservative matter/radiation solve.
#[derive(Debug, Clone, PartialEq)]
pub struct CoupledBssnMatterState<Eos> {
    pub geometry: BssnGridFields,
    pub matter: ConservativeMatterGrid<Eos>,
}

impl<Eos> CoupledBssnMatterState<Eos> {
    pub const fn new(geometry: BssnGridFields, matter: ConservativeMatterGrid<Eos>) -> Self {
        Self { geometry, matter }
    }
}

/// Diagnostics emitted by one coupled BSSN/matter step.
#[derive(Debug, Clone, PartialEq)]
pub struct CoupledStepDiagnostics {
    pub deposited_history_count: usize,
    pub stress_energy: EvolutionGridField3<StressEnergyTensor>,
    pub bssn_sources: EvolutionGridField3<BssnSourceEvidence>,
    pub metric_on_matter: MatterMetricCellGrid,
    pub constraints: BssnConstraintDiagnostics,
}

/// Controlled toy response used to prove that projected sources reach the BSSN geometry path.
///
/// It advances only the trace of the extrinsic curvature by `response_coefficient * E * dt`.
/// It is not a production BSSN evolution system and makes no strong-field accuracy claim.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct ControlledToyBssnSourceStepper {
    pub response_coefficient: f64,
}

impl BssnGeometryStepper for ControlledToyBssnSourceStepper {
    fn evolve_geometry(
        &self,
        geometry: &mut BssnGridFields,
        stress_energy: &EvolutionGridField3<StressEnergyTensor>,
        dt: TimeDuration,
    ) -> Result<(), PhysicsError> {
        if !self.response_coefficient.is_finite() {
            return Err(PhysicsError::InvalidStep);
        }
        if !dt.seconds().is_finite() {
            return Err(PhysicsError::InvalidStep);
        }
        if geometry.grid != stress_energy.grid {
            return Err(PhysicsError::InvalidStep);
        }
        let mut staged = geometry.clone();
        for index in 0..stress_energy.interior_len() {
            let ijk = stress_energy.interior_ijk_for_index(index)?;
            let projection = BssnSourceProjection::from_eulerian_orthonormal_tensor(
                *stress_energy.get_interior(ijk[0], ijk[1], ijk[2])?,
            )?;
            let current = *staged
                .trace_extrinsic_curvature
                .get_interior(ijk[0], ijk[1], ijk[2])?;
            let next =
                current + self.response_coefficient * projection.energy_density * dt.seconds();
            if !next.is_finite() {
                return Err(PhysicsError::InvalidStep);
            }
            staged
                .trace_extrinsic_curvature
                .set_interior(ijk[0], ijk[1], ijk[2], next)?;
        }
        staged.apply_boundary_conditions()?;
        *geometry = staged;
        Ok(())
    }
}

/// Geometry RHS/evolution backend for the coupled pipeline.
pub trait BssnGeometryStepper {
    fn evolve_geometry(
        &self,
        geometry: &mut BssnGridFields,
        stress_energy: &EvolutionGridField3<StressEnergyTensor>,
        dt: TimeDuration,
    ) -> Result<(), PhysicsError>;
}

/// Matter/radiation RHS/evolution backend for the coupled pipeline.
pub trait MatterRadiationStepper<Eos: EquationOfState> {
    fn evolve_matter(
        &self,
        matter: &mut ConservativeMatterGrid<Eos>,
        metric: &MatterMetricCellGrid,
        dt: TimeDuration,
    ) -> Result<(), PhysicsError>;
}

/// Gauge and constraint projection hook after geometry/matter updates.
pub trait GaugeConditionEnforcer {
    fn enforce_gauge(&self, geometry: &mut BssnGridFields) -> Result<(), PhysicsError>;
}

/// Placeholder backend that validates the source field and leaves geometry unchanged.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct NoopBssnGeometryStepper;

impl BssnGeometryStepper for NoopBssnGeometryStepper {
    fn evolve_geometry(
        &self,
        geometry: &mut BssnGridFields,
        stress_energy: &EvolutionGridField3<StressEnergyTensor>,
        dt: TimeDuration,
    ) -> Result<(), PhysicsError> {
        if !dt.seconds().is_finite() || geometry.grid != stress_energy.grid {
            return Err(PhysicsError::InvalidGrid);
        }

        geometry.apply_boundary_conditions()
    }
}

/// Placeholder backend that validates updated metric sampling and leaves matter unchanged.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct NoopMatterRadiationStepper;

impl<Eos: EquationOfState> MatterRadiationStepper<Eos> for NoopMatterRadiationStepper {
    fn evolve_matter(
        &self,
        matter: &mut ConservativeMatterGrid<Eos>,
        metric: &MatterMetricCellGrid,
        dt: TimeDuration,
    ) -> Result<(), PhysicsError> {
        if !dt.seconds().is_finite() || matter.grid != metric.grid {
            return Err(PhysicsError::InvalidGrid);
        }

        matter.apply_boundary_conditions()
    }
}

/// Gauge hook that applies current BSSN algebraic projections.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct AlgebraicBssnGaugeEnforcer;

impl GaugeConditionEnforcer for AlgebraicBssnGaugeEnforcer {
    fn enforce_gauge(&self, geometry: &mut BssnGridFields) -> Result<(), PhysicsError> {
        enforce_bssn_algebraic_constraints(geometry)
    }
}

/// Orchestrates one deposit -> geometry -> matter -> projection -> diagnostics step.
#[derive(Debug, Clone, PartialEq)]
pub struct CoupledBssnMatterStepper<GeometryStepper, MatterStepper, GaugeEnforcer> {
    pub geometry_stepper: GeometryStepper,
    pub matter_stepper: MatterStepper,
    pub gauge_enforcer: GaugeEnforcer,
    pub constraint_operator: ConstraintDiagnosticsOperator,
    pub matter_metric_ghost_width: usize,
    pub matter_metric_boundary_conditions: BoundaryConditions3,
}

impl
    CoupledBssnMatterStepper<
        NoopBssnGeometryStepper,
        NoopMatterRadiationStepper,
        AlgebraicBssnGaugeEnforcer,
    >
{
    pub const fn noop() -> Self {
        Self {
            geometry_stepper: NoopBssnGeometryStepper,
            matter_stepper: NoopMatterRadiationStepper,
            gauge_enforcer: AlgebraicBssnGaugeEnforcer,
            constraint_operator: ConstraintDiagnosticsOperator::SECOND_ORDER,
            matter_metric_ghost_width: 1,
            matter_metric_boundary_conditions: BoundaryConditions3::OUTFLOW,
        }
    }
}

impl<GeometryStepper, MatterStepper, GaugeEnforcer>
    CoupledBssnMatterStepper<GeometryStepper, MatterStepper, GaugeEnforcer>
{
    pub const fn new(
        geometry_stepper: GeometryStepper,
        matter_stepper: MatterStepper,
        gauge_enforcer: GaugeEnforcer,
        constraint_operator: ConstraintDiagnosticsOperator,
        matter_metric_ghost_width: usize,
        matter_metric_boundary_conditions: BoundaryConditions3,
    ) -> Self {
        Self {
            geometry_stepper,
            matter_stepper,
            gauge_enforcer,
            constraint_operator,
            matter_metric_ghost_width,
            matter_metric_boundary_conditions,
        }
    }

    pub fn step<Eos>(
        &self,
        state: &mut CoupledBssnMatterState<Eos>,
        depositions: &[StressEnergyContribution],
        dt: TimeDuration,
    ) -> Result<CoupledStepDiagnostics, PhysicsError>
    where
        Eos: EquationOfState,
        GeometryStepper: BssnGeometryStepper,
        MatterStepper: MatterRadiationStepper<Eos>,
        GaugeEnforcer: GaugeConditionEnforcer,
    {
        if !dt.seconds().is_finite() {
            return Err(PhysicsError::InvalidStep);
        }

        for contribution in depositions {
            state.matter.deposit_stress_energy_nearest(*contribution)?;
        }

        let stress_energy = state.matter.stress_energy_field()?;
        let mut bssn_sources = EvolutionGridField3::new(
            state.matter.grid,
            state.matter.density.centering,
            state.matter.density.ghost_zones,
            state.matter.density.boundary_conditions,
            BssnSourceEvidence::VACUUM,
        )?;
        for index in 0..state.matter.density.interior_len() {
            let ijk = state.matter.density.interior_ijk_for_index(index)?;
            bssn_sources.set_interior(
                ijk[0],
                ijk[1],
                ijk[2],
                project_bssn_sources(
                    state
                        .matter
                        .matter_stress_energy_at_cell(ijk[0], ijk[1], ijk[2])?,
                    *state
                        .matter
                        .radiation_particle_stress_energy
                        .get_interior(ijk[0], ijk[1], ijk[2])?,
                )?,
            )?;
        }
        bssn_sources.apply_boundary_conditions()?;
        self.geometry_stepper
            .evolve_geometry(&mut state.geometry, &stress_energy, dt)?;

        let metric_on_matter = MatterMetricCellGrid::from_solver_grid(
            &state.geometry,
            self.matter_metric_ghost_width,
            self.matter_metric_boundary_conditions,
        )?;
        self.matter_stepper
            .evolve_matter(&mut state.matter, &metric_on_matter, dt)?;

        self.gauge_enforcer.enforce_gauge(&mut state.geometry)?;
        state.geometry.time = state.geometry.time + dt;
        state.matter.time = state.geometry.time;

        let constraints = self.constraint_operator.bssn_constraints(&state.geometry)?;

        Ok(CoupledStepDiagnostics {
            deposited_history_count: depositions.len(),
            stress_energy,
            bssn_sources,
            metric_on_matter,
            constraints,
        })
    }
}
