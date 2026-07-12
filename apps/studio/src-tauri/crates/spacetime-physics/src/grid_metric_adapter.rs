//! Checked point-query view over grid-backed ADM or BSSN geometry.

use crate::{
    AdmGridFields, BssnGridFields, ChristoffelSymbols, ContravariantTensor2, CoordinateChartKind,
    CovariantTensor2, MetricField, PhysicsError, SpacetimeCoordinate, SymmetricSpatialTensor2,
    UniformGrid3, Vec3,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum GridMetricInterpolation {
    NearestCell,
    Trilinear,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, thiserror::Error)]
pub enum GridMetricAdapterError {
    #[error("coordinate chart {0:?} is not supported by the Cartesian grid adapter")]
    UnsupportedChart(CoordinateChartKind),
    #[error("interpolation policy {0:?} is not implemented")]
    UnsupportedInterpolation(GridMetricInterpolation),
    #[error("query point lies outside the metric grid")]
    OutOfDomain,
    #[error("grid metric query failed numerically: {0}")]
    NumericalFailure(PhysicsError),
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct GridMetricSample {
    pub covariant: CovariantTensor2,
    pub inverse: ContravariantTensor2,
    pub christoffel: ChristoffelSymbols,
}

#[derive(Debug, Copy, Clone)]
enum GridMetricSource<'a> {
    Adm(&'a AdmGridFields),
    Bssn(&'a BssnGridFields),
}

#[derive(Debug, Copy, Clone)]
pub struct GridMetricFieldAdapter<'a> {
    source: GridMetricSource<'a>,
    interpolation: GridMetricInterpolation,
}

impl<'a> GridMetricFieldAdapter<'a> {
    pub const fn new(fields: &'a BssnGridFields, interpolation: GridMetricInterpolation) -> Self {
        Self::from_bssn(fields, interpolation)
    }
    pub const fn from_bssn(
        fields: &'a BssnGridFields,
        interpolation: GridMetricInterpolation,
    ) -> Self {
        Self {
            source: GridMetricSource::Bssn(fields),
            interpolation,
        }
    }
    pub const fn from_adm(
        fields: &'a AdmGridFields,
        interpolation: GridMetricInterpolation,
    ) -> Self {
        Self {
            source: GridMetricSource::Adm(fields),
            interpolation,
        }
    }
    fn grid(&self) -> UniformGrid3 {
        match self.source {
            GridMetricSource::Adm(f) => f.grid,
            GridMetricSource::Bssn(f) => f.grid,
        }
    }

    pub fn query(
        &self,
        x: SpacetimeCoordinate,
    ) -> Result<GridMetricSample, GridMetricAdapterError> {
        if x.chart != CoordinateChartKind::Cartesian {
            return Err(GridMetricAdapterError::UnsupportedChart(x.chart));
        }
        if self.interpolation != GridMetricInterpolation::NearestCell {
            return Err(GridMetricAdapterError::UnsupportedInterpolation(
                self.interpolation,
            ));
        }
        let index = self
            .grid()
            .nearest_cell_index(x)
            .map_err(|error| match error {
                PhysicsError::PointOutsideGrid => GridMetricAdapterError::OutOfDomain,
                other => GridMetricAdapterError::NumericalFailure(other),
            })?;
        let mut sample = self.sample_at_index(index)?;
        sample.christoffel = self.christoffel_at_index(index, sample.inverse)?;
        Ok(sample)
    }

    fn sample_at_index(&self, index: usize) -> Result<GridMetricSample, GridMetricAdapterError> {
        let (lapse, shift, spatial) = match self.source {
            GridMetricSource::Adm(fields) => {
                let c = fields
                    .cell_state(index)
                    .map_err(GridMetricAdapterError::NumericalFailure)?;
                (c.lapse, c.shift, c.spatial_metric)
            }
            GridMetricSource::Bssn(fields) => {
                let c = fields
                    .cell_state(index)
                    .map_err(GridMetricAdapterError::NumericalFailure)?;
                (
                    c.lapse,
                    c.shift,
                    scale_tensor(c.conformal_metric, (4.0 * c.conformal_factor).exp()),
                )
            }
        };
        metric_sample(lapse, shift, spatial)
    }

    fn christoffel_at_index(
        &self,
        index: usize,
        inverse: ContravariantTensor2,
    ) -> Result<ChristoffelSymbols, GridMetricAdapterError> {
        let grid = self.grid();
        let center = grid
            .ijk_for_index(index)
            .map_err(GridMetricAdapterError::NumericalFailure)?;
        let spacing = [grid.spacing.x, grid.spacing.y, grid.spacing.z];
        let mut derivatives = [[[0.0; 4]; 4]; 4];
        for axis in 0..3 {
            if grid.dimensions[axis] == 1 {
                continue;
            }
            let mut lower = center;
            let mut upper = center;
            let (lower_metric, upper_metric, denominator) = if center[axis] == 0 {
                upper[axis] += 1;
                (
                    self.sample_at_index(index)?.covariant,
                    self.sample_at_index(
                        grid.linear_index(upper[0], upper[1], upper[2])
                            .map_err(GridMetricAdapterError::NumericalFailure)?,
                    )?
                    .covariant,
                    spacing[axis],
                )
            } else if center[axis] + 1 == grid.dimensions[axis] {
                lower[axis] -= 1;
                (
                    self.sample_at_index(
                        grid.linear_index(lower[0], lower[1], lower[2])
                            .map_err(GridMetricAdapterError::NumericalFailure)?,
                    )?
                    .covariant,
                    self.sample_at_index(index)?.covariant,
                    spacing[axis],
                )
            } else {
                lower[axis] -= 1;
                upper[axis] += 1;
                (
                    self.sample_at_index(
                        grid.linear_index(lower[0], lower[1], lower[2])
                            .map_err(GridMetricAdapterError::NumericalFailure)?,
                    )?
                    .covariant,
                    self.sample_at_index(
                        grid.linear_index(upper[0], upper[1], upper[2])
                            .map_err(GridMetricAdapterError::NumericalFailure)?,
                    )?
                    .covariant,
                    2.0 * spacing[axis],
                )
            };
            for mu in 0..4 {
                for nu in 0..4 {
                    derivatives[axis + 1][mu][nu] = (upper_metric.components[mu][nu]
                        - lower_metric.components[mu][nu])
                        / denominator;
                }
            }
        }

        let mut gamma = [[[0.0; 4]; 4]; 4];
        for rho in 0..4 {
            for mu in 0..4 {
                for nu in 0..4 {
                    for sigma in 0..4 {
                        gamma[rho][mu][nu] += 0.5
                            * inverse.components[rho][sigma]
                            * (derivatives[mu][sigma][nu] + derivatives[nu][sigma][mu]
                                - derivatives[sigma][mu][nu]);
                    }
                }
            }
        }
        Ok(ChristoffelSymbols::new(gamma))
    }
}

impl MetricField for GridMetricFieldAdapter<'_> {
    fn validate_query(&self, x: SpacetimeCoordinate) -> Result<(), PhysicsError> {
        self.query(x).map(|_| ()).map_err(|e| match e {
            GridMetricAdapterError::UnsupportedChart(_) => PhysicsError::UnsupportedCoordinateChart,
            GridMetricAdapterError::UnsupportedInterpolation(_) => {
                PhysicsError::UnsupportedInterpolation
            }
            GridMetricAdapterError::OutOfDomain => PhysicsError::PointOutsideGrid,
            GridMetricAdapterError::NumericalFailure(error) => error,
        })
    }
    fn covariant_metric_at(&self, x: SpacetimeCoordinate) -> CovariantTensor2 {
        self.query(x)
            .map(|s| s.covariant)
            .unwrap_or(CovariantTensor2::ZERO)
    }
    fn inverse_metric_at(&self, x: SpacetimeCoordinate) -> ContravariantTensor2 {
        self.query(x)
            .map(|s| s.inverse)
            .unwrap_or(ContravariantTensor2::ZERO)
    }
    fn christoffel_symbols_at(&self, x: SpacetimeCoordinate) -> ChristoffelSymbols {
        self.query(x)
            .map(|s| s.christoffel)
            .unwrap_or(ChristoffelSymbols::ZERO)
    }
}

fn scale_tensor(mut tensor: SymmetricSpatialTensor2, scale: f64) -> SymmetricSpatialTensor2 {
    for row in &mut tensor.components {
        for value in row {
            *value *= scale;
        }
    }
    tensor
}

fn metric_sample(
    alpha: f64,
    beta: Vec3,
    gamma: SymmetricSpatialTensor2,
) -> Result<GridMetricSample, GridMetricAdapterError> {
    if !alpha.is_finite()
        || alpha <= 0.0
        || !beta.x.is_finite()
        || !beta.y.is_finite()
        || !beta.z.is_finite()
        || gamma.components.iter().flatten().any(|v| !v.is_finite())
    {
        return Err(GridMetricAdapterError::NumericalFailure(
            PhysicsError::NonFiniteValue,
        ));
    }
    let inv = inverse3(gamma.components).ok_or(GridMetricAdapterError::NumericalFailure(
        PhysicsError::SingularMetric,
    ))?;
    let b = [beta.x, beta.y, beta.z];
    let lower = [
        dot(gamma.components[0], b),
        dot(gamma.components[1], b),
        dot(gamma.components[2], b),
    ];
    let beta2 = dot(lower, b);
    let a2 = alpha * alpha;
    let mut cov = [[0.0; 4]; 4];
    cov[0][0] = a2 - beta2;
    let mut contra = [[0.0; 4]; 4];
    contra[0][0] = 1.0 / a2;
    for i in 0..3 {
        cov[0][i + 1] = -lower[i];
        cov[i + 1][0] = -lower[i];
        contra[0][i + 1] = -b[i] / a2;
        contra[i + 1][0] = -b[i] / a2;
        for j in 0..3 {
            cov[i + 1][j + 1] = -gamma.components[i][j];
            contra[i + 1][j + 1] = -inv[i][j] + b[i] * b[j] / a2;
        }
    }
    Ok(GridMetricSample {
        covariant: CovariantTensor2::new(cov),
        inverse: ContravariantTensor2::new(contra),
        christoffel: ChristoffelSymbols::ZERO,
    })
}

fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn inverse3(m: [[f64; 3]; 3]) -> Option<[[f64; 3]; 3]> {
    let d = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
        - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
        + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    if !d.is_finite() || d.abs() < 1e-14 {
        return None;
    }
    Some([
        [
            (m[1][1] * m[2][2] - m[1][2] * m[2][1]) / d,
            (m[0][2] * m[2][1] - m[0][1] * m[2][2]) / d,
            (m[0][1] * m[1][2] - m[0][2] * m[1][1]) / d,
        ],
        [
            (m[1][2] * m[2][0] - m[1][0] * m[2][2]) / d,
            (m[0][0] * m[2][2] - m[0][2] * m[2][0]) / d,
            (m[0][2] * m[1][0] - m[0][0] * m[1][2]) / d,
        ],
        [
            (m[1][0] * m[2][1] - m[1][1] * m[2][0]) / d,
            (m[0][1] * m[2][0] - m[0][0] * m[2][1]) / d,
            (m[0][0] * m[1][1] - m[0][1] * m[1][0]) / d,
        ],
    ])
}
