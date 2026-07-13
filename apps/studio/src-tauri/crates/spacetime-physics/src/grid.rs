//! Grid-backed transport and deposition helpers.

use ndarray::{ArrayView3, ArrayViewMut3, ShapeBuilder};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

use crate::vec3::{self, Vec3};
use crate::{FourVec, PhysicsError, SpacetimeCoordinate, StressEnergySource, StressEnergyTensor};

/// Uniform Cartesian grid used for early transport deposition and diagnostics.
#[derive(Debug, Copy, Clone, PartialEq, Serialize, Deserialize)]
pub struct UniformGrid3 {
    pub origin: Vec3,
    pub spacing: Vec3,
    pub dimensions: [usize; 3],
}

impl UniformGrid3 {
    pub const fn new(origin: Vec3, spacing: Vec3, dimensions: [usize; 3]) -> Self {
        Self {
            origin,
            spacing,
            dimensions,
        }
    }

    pub fn cell_count(self) -> Result<usize, PhysicsError> {
        if self.spacing.x <= 0.0
            || self.spacing.y <= 0.0
            || self.spacing.z <= 0.0
            || self.dimensions[0] == 0
            || self.dimensions[1] == 0
            || self.dimensions[2] == 0
        {
            return Err(PhysicsError::InvalidGrid);
        }

        self.dimensions[0]
            .checked_mul(self.dimensions[1])
            .and_then(|xy| xy.checked_mul(self.dimensions[2]))
            .ok_or(PhysicsError::InvalidGrid)
    }

    pub fn cell_volume(self) -> f64 {
        self.spacing.x * self.spacing.y * self.spacing.z
    }

    pub fn linear_index(self, i: usize, j: usize, k: usize) -> Result<usize, PhysicsError> {
        self.cell_count()?;

        if i >= self.dimensions[0] || j >= self.dimensions[1] || k >= self.dimensions[2] {
            return Err(PhysicsError::PointOutsideGrid);
        }

        Ok((k * self.dimensions[1] + j) * self.dimensions[0] + i)
    }

    pub fn ijk_for_index(self, index: usize) -> Result<[usize; 3], PhysicsError> {
        let cell_count = self.cell_count()?;

        if index >= cell_count {
            return Err(PhysicsError::PointOutsideGrid);
        }

        let nx = self.dimensions[0];
        let ny = self.dimensions[1];
        let i = index % nx;
        let j = (index / nx) % ny;
        let k = index / (nx * ny);

        Ok([i, j, k])
    }

    pub fn cell_center(self, i: usize, j: usize, k: usize) -> Result<Vec3, PhysicsError> {
        self.linear_index(i, j, k)?;

        Ok(vec3::new(
            self.origin.x + (i as f64 + 0.5) * self.spacing.x,
            self.origin.y + (j as f64 + 0.5) * self.spacing.y,
            self.origin.z + (k as f64 + 0.5) * self.spacing.z,
        ))
    }

    pub fn nearest_cell_index(self, x: SpacetimeCoordinate) -> Result<usize, PhysicsError> {
        self.index_for_position(vec3::new(x.components[1], x.components[2], x.components[3]))
    }

    pub fn index_for_position(self, position: Vec3) -> Result<usize, PhysicsError> {
        self.cell_count()?;

        let local = vec3::new(
            (position.x - self.origin.x) / self.spacing.x,
            (position.y - self.origin.y) / self.spacing.y,
            (position.z - self.origin.z) / self.spacing.z,
        );

        if !local.x.is_finite() || !local.y.is_finite() || !local.z.is_finite() {
            return Err(PhysicsError::NonFiniteValue);
        }

        let i = local.x.floor() as isize;
        let j = local.y.floor() as isize;
        let k = local.z.floor() as isize;

        if i < 0
            || j < 0
            || k < 0
            || i as usize >= self.dimensions[0]
            || j as usize >= self.dimensions[1]
            || k as usize >= self.dimensions[2]
        {
            return Err(PhysicsError::PointOutsideGrid);
        }

        Ok((k as usize * self.dimensions[1] + j as usize) * self.dimensions[0] + i as usize)
    }
}

/// Dense cell-centered scalar/vector/tensor field over a uniform Cartesian grid.
#[derive(Debug, Clone, PartialEq)]
pub struct GridField3<T> {
    pub grid: UniformGrid3,
    pub values: Vec<T>,
}

impl<T: Clone> GridField3<T> {
    pub fn new(grid: UniformGrid3, value: T) -> Result<Self, PhysicsError> {
        let cell_count = grid.cell_count()?;

        Ok(Self {
            grid,
            values: vec![value; cell_count],
        })
    }

    pub fn from_fn<F>(grid: UniformGrid3, mut value_at: F) -> Result<Self, PhysicsError>
    where
        F: FnMut([usize; 3], Vec3) -> T,
    {
        let cell_count = grid.cell_count()?;
        let mut values = Vec::with_capacity(cell_count);

        for index in 0..cell_count {
            let ijk = grid.ijk_for_index(index)?;
            let center = grid.cell_center(ijk[0], ijk[1], ijk[2])?;
            values.push(value_at(ijk, center));
        }

        Ok(Self { grid, values })
    }

    pub fn fill(&mut self, value: T) {
        self.values.fill(value);
    }

    pub fn par_fill(&mut self, value: T)
    where
        T: Send + Sync,
    {
        self.values
            .par_iter_mut()
            .for_each(|slot| *slot = value.clone());
    }
}

impl<T> GridField3<T> {
    pub fn len(&self) -> usize {
        self.values.len()
    }

    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

    pub fn same_grid<U>(&self, other: &GridField3<U>) -> bool {
        self.grid == other.grid
    }

    pub fn get_index(&self, index: usize) -> Result<&T, PhysicsError> {
        self.values.get(index).ok_or(PhysicsError::PointOutsideGrid)
    }

    pub fn get_index_mut(&mut self, index: usize) -> Result<&mut T, PhysicsError> {
        self.values
            .get_mut(index)
            .ok_or(PhysicsError::PointOutsideGrid)
    }

    pub fn get(&self, i: usize, j: usize, k: usize) -> Result<&T, PhysicsError> {
        let index = self.grid.linear_index(i, j, k)?;
        self.get_index(index)
    }

    pub fn get_mut(&mut self, i: usize, j: usize, k: usize) -> Result<&mut T, PhysicsError> {
        let index = self.grid.linear_index(i, j, k)?;
        self.get_index_mut(index)
    }

    pub fn set(&mut self, i: usize, j: usize, k: usize, value: T) -> Result<(), PhysicsError> {
        *self.get_mut(i, j, k)? = value;
        Ok(())
    }

    pub fn as_array_view(&self) -> Result<ArrayView3<'_, T>, PhysicsError> {
        let shape = (
            self.grid.dimensions[2],
            self.grid.dimensions[1],
            self.grid.dimensions[0],
        )
            .strides((
                self.grid.dimensions[1] * self.grid.dimensions[0],
                self.grid.dimensions[0],
                1,
            ));

        ArrayView3::from_shape(shape, &self.values).map_err(|_| PhysicsError::InvalidGrid)
    }

    pub fn as_array_view_mut(&mut self) -> Result<ArrayViewMut3<'_, T>, PhysicsError> {
        let shape = (
            self.grid.dimensions[2],
            self.grid.dimensions[1],
            self.grid.dimensions[0],
        )
            .strides((
                self.grid.dimensions[1] * self.grid.dimensions[0],
                self.grid.dimensions[0],
                1,
            ));

        ArrayViewMut3::from_shape(shape, &mut self.values).map_err(|_| PhysicsError::InvalidGrid)
    }

    pub fn par_values_mut(&mut self) -> rayon::slice::IterMut<'_, T>
    where
        T: Send,
    {
        self.values.par_iter_mut()
    }
}

/// Location of stored degrees of freedom relative to the mesh.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum FieldCentering {
    Cell,
    Vertex,
}

/// Boundary condition tag used when filling ghost zones.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BoundaryCondition {
    Outflow,
    Periodic,
    Reflecting,
}

/// Coordinate axis used by finite-difference and boundary operators.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum GridAxis {
    X,
    Y,
    Z,
}

impl GridAxis {
    pub const fn as_usize(self) -> usize {
        match self {
            Self::X => 0,
            Self::Y => 1,
            Self::Z => 2,
        }
    }
}

/// One lower/upper grid face.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BoundarySide {
    Lower,
    Upper,
}

/// Explicit identifier for one boundary face.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct BoundaryFace {
    pub axis: GridAxis,
    pub side: BoundarySide,
}

impl BoundaryFace {
    pub const fn lower(axis: GridAxis) -> Self {
        Self {
            axis,
            side: BoundarySide::Lower,
        }
    }

    pub const fn upper(axis: GridAxis) -> Self {
        Self {
            axis,
            side: BoundarySide::Upper,
        }
    }
}

/// Per-face boundary conditions for a 3D field.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct BoundaryConditions3 {
    pub lower: [BoundaryCondition; 3],
    pub upper: [BoundaryCondition; 3],
}

impl BoundaryConditions3 {
    pub const OUTFLOW: Self = Self {
        lower: [BoundaryCondition::Outflow; 3],
        upper: [BoundaryCondition::Outflow; 3],
    };

    pub const PERIODIC: Self = Self {
        lower: [BoundaryCondition::Periodic; 3],
        upper: [BoundaryCondition::Periodic; 3],
    };

    pub const REFLECTING: Self = Self {
        lower: [BoundaryCondition::Reflecting; 3],
        upper: [BoundaryCondition::Reflecting; 3],
    };

    pub const fn get(self, face: BoundaryFace) -> BoundaryCondition {
        let axis = face.axis.as_usize();

        match face.side {
            BoundarySide::Lower => self.lower[axis],
            BoundarySide::Upper => self.upper[axis],
        }
    }

    pub fn set(&mut self, face: BoundaryFace, condition: BoundaryCondition) {
        let axis = face.axis.as_usize();

        match face.side {
            BoundarySide::Lower => self.lower[axis] = condition,
            BoundarySide::Upper => self.upper[axis] = condition,
        }
    }

    pub const fn with_face(mut self, face: BoundaryFace, condition: BoundaryCondition) -> Self {
        let axis = face.axis.as_usize();

        match face.side {
            BoundarySide::Lower => self.lower[axis] = condition,
            BoundarySide::Upper => self.upper[axis] = condition,
        }

        self
    }
}

/// Number of ghost points on each lower/upper face.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct GhostZones {
    pub lower: [usize; 3],
    pub upper: [usize; 3],
}

impl GhostZones {
    pub const NONE: Self = Self {
        lower: [0; 3],
        upper: [0; 3],
    };

    pub const fn symmetric(width: usize) -> Self {
        Self {
            lower: [width; 3],
            upper: [width; 3],
        }
    }
}

/// Dense evolution field with cell/vertex centering, ghost zones, and boundary metadata.
#[derive(Debug, Clone, PartialEq)]
pub struct EvolutionGridField3<T> {
    pub grid: UniformGrid3,
    pub centering: FieldCentering,
    pub ghost_zones: GhostZones,
    pub boundary_conditions: BoundaryConditions3,
    pub interior_dimensions: [usize; 3],
    pub storage_dimensions: [usize; 3],
    pub values: Vec<T>,
}

impl<T: Clone> EvolutionGridField3<T> {
    pub fn new(
        grid: UniformGrid3,
        centering: FieldCentering,
        ghost_zones: GhostZones,
        boundary_conditions: BoundaryConditions3,
        value: T,
    ) -> Result<Self, PhysicsError> {
        grid.cell_count()?;

        let interior_dimensions = match centering {
            FieldCentering::Cell => grid.dimensions,
            FieldCentering::Vertex => [
                grid.dimensions[0] + 1,
                grid.dimensions[1] + 1,
                grid.dimensions[2] + 1,
            ],
        };
        let storage_dimensions = [
            interior_dimensions[0] + ghost_zones.lower[0] + ghost_zones.upper[0],
            interior_dimensions[1] + ghost_zones.lower[1] + ghost_zones.upper[1],
            interior_dimensions[2] + ghost_zones.lower[2] + ghost_zones.upper[2],
        ];
        let storage_len = storage_dimensions[0]
            .checked_mul(storage_dimensions[1])
            .and_then(|xy| xy.checked_mul(storage_dimensions[2]))
            .ok_or(PhysicsError::InvalidGrid)?;

        Ok(Self {
            grid,
            centering,
            ghost_zones,
            boundary_conditions,
            interior_dimensions,
            storage_dimensions,
            values: vec![value; storage_len],
        })
    }

    pub fn cell_centered_with_ghosts(
        grid: UniformGrid3,
        ghost_width: usize,
        boundary_conditions: BoundaryConditions3,
        value: T,
    ) -> Result<Self, PhysicsError> {
        Self::new(
            grid,
            FieldCentering::Cell,
            GhostZones::symmetric(ghost_width),
            boundary_conditions,
            value,
        )
    }

    pub fn fill(&mut self, value: T) {
        self.values.fill(value);
    }

    pub fn par_fill(&mut self, value: T)
    where
        T: Send + Sync,
    {
        self.values
            .par_iter_mut()
            .for_each(|slot| *slot = value.clone());
    }
}

impl<T> EvolutionGridField3<T> {
    pub fn len(&self) -> usize {
        self.values.len()
    }

    pub fn interior_len(&self) -> usize {
        self.interior_dimensions[0] * self.interior_dimensions[1] * self.interior_dimensions[2]
    }

    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

    pub fn same_layout<U>(&self, other: &EvolutionGridField3<U>) -> bool {
        self.grid == other.grid
            && self.centering == other.centering
            && self.ghost_zones == other.ghost_zones
            && self.interior_dimensions == other.interior_dimensions
            && self.storage_dimensions == other.storage_dimensions
    }

    pub fn storage_linear_index(
        &self,
        i: usize,
        j: usize,
        k: usize,
    ) -> Result<usize, PhysicsError> {
        if i >= self.storage_dimensions[0]
            || j >= self.storage_dimensions[1]
            || k >= self.storage_dimensions[2]
        {
            return Err(PhysicsError::PointOutsideGrid);
        }

        Ok((k * self.storage_dimensions[1] + j) * self.storage_dimensions[0] + i)
    }

    pub fn interior_linear_index(
        &self,
        i: usize,
        j: usize,
        k: usize,
    ) -> Result<usize, PhysicsError> {
        if i >= self.interior_dimensions[0]
            || j >= self.interior_dimensions[1]
            || k >= self.interior_dimensions[2]
        {
            return Err(PhysicsError::PointOutsideGrid);
        }

        self.storage_linear_index(
            i + self.ghost_zones.lower[0],
            j + self.ghost_zones.lower[1],
            k + self.ghost_zones.lower[2],
        )
    }

    pub fn get_interior(&self, i: usize, j: usize, k: usize) -> Result<&T, PhysicsError> {
        let index = self.interior_linear_index(i, j, k)?;
        self.values.get(index).ok_or(PhysicsError::PointOutsideGrid)
    }

    pub fn get_interior_mut(
        &mut self,
        i: usize,
        j: usize,
        k: usize,
    ) -> Result<&mut T, PhysicsError> {
        let index = self.interior_linear_index(i, j, k)?;
        self.values
            .get_mut(index)
            .ok_or(PhysicsError::PointOutsideGrid)
    }

    pub fn set_interior(
        &mut self,
        i: usize,
        j: usize,
        k: usize,
        value: T,
    ) -> Result<(), PhysicsError> {
        *self.get_interior_mut(i, j, k)? = value;
        Ok(())
    }

    pub fn get_interior_index(&self, index: usize) -> Result<&T, PhysicsError> {
        if index >= self.interior_len() {
            return Err(PhysicsError::PointOutsideGrid);
        }

        let nx = self.interior_dimensions[0];
        let ny = self.interior_dimensions[1];
        let i = index % nx;
        let j = (index / nx) % ny;
        let k = index / (nx * ny);

        self.get_interior(i, j, k)
    }

    pub fn get_storage(&self, i: usize, j: usize, k: usize) -> Result<&T, PhysicsError> {
        let index = self.storage_linear_index(i, j, k)?;
        self.values.get(index).ok_or(PhysicsError::PointOutsideGrid)
    }

    pub fn storage_index_for_interior_ijk(
        &self,
        interior_ijk: [usize; 3],
    ) -> Result<usize, PhysicsError> {
        self.interior_linear_index(interior_ijk[0], interior_ijk[1], interior_ijk[2])
    }

    pub fn interior_ijk_for_index(&self, index: usize) -> Result<[usize; 3], PhysicsError> {
        if index >= self.interior_len() {
            return Err(PhysicsError::PointOutsideGrid);
        }

        let nx = self.interior_dimensions[0];
        let ny = self.interior_dimensions[1];

        Ok([index % nx, (index / nx) % ny, index / (nx * ny)])
    }

    pub fn storage_ijk_for_interior_ijk(
        &self,
        interior_ijk: [usize; 3],
    ) -> Result<[usize; 3], PhysicsError> {
        if interior_ijk[0] >= self.interior_dimensions[0]
            || interior_ijk[1] >= self.interior_dimensions[1]
            || interior_ijk[2] >= self.interior_dimensions[2]
        {
            return Err(PhysicsError::PointOutsideGrid);
        }

        Ok([
            interior_ijk[0] + self.ghost_zones.lower[0],
            interior_ijk[1] + self.ghost_zones.lower[1],
            interior_ijk[2] + self.ghost_zones.lower[2],
        ])
    }

    pub fn as_storage_array_view(&self) -> Result<ArrayView3<'_, T>, PhysicsError> {
        let shape = (
            self.storage_dimensions[2],
            self.storage_dimensions[1],
            self.storage_dimensions[0],
        )
            .strides((
                self.storage_dimensions[1] * self.storage_dimensions[0],
                self.storage_dimensions[0],
                1,
            ));

        ArrayView3::from_shape(shape, &self.values).map_err(|_| PhysicsError::InvalidGrid)
    }

    pub fn as_storage_array_view_mut(&mut self) -> Result<ArrayViewMut3<'_, T>, PhysicsError> {
        let shape = (
            self.storage_dimensions[2],
            self.storage_dimensions[1],
            self.storage_dimensions[0],
        )
            .strides((
                self.storage_dimensions[1] * self.storage_dimensions[0],
                self.storage_dimensions[0],
                1,
            ));

        ArrayViewMut3::from_shape(shape, &mut self.values).map_err(|_| PhysicsError::InvalidGrid)
    }

    pub fn par_values_mut(&mut self) -> rayon::slice::IterMut<'_, T>
    where
        T: Send,
    {
        self.values.par_iter_mut()
    }
}

impl<T: Copy> EvolutionGridField3<T> {
    pub fn apply_boundary_conditions(&mut self) -> Result<(), PhysicsError> {
        let snapshot = self.values.clone();

        for k in 0..self.storage_dimensions[2] {
            for j in 0..self.storage_dimensions[1] {
                for i in 0..self.storage_dimensions[0] {
                    let Some(source) = self.boundary_source_index([i, j, k])? else {
                        continue;
                    };
                    let target_index = self.storage_linear_index(i, j, k)?;
                    let source_index =
                        self.storage_linear_index(source[0], source[1], source[2])?;
                    self.values[target_index] = snapshot[source_index];
                }
            }
        }

        Ok(())
    }

    fn boundary_source_index(
        &self,
        storage_ijk: [usize; 3],
    ) -> Result<Option<[usize; 3]>, PhysicsError> {
        let mut source = storage_ijk;
        let mut is_ghost = false;

        for axis in 0..3 {
            let lower = self.ghost_zones.lower[axis];
            let interior = self.interior_dimensions[axis];
            let upper_start = lower + interior;

            if storage_ijk[axis] < lower {
                is_ghost = true;
                let distance = lower - storage_ijk[axis];
                source[axis] = match self.boundary_conditions.lower[axis] {
                    BoundaryCondition::Outflow | BoundaryCondition::Reflecting => lower,
                    BoundaryCondition::Periodic => {
                        lower + ((interior - distance % interior) % interior)
                    }
                };
            } else if storage_ijk[axis] >= upper_start {
                is_ghost = true;
                let distance = storage_ijk[axis] - upper_start;
                source[axis] = match self.boundary_conditions.upper[axis] {
                    BoundaryCondition::Outflow | BoundaryCondition::Reflecting => upper_start - 1,
                    BoundaryCondition::Periodic => lower + (distance % interior),
                };
            }
        }

        Ok(is_ghost.then_some(source))
    }
}

/// Stress-energy contribution deposited by a Monte Carlo history segment/event.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct StressEnergyContribution {
    pub position: SpacetimeCoordinate,
    pub four_momentum: FourVec,
    pub weight: f64,
}

impl StressEnergyContribution {
    pub const fn new(position: SpacetimeCoordinate, four_momentum: FourVec, weight: f64) -> Self {
        Self {
            position,
            four_momentum,
            weight,
        }
    }

    pub fn tensor_density(self, cell_volume: f64) -> Result<StressEnergyTensor, PhysicsError> {
        if !self.weight.is_finite() {
            return Err(PhysicsError::NonFiniteValue);
        }
        if !cell_volume.is_finite() {
            return Err(PhysicsError::NonFiniteValue);
        }
        if cell_volume <= 0.0 {
            return Err(PhysicsError::NonFiniteValue);
        }

        let p = self.four_momentum.components();
        let mut components = [[0.0; 4]; 4];

        for mu in 0..4 {
            for nu in 0..4 {
                let component = self.weight * p[mu] * p[nu] / cell_volume;
                if !component.is_finite() {
                    return Err(PhysicsError::NonFiniteValue);
                }
                components[mu][nu] = component;
            }
        }

        Ok(StressEnergyTensor::new(components))
    }
}

/// Deterministic nearest-cell stress-energy accumulator for MC backreaction.
#[derive(Debug, Clone, PartialEq)]
pub struct StressEnergyGrid {
    pub grid: UniformGrid3,
    pub cells: Vec<StressEnergyTensor>,
}

impl StressEnergyGrid {
    pub fn new(grid: UniformGrid3) -> Result<Self, PhysicsError> {
        let cell_count = grid.cell_count()?;

        Ok(Self {
            grid,
            cells: vec![StressEnergyTensor::ZERO; cell_count],
        })
    }

    pub fn deposit_nearest(
        &mut self,
        contribution: StressEnergyContribution,
    ) -> Result<usize, PhysicsError> {
        let index = self.grid.nearest_cell_index(contribution.position)?;
        let tensor = contribution.tensor_density(self.grid.cell_volume())?;

        self.cells[index] += tensor;

        Ok(index)
    }

    pub fn total_stress_energy(&self) -> StressEnergyTensor {
        let mut total = StressEnergyTensor::ZERO;

        for cell in &self.cells {
            for mu in 0..4 {
                for nu in 0..4 {
                    total.components[mu][nu] += cell.components[mu][nu] * self.grid.cell_volume();
                }
            }
        }

        total
    }
}

impl StressEnergySource<SpacetimeCoordinate> for StressEnergyGrid {
    fn stress_energy_at(
        &self,
        _state: &SpacetimeCoordinate,
        x: SpacetimeCoordinate,
    ) -> StressEnergyTensor {
        match self.grid.nearest_cell_index(x) {
            Ok(index) => self.cells[index],
            Err(_) => StressEnergyTensor::ZERO,
        }
    }
}
