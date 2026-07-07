/// Errors produced by basic physics primitives.
#[derive(Debug, Copy, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PhysicsError {
    #[error("speed of light must be positive")]
    SpeedOfLightMustBePositive,
    #[error("boost velocity must be subluminal")]
    SuperluminalBoost,
    #[error("interval is spacelike")]
    SpacelikeInterval,
    #[error("zero norm")]
    ZeroNorm,
    #[error("metric is singular or incompatible with this operation")]
    SingularMetric,
    #[error("encountered a non-finite value")]
    NonFiniteValue,
    #[error("invalid integration step")]
    InvalidStep,
    #[error("invalid grid")]
    InvalidGrid,
    #[error("point or index is outside the grid")]
    PointOutsideGrid,
}

use crate::vec3;
use crate::{
    AdmGridFields, BssnGridFields, EvolutionGridField3, FiniteDifferenceCurvatureOperator,
    FiniteDifferenceOperator, FiniteDifferenceOrder, SpatialTensor2, SymmetricSpatialTensor2,
    UniformGrid3, Vec3,
};

/// Scalar field reduction useful for constraint and solver health monitoring.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct FieldReduction {
    pub count: usize,
    pub non_finite_count: usize,
    pub min: f64,
    pub max: f64,
    pub mean: f64,
    pub l1: f64,
    pub l2: f64,
    pub linf: f64,
}

impl FieldReduction {
    pub const EMPTY: Self = Self {
        count: 0,
        non_finite_count: 0,
        min: 0.0,
        max: 0.0,
        mean: 0.0,
        l1: 0.0,
        l2: 0.0,
        linf: 0.0,
    };

    pub const fn is_finite(self) -> bool {
        self.non_finite_count == 0
    }
}

/// Report from a finite-value scan.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct FiniteCheck {
    pub checked_count: usize,
    pub non_finite_count: usize,
    pub first_non_finite_index: Option<usize>,
}

impl FiniteCheck {
    pub const fn is_finite(self) -> bool {
        self.non_finite_count == 0
    }
}

/// ADM vacuum constraint residuals and reductions.
#[derive(Debug, Clone, PartialEq)]
pub struct AdmConstraintDiagnostics {
    pub hamiltonian: EvolutionGridField3<f64>,
    pub momentum: EvolutionGridField3<Vec3>,
    pub hamiltonian_reduction: FieldReduction,
    pub momentum_reduction: FieldReduction,
    pub finite_check: FiniteCheck,
}

/// BSSN vacuum/algebraic constraint residuals and reductions.
#[derive(Debug, Clone, PartialEq)]
pub struct BssnConstraintDiagnostics {
    pub adm: AdmConstraintDiagnostics,
    pub determinant_normalization: EvolutionGridField3<f64>,
    pub trace_free: EvolutionGridField3<f64>,
    pub determinant_reduction: FieldReduction,
    pub trace_free_reduction: FieldReduction,
    pub finite_check: FiniteCheck,
}

/// Constraint diagnostic operator for grid-backed ADM/BSSN fields.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ConstraintDiagnosticsOperator {
    pub derivative: FiniteDifferenceOperator,
}

impl ConstraintDiagnosticsOperator {
    pub const SECOND_ORDER: Self = Self {
        derivative: FiniteDifferenceOperator::SECOND_ORDER,
    };

    pub const fn new(derivative: FiniteDifferenceOperator) -> Self {
        Self { derivative }
    }

    pub fn adm_constraints(
        self,
        fields: &AdmGridFields,
    ) -> Result<AdmConstraintDiagnostics, PhysicsError> {
        let mut working = fields.clone();
        working.apply_boundary_conditions()?;
        validate_constraint_stencil(&working.spatial_metric, self.derivative.order)?;

        let finite_check = check_adm_finite(&working)?;
        let mut hamiltonian = scalar_like(&working.lapse)?;
        let mut momentum = vector_like(&working.lapse)?;

        for index in 0..working.lapse.interior_len() {
            let ijk = working.lapse.interior_ijk_for_index(index)?;
            let storage = working.lapse.storage_ijk_for_interior_ijk(ijk)?;
            let gamma = tensor_at(&working.spatial_metric, storage)?;
            let k_ij = tensor_at(&working.extrinsic_curvature, storage)?;
            let inverse = inverse_spatial_metric(gamma)?;
            let trace_k = trace_with_inverse(k_ij, inverse);
            let k_contract = double_contract_symmetric(k_ij, inverse);
            let ricci_scalar = FiniteDifferenceCurvatureOperator::new(self.derivative)
                .ricci_scalar_at(&working.spatial_metric, ijk)?;

            hamiltonian.set_interior(
                ijk[0],
                ijk[1],
                ijk[2],
                ricci_scalar + trace_k * trace_k - k_contract,
            )?;

            momentum.set_interior(
                ijk[0],
                ijk[1],
                ijk[2],
                momentum_constraint_at(
                    &working.spatial_metric,
                    &working.extrinsic_curvature,
                    storage,
                    self.derivative,
                )?,
            )?;
        }

        let hamiltonian_reduction = reduce_scalar_field(&hamiltonian)?;
        let momentum_reduction = reduce_vector_magnitude_field(&momentum)?;

        Ok(AdmConstraintDiagnostics {
            hamiltonian,
            momentum,
            hamiltonian_reduction,
            momentum_reduction,
            finite_check,
        })
    }

    pub fn bssn_constraints(
        self,
        fields: &BssnGridFields,
    ) -> Result<BssnConstraintDiagnostics, PhysicsError> {
        let mut working = fields.clone();
        working.apply_boundary_conditions()?;
        validate_constraint_stencil(&working.conformal_metric, self.derivative.order)?;

        let finite_check = check_bssn_finite(&working)?;
        let mut determinant_normalization = scalar_like(&working.lapse)?;
        let mut trace_free = scalar_like(&working.lapse)?;
        let mut adm = adm_from_bssn(&working)?;

        adm.apply_boundary_conditions()?;
        let adm_diagnostics = self.adm_constraints(&adm)?;

        for index in 0..working.lapse.interior_len() {
            let ijk = working.lapse.interior_ijk_for_index(index)?;
            let conformal_metric = *working
                .conformal_metric
                .get_interior(ijk[0], ijk[1], ijk[2])?;
            let trace_free_curvature = *working
                .trace_free_curvature
                .get_interior(ijk[0], ijk[1], ijk[2])?;
            let inverse = inverse_spatial_metric(conformal_metric)?;

            determinant_normalization.set_interior(
                ijk[0],
                ijk[1],
                ijk[2],
                conformal_metric.determinant() - 1.0,
            )?;
            trace_free.set_interior(
                ijk[0],
                ijk[1],
                ijk[2],
                trace_with_inverse(trace_free_curvature, inverse),
            )?;
        }

        let determinant_reduction = reduce_scalar_field(&determinant_normalization)?;
        let trace_free_reduction = reduce_scalar_field(&trace_free)?;

        Ok(BssnConstraintDiagnostics {
            adm: adm_diagnostics,
            determinant_normalization,
            trace_free,
            determinant_reduction,
            trace_free_reduction,
            finite_check,
        })
    }
}

/// Enforce BSSN algebraic constraints det(gamma_tilde)=1 and tr(A_tilde)=0.
pub fn enforce_bssn_algebraic_constraints(fields: &mut BssnGridFields) -> Result<(), PhysicsError> {
    for index in 0..fields.conformal_metric.interior_len() {
        let ijk = fields.conformal_metric.interior_ijk_for_index(index)?;
        let mut conformal_metric = *fields
            .conformal_metric
            .get_interior(ijk[0], ijk[1], ijk[2])?;
        let mut trace_free_curvature = *fields
            .trace_free_curvature
            .get_interior(ijk[0], ijk[1], ijk[2])?;

        let determinant = conformal_metric.determinant();
        if !determinant.is_finite() || determinant <= 0.0 {
            return Err(PhysicsError::SingularMetric);
        }

        let normalization = determinant.powf(-1.0 / 3.0);
        conformal_metric = scale_symmetric(conformal_metric, normalization);
        let inverse = inverse_spatial_metric(conformal_metric)?;
        let trace = trace_with_inverse(trace_free_curvature, inverse);
        trace_free_curvature = subtract_trace_part(trace_free_curvature, conformal_metric, trace);

        fields
            .conformal_metric
            .set_interior(ijk[0], ijk[1], ijk[2], conformal_metric)?;
        fields
            .trace_free_curvature
            .set_interior(ijk[0], ijk[1], ijk[2], trace_free_curvature)?;
    }

    fields.apply_boundary_conditions()
}

pub fn reduce_scalar_field(
    field: &EvolutionGridField3<f64>,
) -> Result<FieldReduction, PhysicsError> {
    if field.interior_len() == 0 {
        return Ok(FieldReduction::EMPTY);
    }

    let mut count = 0;
    let mut non_finite_count = 0;
    let mut min = f64::INFINITY;
    let mut max = f64::NEG_INFINITY;
    let mut sum = 0.0;
    let mut sum_abs = 0.0;
    let mut sum_sq = 0.0;
    let mut linf = 0.0;

    for index in 0..field.interior_len() {
        let value = *field.get_interior_index(index)?;
        count += 1;

        if !value.is_finite() {
            non_finite_count += 1;
            continue;
        }

        min = min.min(value);
        max = max.max(value);
        sum += value;
        sum_abs += value.abs();
        sum_sq += value * value;
        linf = f64::max(linf, value.abs());
    }

    if count == non_finite_count {
        return Ok(FieldReduction {
            count,
            non_finite_count,
            ..FieldReduction::EMPTY
        });
    }

    let finite_count = (count - non_finite_count) as f64;
    Ok(FieldReduction {
        count,
        non_finite_count,
        min,
        max,
        mean: sum / finite_count,
        l1: sum_abs,
        l2: sum_sq.sqrt(),
        linf,
    })
}

pub fn reduce_vector_magnitude_field(
    field: &EvolutionGridField3<Vec3>,
) -> Result<FieldReduction, PhysicsError> {
    let mut scalar = EvolutionGridField3::new(
        field.grid,
        field.centering,
        field.ghost_zones,
        field.boundary_conditions,
        0.0,
    )?;

    for index in 0..field.interior_len() {
        let ijk = field.interior_ijk_for_index(index)?;
        scalar.set_interior(
            ijk[0],
            ijk[1],
            ijk[2],
            field.get_interior(ijk[0], ijk[1], ijk[2])?.norm(),
        )?;
    }

    reduce_scalar_field(&scalar)
}

pub fn check_adm_finite(fields: &AdmGridFields) -> Result<FiniteCheck, PhysicsError> {
    let mut check = FiniteCheck {
        checked_count: 0,
        non_finite_count: 0,
        first_non_finite_index: None,
    };

    for index in 0..fields.lapse.interior_len() {
        let state = fields.cell_state(index)?;
        update_finite_check(&mut check, index, state.lapse.is_finite());
        update_finite_check(&mut check, index, vec3_is_finite(state.shift));
        update_finite_check(&mut check, index, tensor_is_finite(state.spatial_metric));
        update_finite_check(
            &mut check,
            index,
            tensor_is_finite(state.extrinsic_curvature),
        );
    }

    Ok(check)
}

pub fn check_bssn_finite(fields: &BssnGridFields) -> Result<FiniteCheck, PhysicsError> {
    let mut check = FiniteCheck {
        checked_count: 0,
        non_finite_count: 0,
        first_non_finite_index: None,
    };

    for index in 0..fields.lapse.interior_len() {
        let state = fields.cell_state(index)?;
        update_finite_check(&mut check, index, state.lapse.is_finite());
        update_finite_check(&mut check, index, vec3_is_finite(state.shift));
        update_finite_check(&mut check, index, tensor_is_finite(state.conformal_metric));
        update_finite_check(&mut check, index, state.conformal_factor.is_finite());
        update_finite_check(
            &mut check,
            index,
            state.trace_extrinsic_curvature.is_finite(),
        );
        update_finite_check(
            &mut check,
            index,
            tensor_is_finite(state.trace_free_curvature),
        );
        update_finite_check(
            &mut check,
            index,
            vec3_is_finite(state.connection_functions),
        );
    }

    Ok(check)
}

fn adm_from_bssn(fields: &BssnGridFields) -> Result<AdmGridFields, PhysicsError> {
    let mut spatial_metric = EvolutionGridField3::new(
        fields.grid,
        fields.conformal_metric.centering,
        fields.conformal_metric.ghost_zones,
        fields.conformal_metric.boundary_conditions,
        SymmetricSpatialTensor2::IDENTITY,
    )?;
    let mut extrinsic_curvature = EvolutionGridField3::new(
        fields.grid,
        fields.trace_free_curvature.centering,
        fields.trace_free_curvature.ghost_zones,
        fields.trace_free_curvature.boundary_conditions,
        SymmetricSpatialTensor2::ZERO,
    )?;

    for index in 0..fields.lapse.interior_len() {
        let ijk = fields.lapse.interior_ijk_for_index(index)?;
        let conformal_metric = *fields
            .conformal_metric
            .get_interior(ijk[0], ijk[1], ijk[2])?;
        let conformal_factor = *fields
            .conformal_factor
            .get_interior(ijk[0], ijk[1], ijk[2])?;
        let trace_k = *fields
            .trace_extrinsic_curvature
            .get_interior(ijk[0], ijk[1], ijk[2])?;
        let trace_free_curvature = *fields
            .trace_free_curvature
            .get_interior(ijk[0], ijk[1], ijk[2])?;
        let physical_scale = (4.0 * conformal_factor).exp();
        let gamma = scale_symmetric(conformal_metric, physical_scale);
        let k_ij = scale_symmetric(
            add_symmetric(
                trace_free_curvature,
                scale_symmetric(conformal_metric, trace_k / 3.0),
            ),
            physical_scale,
        );

        spatial_metric.set_interior(ijk[0], ijk[1], ijk[2], gamma)?;
        extrinsic_curvature.set_interior(ijk[0], ijk[1], ijk[2], k_ij)?;
    }

    AdmGridFields::new(
        fields.grid,
        fields.time,
        fields.lapse.clone(),
        fields.shift.clone(),
        spatial_metric,
        extrinsic_curvature,
    )
}

fn momentum_constraint_at(
    metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
    extrinsic_curvature: &EvolutionGridField3<SymmetricSpatialTensor2>,
    storage: [usize; 3],
    derivative: FiniteDifferenceOperator,
) -> Result<Vec3, PhysicsError> {
    let mut result = [0.0; 3];

    for i in 0..3 {
        let mut value = 0.0;

        for j in 0..3 {
            value +=
                partial_momentum_flux(metric, extrinsic_curvature, storage, j, j, i, derivative)?;

            for m in 0..3 {
                value += christoffel_at(metric, storage, j, j, m)?
                    * momentum_flux_at(metric, extrinsic_curvature, storage, m, i)?;
                value -= christoffel_at(metric, storage, m, j, i)?
                    * momentum_flux_at(metric, extrinsic_curvature, storage, j, m)?;
            }
        }

        result[i] = value;
    }

    Ok(vec3::new(result[0], result[1], result[2]))
}

fn christoffel_at(
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

fn partial_metric(
    metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
    storage: [usize; 3],
    component_a: usize,
    component_b: usize,
    axis: usize,
) -> Result<f64, PhysicsError> {
    let h = spacing_for_axis(metric.grid, axis);
    let axis = axis_from_index(axis);
    Ok(
        (tensor_at(metric, offset_storage(metric, storage, axis, 1)?)?.components[component_a]
            [component_b]
            - tensor_at(metric, offset_storage(metric, storage, axis, -1)?)?.components
                [component_a][component_b])
            / (2.0 * h),
    )
}

fn partial_momentum_flux(
    metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
    extrinsic_curvature: &EvolutionGridField3<SymmetricSpatialTensor2>,
    storage: [usize; 3],
    derivative_axis: usize,
    upper: usize,
    lower: usize,
    derivative: FiniteDifferenceOperator,
) -> Result<f64, PhysicsError> {
    let axis = axis_from_index(derivative_axis);
    let h = spacing_for_axis(metric.grid, derivative_axis);

    match derivative.order {
        FiniteDifferenceOrder::Second => Ok((momentum_flux_at(
            metric,
            extrinsic_curvature,
            offset_storage(metric, storage, axis, 1)?,
            upper,
            lower,
        )? - momentum_flux_at(
            metric,
            extrinsic_curvature,
            offset_storage(metric, storage, axis, -1)?,
            upper,
            lower,
        )?) / (2.0 * h)),
        FiniteDifferenceOrder::Fourth => Ok((-momentum_flux_at(
            metric,
            extrinsic_curvature,
            offset_storage(metric, storage, axis, 2)?,
            upper,
            lower,
        )? + 8.0
            * momentum_flux_at(
                metric,
                extrinsic_curvature,
                offset_storage(metric, storage, axis, 1)?,
                upper,
                lower,
            )?
            - 8.0
                * momentum_flux_at(
                    metric,
                    extrinsic_curvature,
                    offset_storage(metric, storage, axis, -1)?,
                    upper,
                    lower,
                )?
            + momentum_flux_at(
                metric,
                extrinsic_curvature,
                offset_storage(metric, storage, axis, -2)?,
                upper,
                lower,
            )?)
            / (12.0 * h)),
    }
}

fn momentum_flux_at(
    metric: &EvolutionGridField3<SymmetricSpatialTensor2>,
    extrinsic_curvature: &EvolutionGridField3<SymmetricSpatialTensor2>,
    storage: [usize; 3],
    upper: usize,
    lower: usize,
) -> Result<f64, PhysicsError> {
    let gamma = tensor_at(metric, storage)?;
    let inverse = inverse_spatial_metric(gamma)?;
    let k_ij = tensor_at(extrinsic_curvature, storage)?;
    let trace_k = trace_with_inverse(k_ij, inverse);
    let mut mixed = 0.0;

    for m in 0..3 {
        mixed += inverse.components[upper][m] * k_ij.components[m][lower];
    }

    Ok(mixed - if upper == lower { trace_k } else { 0.0 })
}

fn validate_constraint_stencil<T>(
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

fn vector_like<T>(
    field: &EvolutionGridField3<T>,
) -> Result<EvolutionGridField3<Vec3>, PhysicsError> {
    EvolutionGridField3::new(
        field.grid,
        field.centering,
        field.ghost_zones,
        field.boundary_conditions,
        vec3::ZERO,
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

fn axis_from_index(axis: usize) -> usize {
    axis
}

fn spacing_for_axis(grid: UniformGrid3, axis: usize) -> f64 {
    match axis {
        0 => grid.spacing.x,
        1 => grid.spacing.y,
        _ => grid.spacing.z,
    }
}

fn inverse_spatial_metric(metric: SymmetricSpatialTensor2) -> Result<SpatialTensor2, PhysicsError> {
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

fn trace_with_inverse(tensor: SymmetricSpatialTensor2, inverse: SpatialTensor2) -> f64 {
    tensor.to_full().trace_with_inverse(inverse)
}

fn double_contract_symmetric(tensor: SymmetricSpatialTensor2, inverse: SpatialTensor2) -> f64 {
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

fn scale_symmetric(tensor: SymmetricSpatialTensor2, scale: f64) -> SymmetricSpatialTensor2 {
    let mut components = tensor.components;

    for row in &mut components {
        for value in row {
            *value *= scale;
        }
    }

    SymmetricSpatialTensor2::new(components)
}

fn add_symmetric(
    lhs: SymmetricSpatialTensor2,
    rhs: SymmetricSpatialTensor2,
) -> SymmetricSpatialTensor2 {
    let mut components = lhs.components;

    for (i, row) in components.iter_mut().enumerate() {
        for (j, value) in row.iter_mut().enumerate() {
            *value += rhs.components[i][j];
        }
    }

    SymmetricSpatialTensor2::new(components)
}

fn subtract_trace_part(
    tensor: SymmetricSpatialTensor2,
    metric: SymmetricSpatialTensor2,
    trace: f64,
) -> SymmetricSpatialTensor2 {
    let mut components = tensor.components;

    for (i, row) in components.iter_mut().enumerate() {
        for (j, value) in row.iter_mut().enumerate() {
            *value -= metric.components[i][j] * trace / 3.0;
        }
    }

    SymmetricSpatialTensor2::new(components)
}

fn update_finite_check(check: &mut FiniteCheck, index: usize, is_finite: bool) {
    check.checked_count += 1;

    if !is_finite {
        check.non_finite_count += 1;
        if check.first_non_finite_index.is_none() {
            check.first_non_finite_index = Some(index);
        }
    }
}

fn vec3_is_finite(value: Vec3) -> bool {
    value.x.is_finite() && value.y.is_finite() && value.z.is_finite()
}

fn tensor_is_finite(value: SymmetricSpatialTensor2) -> bool {
    value
        .components
        .iter()
        .flatten()
        .all(|component| component.is_finite())
}
