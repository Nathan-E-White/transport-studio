use crate::{
    ChristoffelSymbols, ContravariantTensor2, CoordinateTime, CovariantTensor2, EinsteinTensor,
    EvolutionGridField3, RicciScalar, RicciTensor, SpacetimeCoordinate, UniformGrid3, Vec3,
};

/// Broad modeling assumption for gravity/spacetime coupling.

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum SpacetimeAssumption {
    /// Classical transport with absolute time and Euclidean space.
    Galilean,

    /// Special-relativistic flat spacetime.
    Minkowski,

    /// Particles move through a prescribed curved background.
    FixedCurvedBackground,

    /// Aggregate stress-energy affects metric evolution.
    DynamicalBackreaction,
}

/// Local metric model queried by transport, geodesic, and field solvers.
pub trait MetricField {
    fn validate_query(&self, _x: SpacetimeCoordinate) -> Result<(), crate::PhysicsError> {
        Ok(())
    }

    fn covariant_metric_at(&self, x: SpacetimeCoordinate) -> CovariantTensor2;

    fn inverse_metric_at(&self, x: SpacetimeCoordinate) -> ContravariantTensor2;

    fn christoffel_symbols_at(&self, x: SpacetimeCoordinate) -> ChristoffelSymbols;
}

/// Solver-facing metric storage over a grid.
///
/// Numerical relativity evolution should prefer this grid-backed interface.
/// `MetricField` remains useful as a sampled/interpolated view for transport,
/// diagnostics, and fixed analytic backgrounds.
pub trait MetricSolverGrid {
    fn grid(&self) -> UniformGrid3;

    fn coordinate_time(&self) -> CoordinateTime;

    fn lapse(&self) -> &EvolutionGridField3<f64>;

    fn shift(&self) -> &EvolutionGridField3<Vec3>;
}

/// Flat Minkowski metric in Cartesian inertial coordinates with signature (+---).
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct MinkowskiMetricField;

impl MetricField for MinkowskiMetricField {
    fn covariant_metric_at(&self, _x: SpacetimeCoordinate) -> CovariantTensor2 {
        CovariantTensor2::minkowski_plus_minus_minus_minus()
    }

    fn inverse_metric_at(&self, _x: SpacetimeCoordinate) -> ContravariantTensor2 {
        ContravariantTensor2::minkowski_plus_minus_minus_minus()
    }

    fn christoffel_symbols_at(&self, _x: SpacetimeCoordinate) -> ChristoffelSymbols {
        ChristoffelSymbols::ZERO
    }
}

impl FixedBackgroundMetric for MinkowskiMetricField {}

/// A weak-field scalar-potential metric placeholder.
///
/// This is not yet a full numerical-relativity model. It is a useful bridge:
/// transport can query an explicitly curved metric while the project develops
/// the stress-energy and dynamic-spacetime machinery separately.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct WeakFieldMetric<P> {
    pub potential: P,
    pub c: f64,
}

impl<P> WeakFieldMetric<P> {
    pub const fn new(potential: P, c: f64) -> Self {
        Self { potential, c }
    }
}

/// Scalar gravitational potential Φ(x).
pub trait ScalarPotential {
    fn value_at(&self, x: SpacetimeCoordinate) -> f64;

    fn gradient_at(&self, x: SpacetimeCoordinate) -> [f64; 4];
}

/// Constant scalar potential, useful for tests and simple fixtures.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct ConstantPotential {
    pub value: f64,
}

impl ConstantPotential {
    pub const fn new(value: f64) -> Self {
        Self { value }
    }
}

impl ScalarPotential for ConstantPotential {
    fn value_at(&self, _x: SpacetimeCoordinate) -> f64 {
        self.value
    }

    fn gradient_at(&self, _x: SpacetimeCoordinate) -> [f64; 4] {
        [0.0; 4]
    }
}

impl<P: ScalarPotential> MetricField for WeakFieldMetric<P> {
    fn covariant_metric_at(&self, x: SpacetimeCoordinate) -> CovariantTensor2 {
        let phi_over_c_squared = self.potential.value_at(x) / (self.c * self.c);
        let temporal_factor = 1.0 + 2.0 * phi_over_c_squared;
        let spatial_factor = -(1.0 - 2.0 * phi_over_c_squared);

        CovariantTensor2::new([
            [temporal_factor, 0.0, 0.0, 0.0],
            [0.0, spatial_factor, 0.0, 0.0],
            [0.0, 0.0, spatial_factor, 0.0],
            [0.0, 0.0, 0.0, spatial_factor],
        ])
    }

    fn inverse_metric_at(&self, x: SpacetimeCoordinate) -> ContravariantTensor2 {
        let g = self.covariant_metric_at(x);

        ContravariantTensor2::new([
            [1.0 / g.components[0][0], 0.0, 0.0, 0.0],
            [0.0, 1.0 / g.components[1][1], 0.0, 0.0],
            [0.0, 0.0, 1.0 / g.components[2][2], 0.0],
            [0.0, 0.0, 0.0, 1.0 / g.components[3][3]],
        ])
    }

    fn christoffel_symbols_at(&self, x: SpacetimeCoordinate) -> ChristoffelSymbols {
        let gradient = self.potential.gradient_at(x);
        let inverse_metric = self.inverse_metric_at(x);
        let mut partial_g = [[[0.0; 4]; 4]; 4];

        for alpha in 0..4 {
            let d_phi = gradient[alpha];
            let d_phi_over_c_squared = d_phi / (self.c * self.c);

            partial_g[alpha][0][0] = 2.0 * d_phi_over_c_squared;

            for spatial in 1..4 {
                partial_g[alpha][spatial][spatial] = 2.0 * d_phi_over_c_squared;
            }
        }

        let mut gamma = [[[0.0; 4]; 4]; 4];

        for rho in 0..4 {
            for mu in 0..4 {
                for nu in 0..4 {
                    let mut value = 0.0;

                    for sigma in 0..4 {
                        value += inverse_metric.components[rho][sigma]
                            * (partial_g[mu][nu][sigma] + partial_g[nu][mu][sigma]
                                - partial_g[sigma][mu][nu]);
                    }

                    gamma[rho][mu][nu] = 0.5 * value;
                }
            }
        }

        ChristoffelSymbols::new(gamma)
    }
}

impl<P: ScalarPotential> FixedBackgroundMetric for WeakFieldMetric<P> {}

/// A prescribed, non-evolving curved background.
///
/// This is the natural next step after Minkowski transport: particles/rays move
/// through curved spacetime, but their sampled histories do not update the metric.
pub trait FixedBackgroundMetric: MetricField {}

/// Dynamic spacetime metric state.
///
/// Full GR backreaction belongs here, not inside individual particle stepping.
pub trait DynamicMetricField: MetricField {
    fn coordinate_time(&self) -> CoordinateTime;
}

/// Point-query curvature hook for analytic or fixed-background metrics.
///
/// Grid-backed numerical relativity code should use `CurvatureOperator` from
/// the `curvature` module instead.
pub trait PointCurvatureOperator<M: MetricField> {
    fn ricci_tensor_at(&self, metric: &M, x: SpacetimeCoordinate) -> RicciTensor;

    fn ricci_scalar_at(&self, metric: &M, x: SpacetimeCoordinate) -> RicciScalar;

    fn einstein_tensor_at(&self, metric: &M, x: SpacetimeCoordinate) -> EinsteinTensor;
}

/// Trivial curvature operator for exactly flat metrics.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct FlatCurvatureOperator;

impl<M: MetricField> PointCurvatureOperator<M> for FlatCurvatureOperator {
    fn ricci_tensor_at(&self, _metric: &M, _x: SpacetimeCoordinate) -> RicciTensor {
        RicciTensor::ZERO
    }

    fn ricci_scalar_at(&self, _metric: &M, _x: SpacetimeCoordinate) -> RicciScalar {
        RicciScalar::ZERO
    }

    fn einstein_tensor_at(&self, _metric: &M, _x: SpacetimeCoordinate) -> EinsteinTensor {
        EinsteinTensor::ZERO
    }
}
