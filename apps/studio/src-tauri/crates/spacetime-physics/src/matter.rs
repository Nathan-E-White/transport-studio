use crate::vec3;
use crate::{
    BoundaryConditions3, ContravariantTensor2, CoordinateChartKind, CoordinateTime,
    CovariantTensor2, EvolutionGridField3, MetricField, MetricSolverGrid, PhysicsError,
    SpacetimeCoordinate, StressEnergyContribution, StressEnergyTensor, UniformGrid3, Vec3,
};

/// Computes aggregate stress-energy from matter, particles, radiation, fields,
/// or coarse-grained Monte Carlo histories.
pub trait StressEnergySource<State> {
    fn stress_energy_at(&self, state: &State, x: SpacetimeCoordinate) -> StressEnergyTensor;
}

/// Equation of state closure for converting conservative variables to pressure.
pub trait EquationOfState: Copy {
    fn pressure(
        self,
        density: f64,
        momentum: Vec3,
        total_energy_density: f64,
    ) -> Result<f64, PhysicsError>;
}

/// Ideal-gas EOS using total energy minus kinetic energy as internal energy.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct IdealGasEquationOfState {
    pub gamma: f64,
}

impl IdealGasEquationOfState {
    pub const fn new(gamma: f64) -> Self {
        Self { gamma }
    }
}

impl EquationOfState for IdealGasEquationOfState {
    fn pressure(
        self,
        density: f64,
        momentum: Vec3,
        total_energy_density: f64,
    ) -> Result<f64, PhysicsError> {
        if !self.gamma.is_finite()
            || self.gamma <= 1.0
            || !density.is_finite()
            || density <= 0.0
            || !total_energy_density.is_finite()
            || !momentum.x.is_finite()
            || !momentum.y.is_finite()
            || !momentum.z.is_finite()
        {
            return Err(PhysicsError::NonFiniteValue);
        }

        let kinetic = 0.5 * momentum.norm_squared() / density;
        let internal_energy = total_energy_density - kinetic;

        if !internal_energy.is_finite() {
            return Err(PhysicsError::NonFiniteValue);
        }

        Ok((self.gamma - 1.0) * internal_energy.max(0.0))
    }
}

/// Conservative matter variables at one grid cell.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct ConservativeMatterCell {
    pub density: f64,
    pub momentum: Vec3,
    pub total_energy_density: f64,
}

impl ConservativeMatterCell {
    pub const VACUUM: Self = Self {
        density: 0.0,
        momentum: Vec3::ZERO,
        total_energy_density: 0.0,
    };

    pub const fn new(density: f64, momentum: Vec3, total_energy_density: f64) -> Self {
        Self {
            density,
            momentum,
            total_energy_density,
        }
    }

    pub fn velocity(self) -> Result<Vec3, PhysicsError> {
        if self.density <= 0.0 || !self.density.is_finite() {
            return Err(PhysicsError::NonFiniteValue);
        }

        Ok(self.momentum / self.density)
    }
}

/// Metric values interpolated/sampled onto matter cell centers.
#[derive(Debug, Clone, PartialEq)]
pub struct MatterMetricCellGrid {
    pub grid: UniformGrid3,
    pub time: CoordinateTime,
    pub covariant_metric: EvolutionGridField3<CovariantTensor2>,
    pub inverse_metric: EvolutionGridField3<ContravariantTensor2>,
    pub lapse: EvolutionGridField3<f64>,
    pub shift: EvolutionGridField3<Vec3>,
}

impl MatterMetricCellGrid {
    pub fn from_metric_field<M: MetricField>(
        metric: &M,
        grid: UniformGrid3,
        time: CoordinateTime,
        ghost_width: usize,
        boundary_conditions: BoundaryConditions3,
    ) -> Result<Self, PhysicsError> {
        let mut covariant_metric = EvolutionGridField3::cell_centered_with_ghosts(
            grid,
            ghost_width,
            boundary_conditions,
            CovariantTensor2::ZERO,
        )?;
        let mut inverse_metric = EvolutionGridField3::cell_centered_with_ghosts(
            grid,
            ghost_width,
            boundary_conditions,
            ContravariantTensor2::ZERO,
        )?;
        let mut lapse = EvolutionGridField3::cell_centered_with_ghosts(
            grid,
            ghost_width,
            boundary_conditions,
            1.0,
        )?;
        let mut shift = EvolutionGridField3::cell_centered_with_ghosts(
            grid,
            ghost_width,
            boundary_conditions,
            vec3::ZERO,
        )?;

        for index in 0..covariant_metric.interior_len() {
            let ijk = covariant_metric.interior_ijk_for_index(index)?;
            let center = grid.cell_center(ijk[0], ijk[1], ijk[2])?;
            let x = SpacetimeCoordinate::new(
                [time.seconds(), center.x, center.y, center.z],
                CoordinateChartKind::Cartesian,
            );
            let g = metric.covariant_metric_at(x);
            let inv = metric.inverse_metric_at(x);

            covariant_metric.set_interior(ijk[0], ijk[1], ijk[2], g)?;
            inverse_metric.set_interior(ijk[0], ijk[1], ijk[2], inv)?;
            lapse.set_interior(ijk[0], ijk[1], ijk[2], lapse_from_covariant_metric(g)?)?;
            shift.set_interior(ijk[0], ijk[1], ijk[2], shift_from_inverse_metric(inv)?)?;
        }

        covariant_metric.apply_boundary_conditions()?;
        inverse_metric.apply_boundary_conditions()?;
        lapse.apply_boundary_conditions()?;
        shift.apply_boundary_conditions()?;

        Ok(Self {
            grid,
            time,
            covariant_metric,
            inverse_metric,
            lapse,
            shift,
        })
    }

    pub fn from_solver_grid<G: MetricSolverGrid>(
        metric: &G,
        ghost_width: usize,
        boundary_conditions: BoundaryConditions3,
    ) -> Result<Self, PhysicsError> {
        let grid = metric.grid();
        let time = metric.coordinate_time();
        let mut covariant_metric = EvolutionGridField3::cell_centered_with_ghosts(
            grid,
            ghost_width,
            boundary_conditions,
            CovariantTensor2::ZERO,
        )?;
        let mut inverse_metric = EvolutionGridField3::cell_centered_with_ghosts(
            grid,
            ghost_width,
            boundary_conditions,
            ContravariantTensor2::ZERO,
        )?;
        let mut lapse = EvolutionGridField3::cell_centered_with_ghosts(
            grid,
            ghost_width,
            boundary_conditions,
            1.0,
        )?;
        let mut shift = EvolutionGridField3::cell_centered_with_ghosts(
            grid,
            ghost_width,
            boundary_conditions,
            vec3::ZERO,
        )?;

        for index in 0..lapse.interior_len() {
            let ijk = lapse.interior_ijk_for_index(index)?;
            let alpha = *metric.lapse().get_interior(ijk[0], ijk[1], ijk[2])?;
            let beta = *metric.shift().get_interior(ijk[0], ijk[1], ijk[2])?;

            lapse.set_interior(ijk[0], ijk[1], ijk[2], alpha)?;
            shift.set_interior(ijk[0], ijk[1], ijk[2], beta)?;
            covariant_metric.set_interior(
                ijk[0],
                ijk[1],
                ijk[2],
                adm_flat_spatial_covariant_metric(alpha, beta)?,
            )?;
            inverse_metric.set_interior(
                ijk[0],
                ijk[1],
                ijk[2],
                adm_flat_spatial_inverse_metric(alpha, beta)?,
            )?;
        }

        covariant_metric.apply_boundary_conditions()?;
        inverse_metric.apply_boundary_conditions()?;
        lapse.apply_boundary_conditions()?;
        shift.apply_boundary_conditions()?;

        Ok(Self {
            grid,
            time,
            covariant_metric,
            inverse_metric,
            lapse,
            shift,
        })
    }
}

/// Conservative matter grid with a radiation/particle stress-energy source term.
#[derive(Debug, Clone, PartialEq)]
pub struct ConservativeMatterGrid<Eos> {
    pub grid: UniformGrid3,
    pub time: CoordinateTime,
    pub density: EvolutionGridField3<f64>,
    pub momentum: EvolutionGridField3<Vec3>,
    pub total_energy_density: EvolutionGridField3<f64>,
    pub radiation_particle_stress_energy: EvolutionGridField3<StressEnergyTensor>,
    pub equation_of_state: Eos,
}

impl<Eos: EquationOfState> ConservativeMatterGrid<Eos> {
    pub fn new(
        grid: UniformGrid3,
        time: CoordinateTime,
        ghost_width: usize,
        boundary_conditions: BoundaryConditions3,
        equation_of_state: Eos,
    ) -> Result<Self, PhysicsError> {
        Ok(Self {
            grid,
            time,
            density: EvolutionGridField3::cell_centered_with_ghosts(
                grid,
                ghost_width,
                boundary_conditions,
                0.0,
            )?,
            momentum: EvolutionGridField3::cell_centered_with_ghosts(
                grid,
                ghost_width,
                boundary_conditions,
                vec3::ZERO,
            )?,
            total_energy_density: EvolutionGridField3::cell_centered_with_ghosts(
                grid,
                ghost_width,
                boundary_conditions,
                0.0,
            )?,
            radiation_particle_stress_energy: EvolutionGridField3::cell_centered_with_ghosts(
                grid,
                ghost_width,
                boundary_conditions,
                StressEnergyTensor::ZERO,
            )?,
            equation_of_state,
        })
    }

    pub fn cell_state(
        &self,
        i: usize,
        j: usize,
        k: usize,
    ) -> Result<ConservativeMatterCell, PhysicsError> {
        Ok(ConservativeMatterCell::new(
            *self.density.get_interior(i, j, k)?,
            *self.momentum.get_interior(i, j, k)?,
            *self.total_energy_density.get_interior(i, j, k)?,
        ))
    }

    pub fn set_cell_state(
        &mut self,
        i: usize,
        j: usize,
        k: usize,
        cell: ConservativeMatterCell,
    ) -> Result<(), PhysicsError> {
        self.density.set_interior(i, j, k, cell.density)?;
        self.momentum.set_interior(i, j, k, cell.momentum)?;
        self.total_energy_density
            .set_interior(i, j, k, cell.total_energy_density)
    }

    pub fn pressure_at(&self, i: usize, j: usize, k: usize) -> Result<f64, PhysicsError> {
        let cell = self.cell_state(i, j, k)?;
        self.equation_of_state
            .pressure(cell.density, cell.momentum, cell.total_energy_density)
    }

    pub fn pressure_field(&self) -> Result<EvolutionGridField3<f64>, PhysicsError> {
        let mut pressure = EvolutionGridField3::new(
            self.grid,
            self.density.centering,
            self.density.ghost_zones,
            self.density.boundary_conditions,
            0.0,
        )?;

        for index in 0..self.density.interior_len() {
            let ijk = self.density.interior_ijk_for_index(index)?;
            pressure.set_interior(
                ijk[0],
                ijk[1],
                ijk[2],
                self.pressure_at(ijk[0], ijk[1], ijk[2])?,
            )?;
        }

        pressure.apply_boundary_conditions()?;
        Ok(pressure)
    }

    pub fn matter_stress_energy_at_cell(
        &self,
        i: usize,
        j: usize,
        k: usize,
    ) -> Result<StressEnergyTensor, PhysicsError> {
        let cell = self.cell_state(i, j, k)?;
        if cell.density <= 0.0 {
            return Ok(StressEnergyTensor::ZERO);
        }

        let pressure = self.pressure_at(i, j, k)?;
        let velocity = cell.velocity()?;
        let mut components = [[0.0; 4]; 4];
        let momentum = cell.momentum.to_packed().data;
        let velocity_components = velocity.to_packed().data;

        components[0][0] = cell.total_energy_density;
        for axis in 0..3 {
            components[0][axis + 1] = momentum[axis];
            components[axis + 1][0] = momentum[axis];
        }

        for a in 0..3 {
            for b in 0..3 {
                components[a + 1][b + 1] =
                    cell.density * velocity_components[a] * velocity_components[b]
                        + if a == b { pressure } else { 0.0 };
            }
        }

        Ok(StressEnergyTensor::new(components))
    }

    pub fn total_stress_energy_at_cell(
        &self,
        i: usize,
        j: usize,
        k: usize,
    ) -> Result<StressEnergyTensor, PhysicsError> {
        let matter = self.matter_stress_energy_at_cell(i, j, k)?;
        let deposited = *self
            .radiation_particle_stress_energy
            .get_interior(i, j, k)?;
        Ok(matter + deposited)
    }

    pub fn stress_energy_field(
        &self,
    ) -> Result<EvolutionGridField3<StressEnergyTensor>, PhysicsError> {
        let mut field = EvolutionGridField3::new(
            self.grid,
            self.density.centering,
            self.density.ghost_zones,
            self.density.boundary_conditions,
            StressEnergyTensor::ZERO,
        )?;

        for index in 0..self.density.interior_len() {
            let ijk = self.density.interior_ijk_for_index(index)?;
            field.set_interior(
                ijk[0],
                ijk[1],
                ijk[2],
                self.total_stress_energy_at_cell(ijk[0], ijk[1], ijk[2])?,
            )?;
        }

        field.apply_boundary_conditions()?;
        Ok(field)
    }

    pub fn deposit_stress_energy_nearest(
        &mut self,
        contribution: StressEnergyContribution,
    ) -> Result<usize, PhysicsError> {
        let index = self.grid.nearest_cell_index(contribution.position)?;
        let ijk = self.grid.ijk_for_index(index)?;
        let tensor = contribution.tensor_density(self.grid.cell_volume())?;
        let current = *self
            .radiation_particle_stress_energy
            .get_interior(ijk[0], ijk[1], ijk[2])?;

        self.radiation_particle_stress_energy.set_interior(
            ijk[0],
            ijk[1],
            ijk[2],
            current + tensor,
        )?;

        Ok(index)
    }

    pub fn apply_boundary_conditions(&mut self) -> Result<(), PhysicsError> {
        self.density.apply_boundary_conditions()?;
        self.momentum.apply_boundary_conditions()?;
        self.total_energy_density.apply_boundary_conditions()?;
        self.radiation_particle_stress_energy
            .apply_boundary_conditions()
    }
}

impl<Eos: EquationOfState> StressEnergySource<SpacetimeCoordinate> for ConservativeMatterGrid<Eos> {
    fn stress_energy_at(
        &self,
        _state: &SpacetimeCoordinate,
        x: SpacetimeCoordinate,
    ) -> StressEnergyTensor {
        let Ok(index) = self.grid.nearest_cell_index(x) else {
            return StressEnergyTensor::ZERO;
        };
        let Ok(ijk) = self.grid.ijk_for_index(index) else {
            return StressEnergyTensor::ZERO;
        };

        self.total_stress_energy_at_cell(ijk[0], ijk[1], ijk[2])
            .unwrap_or(StressEnergyTensor::ZERO)
    }
}

fn lapse_from_covariant_metric(metric: CovariantTensor2) -> Result<f64, PhysicsError> {
    let g00 = metric.components[0][0];
    if !g00.is_finite() || g00 <= 0.0 {
        return Err(PhysicsError::SingularMetric);
    }

    Ok(g00.sqrt())
}

fn shift_from_inverse_metric(metric: ContravariantTensor2) -> Result<Vec3, PhysicsError> {
    let g00 = metric.components[0][0];
    if !g00.is_finite() || g00 == 0.0 {
        return Err(PhysicsError::SingularMetric);
    }

    Ok(vec3::new(
        metric.components[0][1] / g00,
        metric.components[0][2] / g00,
        metric.components[0][3] / g00,
    ))
}

fn adm_flat_spatial_covariant_metric(
    alpha: f64,
    beta: Vec3,
) -> Result<CovariantTensor2, PhysicsError> {
    if !alpha.is_finite() || alpha <= 0.0 {
        return Err(PhysicsError::SingularMetric);
    }

    let beta2 = beta.norm_squared();
    Ok(CovariantTensor2::new([
        [alpha * alpha - beta2, -beta.x, -beta.y, -beta.z],
        [-beta.x, -1.0, 0.0, 0.0],
        [-beta.y, 0.0, -1.0, 0.0],
        [-beta.z, 0.0, 0.0, -1.0],
    ]))
}

fn adm_flat_spatial_inverse_metric(
    alpha: f64,
    beta: Vec3,
) -> Result<ContravariantTensor2, PhysicsError> {
    if !alpha.is_finite() || alpha <= 0.0 {
        return Err(PhysicsError::SingularMetric);
    }

    let alpha2 = alpha * alpha;
    Ok(ContravariantTensor2::new([
        [
            1.0 / alpha2,
            -beta.x / alpha2,
            -beta.y / alpha2,
            -beta.z / alpha2,
        ],
        [
            -beta.x / alpha2,
            -1.0 + beta.x * beta.x / alpha2,
            beta.x * beta.y / alpha2,
            beta.x * beta.z / alpha2,
        ],
        [
            -beta.y / alpha2,
            beta.y * beta.x / alpha2,
            -1.0 + beta.y * beta.y / alpha2,
            beta.y * beta.z / alpha2,
        ],
        [
            -beta.z / alpha2,
            beta.z * beta.x / alpha2,
            beta.z * beta.y / alpha2,
            -1.0 + beta.z * beta.z / alpha2,
        ],
    ]))
}
