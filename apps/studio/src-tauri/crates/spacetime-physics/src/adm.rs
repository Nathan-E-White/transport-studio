use crate::vec3;
use crate::{
    BoundaryConditions3, CoordinateTime, EvolutionGridField3, MetricSolverGrid, PhysicsError,
    SymmetricSpatialTensor2, TimeDuration, UniformGrid3, Vec3,
};

/// Grid-backed ADM/3+1 metric variables used as the solver-facing core state.
pub trait AdmMetricGrid {
    fn grid(&self) -> UniformGrid3;

    fn coordinate_time(&self) -> CoordinateTime;

    fn lapse(&self) -> &EvolutionGridField3<f64>;

    fn shift(&self) -> &EvolutionGridField3<Vec3>;

    fn spatial_metric(&self) -> &EvolutionGridField3<SymmetricSpatialTensor2>;

    fn extrinsic_curvature(&self) -> &EvolutionGridField3<SymmetricSpatialTensor2>;
}

/// Cell-centered ADM fields: alpha, beta^i, gamma_ij, and K_ij.
#[derive(Debug, Clone, PartialEq)]
pub struct AdmGridFields {
    pub grid: UniformGrid3,
    pub time: CoordinateTime,
    pub lapse: EvolutionGridField3<f64>,
    pub shift: EvolutionGridField3<Vec3>,
    pub spatial_metric: EvolutionGridField3<SymmetricSpatialTensor2>,
    pub extrinsic_curvature: EvolutionGridField3<SymmetricSpatialTensor2>,
}

impl AdmGridFields {
    pub fn new(
        grid: UniformGrid3,
        time: CoordinateTime,
        lapse: EvolutionGridField3<f64>,
        shift: EvolutionGridField3<Vec3>,
        spatial_metric: EvolutionGridField3<SymmetricSpatialTensor2>,
        extrinsic_curvature: EvolutionGridField3<SymmetricSpatialTensor2>,
    ) -> Result<Self, PhysicsError> {
        if lapse.grid != grid
            || shift.grid != grid
            || spatial_metric.grid != grid
            || extrinsic_curvature.grid != grid
            || !lapse.same_layout(&shift)
            || !lapse.same_layout(&spatial_metric)
            || !lapse.same_layout(&extrinsic_curvature)
        {
            return Err(PhysicsError::InvalidGrid);
        }

        Ok(Self {
            grid,
            time,
            lapse,
            shift,
            spatial_metric,
            extrinsic_curvature,
        })
    }

    pub fn flat_cartesian(grid: UniformGrid3, time: CoordinateTime) -> Result<Self, PhysicsError> {
        Self::flat_cartesian_with_ghosts(grid, time, 1, BoundaryConditions3::OUTFLOW)
    }

    pub fn flat_cartesian_with_ghosts(
        grid: UniformGrid3,
        time: CoordinateTime,
        ghost_width: usize,
        boundary_conditions: BoundaryConditions3,
    ) -> Result<Self, PhysicsError> {
        Self::new(
            grid,
            time,
            EvolutionGridField3::cell_centered_with_ghosts(
                grid,
                ghost_width,
                boundary_conditions,
                1.0,
            )?,
            EvolutionGridField3::cell_centered_with_ghosts(
                grid,
                ghost_width,
                boundary_conditions,
                vec3::ZERO,
            )?,
            EvolutionGridField3::cell_centered_with_ghosts(
                grid,
                ghost_width,
                boundary_conditions,
                SymmetricSpatialTensor2::IDENTITY,
            )?,
            EvolutionGridField3::cell_centered_with_ghosts(
                grid,
                ghost_width,
                boundary_conditions,
                SymmetricSpatialTensor2::ZERO,
            )?,
        )
    }

    pub fn cell_state(&self, index: usize) -> Result<AdmCellState, PhysicsError> {
        Ok(AdmCellState {
            lapse: *self.lapse.get_interior_index(index)?,
            shift: *self.shift.get_interior_index(index)?,
            spatial_metric: *self.spatial_metric.get_interior_index(index)?,
            extrinsic_curvature: *self.extrinsic_curvature.get_interior_index(index)?,
        })
    }

    pub fn apply_boundary_conditions(&mut self) -> Result<(), PhysicsError> {
        self.lapse.apply_boundary_conditions()?;
        self.shift.apply_boundary_conditions()?;
        self.spatial_metric.apply_boundary_conditions()?;
        self.extrinsic_curvature.apply_boundary_conditions()
    }
}

impl AdmMetricGrid for AdmGridFields {
    fn grid(&self) -> UniformGrid3 {
        self.grid
    }

    fn coordinate_time(&self) -> CoordinateTime {
        self.time
    }

    fn lapse(&self) -> &EvolutionGridField3<f64> {
        &self.lapse
    }

    fn shift(&self) -> &EvolutionGridField3<Vec3> {
        &self.shift
    }

    fn spatial_metric(&self) -> &EvolutionGridField3<SymmetricSpatialTensor2> {
        &self.spatial_metric
    }

    fn extrinsic_curvature(&self) -> &EvolutionGridField3<SymmetricSpatialTensor2> {
        &self.extrinsic_curvature
    }
}

impl MetricSolverGrid for AdmGridFields {
    fn grid(&self) -> UniformGrid3 {
        self.grid
    }

    fn coordinate_time(&self) -> CoordinateTime {
        self.time
    }

    fn lapse(&self) -> &EvolutionGridField3<f64> {
        &self.lapse
    }

    fn shift(&self) -> &EvolutionGridField3<Vec3> {
        &self.shift
    }
}

/// Snapshot of ADM fields at one grid cell.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct AdmCellState {
    pub lapse: f64,
    pub shift: Vec3,
    pub spatial_metric: SymmetricSpatialTensor2,
    pub extrinsic_curvature: SymmetricSpatialTensor2,
}

/// Evolution state for a dynamical spacetime solve.
#[derive(Debug, Clone, PartialEq)]
pub struct DynamicSpacetimeState<M, MatterState> {
    pub metric: M,
    pub matter: MatterState,
    pub time: CoordinateTime,
}

impl<M, MatterState> DynamicSpacetimeState<M, MatterState> {
    pub const fn new(metric: M, matter: MatterState, time: CoordinateTime) -> Self {
        Self {
            metric,
            matter,
            time,
        }
    }
}

/// Advances a coupled metric + matter/radiation state.
///
/// A production implementation could be ADM, BSSN, generalized harmonic,
/// characteristic evolution, or a specialized reduced model.
pub trait DynamicSpacetimeStepper<State> {
    fn step(&self, state: State, dt: TimeDuration) -> Result<State, PhysicsError>;
}
