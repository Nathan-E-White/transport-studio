use crate::{
    BoundaryConditions3, BssnConstraintDiagnostics, BssnGridFields, ConservativeMatterGrid,
    EquationOfState, EvolutionGridField3, MatterMetricCellGrid, PhysicsError,
    enforce_bssn_algebraic_constraints,
};
use crate::{
    ConstraintDiagnosticsOperator, EinsteinTensor, StressEnergyContribution, StressEnergyTensor,
    TimeDuration,
};

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
    pub metric_on_matter: MatterMetricCellGrid,
    pub constraints: BssnConstraintDiagnostics,
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
            metric_on_matter,
            constraints,
        })
    }
}
