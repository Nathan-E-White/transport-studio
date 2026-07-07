//! Discrete curvature operators over grid-backed spatial metrics.

use crate::{
    EvolutionGridField3, FiniteDifferenceOperator, FiniteDifferenceOrder, PhysicsError,
    SpatialTensor2, SymmetricSpatialTensor2, UniformGrid3,
};

/// Grid fields for the intrinsic curvature of a spatial slice.
#[derive(Debug, Clone, PartialEq)]
pub struct SpatialCurvatureGrid {
    pub ricci_tensor: EvolutionGridField3<SpatialTensor2>,
    pub ricci_scalar: EvolutionGridField3<f64>,
    pub einstein_tensor: EvolutionGridField3<SpatialTensor2>,
}

/// Discrete curvature operator over grid-backed spatial metric fields.
pub trait CurvatureOperator {
    fn ricci_tensor_grid(
        &self,
        metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
    ) -> Result<EvolutionGridField3<SpatialTensor2>, PhysicsError>;

    fn ricci_scalar_grid(
        &self,
        metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
    ) -> Result<EvolutionGridField3<f64>, PhysicsError>;

    fn einstein_tensor_grid(
        &self,
        metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
    ) -> Result<EvolutionGridField3<SpatialTensor2>, PhysicsError>;

    fn curvature_grid(
        &self,
        metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
    ) -> Result<SpatialCurvatureGrid, PhysicsError> {
        let ricci_tensor = self.ricci_tensor_grid(metric)?;
        let ricci_scalar = self.ricci_scalar_grid(metric)?;
        let einstein_tensor = self.einstein_tensor_grid(metric)?;

        Ok(SpatialCurvatureGrid {
            ricci_tensor,
            ricci_scalar,
            einstein_tensor,
        })
    }
}

/// Centered finite-difference curvature operator for 3+1 spatial slices.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct FiniteDifferenceCurvatureOperator {
    pub derivative: FiniteDifferenceOperator,
}

impl FiniteDifferenceCurvatureOperator {
    pub const SECOND_ORDER: Self = Self {
        derivative: FiniteDifferenceOperator::SECOND_ORDER,
    };

    pub const fn new(derivative: FiniteDifferenceOperator) -> Self {
        Self { derivative }
    }

    pub fn ricci_tensor_at(
        self,
        metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
        interior_ijk: [usize; 3],
    ) -> Result<SpatialTensor2, PhysicsError> {
        validate_curvature_stencil(metric, self.derivative.order)?;
        let storage = metric.storage_ijk_for_interior_ijk(interior_ijk)?;
        ricci_tensor_at_storage(metric, storage, self.derivative)
    }

    pub fn ricci_scalar_at(
        self,
        metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
        interior_ijk: [usize; 3],
    ) -> Result<f64, PhysicsError> {
        validate_curvature_stencil(metric, self.derivative.order)?;
        let storage = metric.storage_ijk_for_interior_ijk(interior_ijk)?;
        ricci_scalar_at_storage(metric, storage, self.derivative)
    }

    pub fn einstein_tensor_at(
        self,
        metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
        interior_ijk: [usize; 3],
    ) -> Result<SpatialTensor2, PhysicsError> {
        validate_curvature_stencil(metric, self.derivative.order)?;
        let storage = metric.storage_ijk_for_interior_ijk(interior_ijk)?;
        einstein_tensor_at_storage(metric, storage, self.derivative)
    }
}

impl CurvatureOperator for FiniteDifferenceCurvatureOperator {
    fn ricci_tensor_grid(
        &self,
        metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
    ) -> Result<EvolutionGridField3<SpatialTensor2>, PhysicsError> {
        validate_curvature_stencil(metric, self.derivative.order)?;

        let mut ricci = tensor_like(metric, SpatialTensor2::ZERO)?;
        for index in 0..metric.interior_len() {
            let ijk = metric.interior_ijk_for_index(index)?;
            let storage = metric.storage_ijk_for_interior_ijk(ijk)?;
            ricci.set_interior(
                ijk[0],
                ijk[1],
                ijk[2],
                ricci_tensor_at_storage(metric, storage, self.derivative)?,
            )?;
        }

        Ok(ricci)
    }

    fn ricci_scalar_grid(
        &self,
        metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
    ) -> Result<EvolutionGridField3<f64>, PhysicsError> {
        validate_curvature_stencil(metric, self.derivative.order)?;

        let mut scalar = scalar_like(metric)?;
        for index in 0..metric.interior_len() {
            let ijk = metric.interior_ijk_for_index(index)?;
            let storage = metric.storage_ijk_for_interior_ijk(ijk)?;
            scalar.set_interior(
                ijk[0],
                ijk[1],
                ijk[2],
                ricci_scalar_at_storage(metric, storage, self.derivative)?,
            )?;
        }

        Ok(scalar)
    }

    fn einstein_tensor_grid(
        &self,
        metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
    ) -> Result<EvolutionGridField3<SpatialTensor2>, PhysicsError> {
        validate_curvature_stencil(metric, self.derivative.order)?;

        let mut einstein = tensor_like(metric, SpatialTensor2::ZERO)?;
        for index in 0..metric.interior_len() {
            let ijk = metric.interior_ijk_for_index(index)?;
            let storage = metric.storage_ijk_for_interior_ijk(ijk)?;
            einstein.set_interior(
                ijk[0],
                ijk[1],
                ijk[2],
                einstein_tensor_at_storage(metric, storage, self.derivative)?,
            )?;
        }

        Ok(einstein)
    }
}

pub fn validate_curvature_stencil<T>(
    field: &EvolutionGridField3<T>,
    order: FiniteDifferenceOrder,
) -> Result<(), PhysicsError> {
    let radius = order.ghost_radius() + 1;

    if field.ghost_zones.lower.iter().any(|&width| width < radius)
        || field.ghost_zones.upper.iter().any(|&width| width < radius)
    {
        return Err(PhysicsError::InvalidGrid);
    }

    Ok(())
}

pub fn inverse_spatial_metric(
    metric: SymmetricSpatialTensor2,
) -> Result<SpatialTensor2, PhysicsError> {
    let m = metric.components;
    let determinant = metric.determinant();

    if !determinant.is_finite() || determinant.abs() <= f64::EPSILON {
        return Err(PhysicsError::SingularMetric);
    }

    Ok(SpatialTensor2::new([
        [
            (m[1][1] * m[2][2] - m[1][2] * m[2][1]) / determinant,
            (m[0][2] * m[2][1] - m[0][1] * m[2][2]) / determinant,
            (m[0][1] * m[1][2] - m[0][2] * m[1][1]) / determinant,
        ],
        [
            (m[1][2] * m[2][0] - m[1][0] * m[2][2]) / determinant,
            (m[0][0] * m[2][2] - m[0][2] * m[2][0]) / determinant,
            (m[0][2] * m[1][0] - m[0][0] * m[1][2]) / determinant,
        ],
        [
            (m[1][0] * m[2][1] - m[1][1] * m[2][0]) / determinant,
            (m[0][1] * m[2][0] - m[0][0] * m[2][1]) / determinant,
            (m[0][0] * m[1][1] - m[0][1] * m[1][0]) / determinant,
        ],
    ]))
}

pub fn trace_with_inverse(tensor: SymmetricSpatialTensor2, inverse: SpatialTensor2) -> f64 {
    tensor.to_full().trace_with_inverse(inverse)
}

pub fn double_contract_symmetric(tensor: SymmetricSpatialTensor2, inverse: SpatialTensor2) -> f64 {
    let mut result = 0.0;

    for i in 0..3 {
        for j in 0..3 {
            for k in 0..3 {
                for l in 0..3 {
                    result += inverse.components[i][k]
                        * inverse.components[j][l]
                        * tensor.components[i][j]
                        * tensor.components[k][l];
                }
            }
        }
    }

    result
}

pub fn ricci_tensor_at_storage(
    metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
    storage: [usize; 3],
    derivative: FiniteDifferenceOperator,
) -> Result<SpatialTensor2, PhysicsError> {
    let mut ricci = [[0.0; 3]; 3];

    for i in 0..3 {
        for j in 0..3 {
            let mut value = 0.0;

            for k in 0..3 {
                value += partial_christoffel(metric, storage, k, k, i, j, derivative)?;
                value -= partial_christoffel(metric, storage, j, k, i, k, derivative)?;
            }

            for k in 0..3 {
                for l in 0..3 {
                    value += christoffel_at(metric, storage, k, i, j)?
                        * christoffel_at(metric, storage, l, k, l)?;
                    value -= christoffel_at(metric, storage, l, i, k)?
                        * christoffel_at(metric, storage, k, j, l)?;
                }
            }

            ricci[i][j] = value;
        }
    }

    Ok(SpatialTensor2::new(ricci))
}

pub fn ricci_scalar_at_storage(
    metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
    storage: [usize; 3],
    derivative: FiniteDifferenceOperator,
) -> Result<f64, PhysicsError> {
    let gamma = tensor_at(metric, storage)?;
    let inverse = inverse_spatial_metric(gamma)?;
    Ok(ricci_tensor_at_storage(metric, storage, derivative)?.trace_with_inverse(inverse))
}

pub fn einstein_tensor_at_storage(
    metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
    storage: [usize; 3],
    derivative: FiniteDifferenceOperator,
) -> Result<SpatialTensor2, PhysicsError> {
    let gamma = tensor_at(metric, storage)?.to_full();
    let ricci = ricci_tensor_at_storage(metric, storage, derivative)?;
    let scalar = ricci.trace_with_inverse(inverse_spatial_metric(tensor_at(metric, storage)?)?);
    let mut components = [[0.0; 3]; 3];

    for i in 0..3 {
        for j in 0..3 {
            components[i][j] = ricci.components[i][j] - 0.5 * scalar * gamma.components[i][j];
        }
    }

    Ok(SpatialTensor2::new(components))
}

pub fn christoffel_at(
    metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
    storage: [usize; 3],
    upper: usize,
    lower_a: usize,
    lower_b: usize,
) -> Result<f64, PhysicsError> {
    let gamma = tensor_at(metric, storage)?;
    let inverse = inverse_spatial_metric(gamma)?;
    let mut value = 0.0;

    for l in 0..3 {
        value += inverse.components[upper][l]
            * (partial_metric(metric, storage, lower_a, l, lower_b)?
                + partial_metric(metric, storage, lower_b, l, lower_a)?
                - partial_metric(metric, storage, l, lower_a, lower_b)?);
    }

    Ok(0.5 * value)
}

fn partial_christoffel(
    metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
    storage: [usize; 3],
    derivative_axis: usize,
    upper: usize,
    lower_a: usize,
    lower_b: usize,
    derivative: FiniteDifferenceOperator,
) -> Result<f64, PhysicsError> {
    let h = spacing_for_axis(metric.grid, derivative_axis);

    match derivative.order {
        FiniteDifferenceOrder::Second => Ok((christoffel_at(
            metric,
            offset_storage(metric, storage, derivative_axis, 1)?,
            upper,
            lower_a,
            lower_b,
        )? - christoffel_at(
            metric,
            offset_storage(metric, storage, derivative_axis, -1)?,
            upper,
            lower_a,
            lower_b,
        )?) / (2.0 * h)),
        FiniteDifferenceOrder::Fourth => Ok((-christoffel_at(
            metric,
            offset_storage(metric, storage, derivative_axis, 2)?,
            upper,
            lower_a,
            lower_b,
        )? + 8.0
            * christoffel_at(
                metric,
                offset_storage(metric, storage, derivative_axis, 1)?,
                upper,
                lower_a,
                lower_b,
            )?
            - 8.0
                * christoffel_at(
                    metric,
                    offset_storage(metric, storage, derivative_axis, -1)?,
                    upper,
                    lower_a,
                    lower_b,
                )?
            + christoffel_at(
                metric,
                offset_storage(metric, storage, derivative_axis, -2)?,
                upper,
                lower_a,
                lower_b,
            )?)
            / (12.0 * h)),
    }
}

fn partial_metric(
    metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
    storage: [usize; 3],
    component_a: usize,
    component_b: usize,
    axis: usize,
) -> Result<f64, PhysicsError> {
    let h = spacing_for_axis(metric.grid, axis);
    Ok(
        (tensor_at(metric, offset_storage(metric, storage, axis, 1)?)?.components[component_a]
            [component_b]
            - tensor_at(metric, offset_storage(metric, storage, axis, -1)?)?.components
                [component_a][component_b])
            / (2.0 * h),
    )
}

fn tensor_like<T>(
    field: &EvolutionGridField3<T>,
    value: SpatialTensor2,
) -> Result<EvolutionGridField3<SpatialTensor2>, PhysicsError> {
    EvolutionGridField3::new(
        field.grid,
        field.centering,
        field.ghost_zones,
        field.boundary_conditions,
        value,
    )
}

fn scalar_like<T>(
    field: &EvolutionGridField3<T>,
) -> Result<EvolutionGridField3<f64>, PhysicsError> {
    EvolutionGridField3::new(
        field.grid,
        field.centering,
        field.ghost_zones,
        field.boundary_conditions,
        0.0,
    )
}

fn tensor_at(
    field: &EvolutionGridField3<SymmetricSpatialTensor2>,
    storage: [usize; 3],
) -> Result<SymmetricSpatialTensor2, PhysicsError> {
    Ok(*field.get_storage(storage[0], storage[1], storage[2])?)
}

fn offset_storage<T>(
    field: &EvolutionGridField3<T>,
    storage: [usize; 3],
    axis: usize,
    offset: isize,
) -> Result<[usize; 3], PhysicsError> {
    let shifted = storage[axis] as isize + offset;
    if shifted < 0 || shifted as usize >= field.storage_dimensions[axis] {
        return Err(PhysicsError::PointOutsideGrid);
    }

    let mut next = storage;
    next[axis] = shifted as usize;
    Ok(next)
}

fn spacing_for_axis(grid: UniformGrid3, axis: usize) -> f64 {
    match axis {
        0 => grid.spacing.x,
        1 => grid.spacing.y,
        _ => grid.spacing.z,
    }
}
