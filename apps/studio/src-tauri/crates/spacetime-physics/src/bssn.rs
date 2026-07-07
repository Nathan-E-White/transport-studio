//! BSSN formulation grid state.
//!
//! This module owns the BSSN variables and storage layout. Evolution equations
//! and constraint operators can build on these types without depending on
//! point-query metric callbacks.

use crate::vec3;
use crate::{
    BoundaryConditions3, CoordinateTime, EvolutionGridField3, MetricSolverGrid, PhysicsError,
    SymmetricSpatialTensor2, UniformGrid3, Vec3,
};

/// Grid-backed BSSN variables.
pub trait BssnMetricGrid {
    fn grid(&self) -> UniformGrid3;

    fn coordinate_time(&self) -> CoordinateTime;

    fn lapse(&self) -> &EvolutionGridField3<f64>;

    fn shift(&self) -> &EvolutionGridField3<Vec3>;

    fn conformal_metric(&self) -> &EvolutionGridField3<SymmetricSpatialTensor2>;

    fn conformal_factor(&self) -> &EvolutionGridField3<f64>;

    fn trace_extrinsic_curvature(&self) -> &EvolutionGridField3<f64>;

    fn trace_free_curvature(&self) -> &EvolutionGridField3<SymmetricSpatialTensor2>;

    fn connection_functions(&self) -> &EvolutionGridField3<Vec3>;
}

/// Cell-centered BSSN state: alpha, beta^i, conformal gamma_ij, phi, K, A_ij, and Gamma^i.
#[derive(Debug, Clone, PartialEq)]
pub struct BssnGridFields {
    pub grid: UniformGrid3,
    pub time: CoordinateTime,
    pub lapse: EvolutionGridField3<f64>,
    pub shift: EvolutionGridField3<Vec3>,
    pub conformal_metric: EvolutionGridField3<SymmetricSpatialTensor2>,
    pub conformal_factor: EvolutionGridField3<f64>,
    pub trace_extrinsic_curvature: EvolutionGridField3<f64>,
    pub trace_free_curvature: EvolutionGridField3<SymmetricSpatialTensor2>,
    pub connection_functions: EvolutionGridField3<Vec3>,
}

impl BssnGridFields {
    pub fn new(
        grid: UniformGrid3,
        time: CoordinateTime,
        lapse: EvolutionGridField3<f64>,
        shift: EvolutionGridField3<Vec3>,
        conformal_metric: EvolutionGridField3<SymmetricSpatialTensor2>,
        conformal_factor: EvolutionGridField3<f64>,
        trace_extrinsic_curvature: EvolutionGridField3<f64>,
        trace_free_curvature: EvolutionGridField3<SymmetricSpatialTensor2>,
        connection_functions: EvolutionGridField3<Vec3>,
    ) -> Result<Self, PhysicsError> {
        if lapse.grid != grid
            || shift.grid != grid
            || conformal_metric.grid != grid
            || conformal_factor.grid != grid
            || trace_extrinsic_curvature.grid != grid
            || trace_free_curvature.grid != grid
            || connection_functions.grid != grid
            || !lapse.same_layout(&shift)
            || !lapse.same_layout(&conformal_metric)
            || !lapse.same_layout(&conformal_factor)
            || !lapse.same_layout(&trace_extrinsic_curvature)
            || !lapse.same_layout(&trace_free_curvature)
            || !lapse.same_layout(&connection_functions)
        {
            return Err(PhysicsError::InvalidGrid);
        }

        Ok(Self {
            grid,
            time,
            lapse,
            shift,
            conformal_metric,
            conformal_factor,
            trace_extrinsic_curvature,
            trace_free_curvature,
            connection_functions,
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
                0.0,
            )?,
            EvolutionGridField3::cell_centered_with_ghosts(
                grid,
                ghost_width,
                boundary_conditions,
                0.0,
            )?,
            EvolutionGridField3::cell_centered_with_ghosts(
                grid,
                ghost_width,
                boundary_conditions,
                SymmetricSpatialTensor2::ZERO,
            )?,
            EvolutionGridField3::cell_centered_with_ghosts(
                grid,
                ghost_width,
                boundary_conditions,
                vec3::ZERO,
            )?,
        )
    }

    pub fn cell_state(&self, index: usize) -> Result<BssnCellState, PhysicsError> {
        Ok(BssnCellState {
            lapse: *self.lapse.get_interior_index(index)?,
            shift: *self.shift.get_interior_index(index)?,
            conformal_metric: *self.conformal_metric.get_interior_index(index)?,
            conformal_factor: *self.conformal_factor.get_interior_index(index)?,
            trace_extrinsic_curvature: *self.trace_extrinsic_curvature.get_interior_index(index)?,
            trace_free_curvature: *self.trace_free_curvature.get_interior_index(index)?,
            connection_functions: *self.connection_functions.get_interior_index(index)?,
        })
    }

    pub fn apply_boundary_conditions(&mut self) -> Result<(), PhysicsError> {
        self.lapse.apply_boundary_conditions()?;
        self.shift.apply_boundary_conditions()?;
        self.conformal_metric.apply_boundary_conditions()?;
        self.conformal_factor.apply_boundary_conditions()?;
        self.trace_extrinsic_curvature.apply_boundary_conditions()?;
        self.trace_free_curvature.apply_boundary_conditions()?;
        self.connection_functions.apply_boundary_conditions()
    }
}

impl BssnMetricGrid for BssnGridFields {
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

    fn conformal_metric(&self) -> &EvolutionGridField3<SymmetricSpatialTensor2> {
        &self.conformal_metric
    }

    fn conformal_factor(&self) -> &EvolutionGridField3<f64> {
        &self.conformal_factor
    }

    fn trace_extrinsic_curvature(&self) -> &EvolutionGridField3<f64> {
        &self.trace_extrinsic_curvature
    }

    fn trace_free_curvature(&self) -> &EvolutionGridField3<SymmetricSpatialTensor2> {
        &self.trace_free_curvature
    }

    fn connection_functions(&self) -> &EvolutionGridField3<Vec3> {
        &self.connection_functions
    }
}

impl MetricSolverGrid for BssnGridFields {
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

/// Snapshot of BSSN fields at one grid cell.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct BssnCellState {
    pub lapse: f64,
    pub shift: Vec3,
    pub conformal_metric: SymmetricSpatialTensor2,
    pub conformal_factor: f64,
    pub trace_extrinsic_curvature: f64,
    pub trace_free_curvature: SymmetricSpatialTensor2,
    pub connection_functions: Vec3,
}
