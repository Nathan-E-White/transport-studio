use crate::vec3::{self, Vec3};
use crate::{
    CovariantTensor2, FourVec, FourVelocity, MetricField, PhysicsError, SpacetimeCoordinate,
};

/// Geodesic state for a transported particle/ray in a fixed or dynamic metric.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct GeodesicState {
    pub x: SpacetimeCoordinate,
    pub four_velocity: FourVelocity,
}

impl GeodesicState {
    pub const fn new(x: SpacetimeCoordinate, four_velocity: FourVelocity) -> Self {
        Self { x, four_velocity }
    }
}

/// Affine-parameter step used for geodesic integration.
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd)]
pub struct AffineStep {
    pub value: f64,
}

impl AffineStep {
    pub const fn new(value: f64) -> Self {
        Self { value }
    }

    pub const fn abs(self) -> Self {
        Self {
            value: if self.value < 0.0 {
                -self.value
            } else {
                self.value
            },
        }
    }
}

/// Advances a geodesic through a supplied metric field.
pub trait GeodesicStepper<M: MetricField> {
    fn step_geodesic(
        &self,
        metric: &M,
        state: GeodesicState,
        d_lambda: AffineStep,
    ) -> Result<GeodesicState, PhysicsError>;
}

/// First-order explicit geodesic stepper.
///
/// This is intentionally simple and should be treated as scaffolding. It makes
/// the geodesic interface executable while leaving room for RK4, symplectic, or
/// adaptive integrators later.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct EulerGeodesicStepper;

impl<M: MetricField> GeodesicStepper<M> for EulerGeodesicStepper {
    fn step_geodesic(
        &self,
        metric: &M,
        state: GeodesicState,
        d_lambda: AffineStep,
    ) -> Result<GeodesicState, PhysicsError> {
        let gamma = metric.christoffel_symbols_at(state.x);
        let u = state.four_velocity.to_four_vec();
        let u_components = [u.ct, u.spatial.x, u.spatial.y, u.spatial.z];
        let mut du = [0.0; 4];

        for rho in 0..4 {
            let mut acceleration = 0.0;

            for mu in 0..4 {
                for nu in 0..4 {
                    acceleration -=
                        gamma.components[rho][mu][nu] * u_components[mu] * u_components[nu];
                }
            }

            du[rho] = acceleration * d_lambda.value;
        }

        let next_u = FourVelocity {
            temporal: u_components[0] + du[0],
            spatial: vec3::new(
                u_components[1] + du[1],
                u_components[2] + du[2],
                u_components[3] + du[3],
            ),
        };

        let next_x = SpacetimeCoordinate::new(
            [
                state.x.components[0] + u_components[0] * d_lambda.value,
                state.x.components[1] + u_components[1] * d_lambda.value,
                state.x.components[2] + u_components[2] * d_lambda.value,
                state.x.components[3] + u_components[3] * d_lambda.value,
            ],
            state.x.chart,
        );

        Ok(GeodesicState::new(next_x, next_u))
    }
}

/// Transport trajectory type used to distinguish massive particles from null rays.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GeodesicKind {
    Timelike,
    Null,
}

/// Geodesic state for transport kernels.
///
/// The tangent stores dx^μ/dλ. For massive particles λ is usually proper time;
/// for photons and other rays it is an affine parameter.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct TransportGeodesicState {
    pub x: SpacetimeCoordinate,
    pub tangent: FourVec,
    pub kind: GeodesicKind,
}

impl TransportGeodesicState {
    pub const fn new(x: SpacetimeCoordinate, tangent: FourVec, kind: GeodesicKind) -> Self {
        Self { x, tangent, kind }
    }

    pub const fn timelike(x: SpacetimeCoordinate, four_velocity: FourVelocity) -> Self {
        Self {
            x,
            tangent: FourVec::new(four_velocity.temporal, four_velocity.spatial),
            kind: GeodesicKind::Timelike,
        }
    }

    pub const fn null(x: SpacetimeCoordinate, wave_vector: FourVec) -> Self {
        Self {
            x,
            tangent: wave_vector,
            kind: GeodesicKind::Null,
        }
    }

    pub fn invariant<M: MetricField>(self, metric: &M) -> f64 {
        metric.quadratic_form_at(self.x, self.tangent)
    }

    pub fn invariant_error<M: MetricField>(self, metric: &M, expected_timelike_norm: f64) -> f64 {
        let expected = match self.kind {
            GeodesicKind::Timelike => expected_timelike_norm,
            GeodesicKind::Null => 0.0,
        };

        (self.invariant(metric) - expected).abs()
    }

    pub fn expected_invariant<M: MetricField>(self, metric: &M) -> f64 {
        match self.kind {
            GeodesicKind::Timelike => self.invariant(metric),
            GeodesicKind::Null => 0.0,
        }
    }
}

/// Metric diagnostics and transport helpers.
pub trait MetricFieldTransportExt: MetricField {
    fn quadratic_form_at(&self, x: SpacetimeCoordinate, vector: FourVec) -> f64 {
        let metric = self.covariant_metric_at(x);
        let components = vector.components();
        let mut value = 0.0;

        for mu in 0..4 {
            for nu in 0..4 {
                value += metric.components[mu][nu] * components[mu] * components[nu];
            }
        }

        value
    }

    fn covariant_components_at(&self, x: SpacetimeCoordinate, vector: FourVec) -> [f64; 4] {
        let metric = self.covariant_metric_at(x);
        let components = vector.components();
        let mut lowered = [0.0; 4];

        for mu in 0..4 {
            for nu in 0..4 {
                lowered[mu] += metric.components[mu][nu] * components[nu];
            }
        }

        lowered
    }

    fn diagonal_local_frame_at(
        &self,
        x: SpacetimeCoordinate,
    ) -> Result<DiagonalLocalFrame, PhysicsError> {
        DiagonalLocalFrame::from_metric(self.covariant_metric_at(x))
    }
}

impl<T: MetricField> MetricFieldTransportExt for T {}

/// Diagonal local frame scale factors for simple metric-aware transport.
///
/// This is intentionally conservative: it only accepts diagonal metrics with
/// one positive temporal component and negative spatial components.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct DiagonalLocalFrame {
    pub temporal_scale: f64,
    pub spatial_scale: Vec3,
}

impl DiagonalLocalFrame {
    pub fn from_metric(metric: CovariantTensor2) -> Result<Self, PhysicsError> {
        for mu in 0..4 {
            for nu in 0..4 {
                if mu != nu && metric.components[mu][nu].abs() > 1.0e-12 {
                    return Err(PhysicsError::SingularMetric);
                }
            }
        }

        let g00 = metric.components[0][0];
        let g11 = metric.components[1][1];
        let g22 = metric.components[2][2];
        let g33 = metric.components[3][3];

        if g00 <= 0.0 || g11 >= 0.0 || g22 >= 0.0 || g33 >= 0.0 {
            return Err(PhysicsError::SingularMetric);
        }

        Ok(Self {
            temporal_scale: g00.sqrt(),
            spatial_scale: vec3::new((-g11).sqrt(), (-g22).sqrt(), (-g33).sqrt()),
        })
    }

    pub fn coordinate_to_local_components(self, vector: FourVec) -> FourVec {
        FourVec::new(
            vector.ct * self.temporal_scale,
            vec3::new(
                vector.spatial.x * self.spatial_scale.x,
                vector.spatial.y * self.spatial_scale.y,
                vector.spatial.z * self.spatial_scale.z,
            ),
        )
    }
}

fn geodesic_rhs<M: MetricField>(metric: &M, state: TransportGeodesicState) -> ([f64; 4], [f64; 4]) {
    let gamma = metric.christoffel_symbols_at(state.x);
    let tangent = state.tangent.components();
    let mut acceleration = [0.0; 4];

    for rho in 0..4 {
        for mu in 0..4 {
            for nu in 0..4 {
                acceleration[rho] -= gamma.components[rho][mu][nu] * tangent[mu] * tangent[nu];
            }
        }
    }

    (tangent, acceleration)
}

fn offset_transport_state(
    state: TransportGeodesicState,
    dx: [f64; 4],
    du: [f64; 4],
    scale: f64,
) -> TransportGeodesicState {
    let tangent = state.tangent.components();
    let mut next_x = state.x.components;
    let mut next_tangent = tangent;

    for i in 0..4 {
        next_x[i] += dx[i] * scale;
        next_tangent[i] += du[i] * scale;
    }

    TransportGeodesicState::new(
        SpacetimeCoordinate::new(next_x, state.x.chart),
        FourVec::from_components(next_tangent),
        state.kind,
    )
}

/// Fourth-order Runge-Kutta geodesic stepper for transport trajectories.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Rk4GeodesicStepper;

impl Rk4GeodesicStepper {
    pub fn step_transport_geodesic<M: MetricField>(
        self,
        metric: &M,
        state: TransportGeodesicState,
        d_lambda: AffineStep,
    ) -> Result<TransportGeodesicState, PhysicsError> {
        if !d_lambda.value.is_finite() || d_lambda.value == 0.0 {
            return Err(PhysicsError::InvalidStep);
        }

        let h = d_lambda.value;
        let (k1_x, k1_u) = geodesic_rhs(metric, state);
        let (k2_x, k2_u) = geodesic_rhs(metric, offset_transport_state(state, k1_x, k1_u, 0.5 * h));
        let (k3_x, k3_u) = geodesic_rhs(metric, offset_transport_state(state, k2_x, k2_u, 0.5 * h));
        let (k4_x, k4_u) = geodesic_rhs(metric, offset_transport_state(state, k3_x, k3_u, h));
        let mut next_x = state.x.components;
        let mut next_tangent = state.tangent.components();

        for i in 0..4 {
            next_x[i] += h * (k1_x[i] + 2.0 * k2_x[i] + 2.0 * k3_x[i] + k4_x[i]) / 6.0;
            next_tangent[i] += h * (k1_u[i] + 2.0 * k2_u[i] + 2.0 * k3_u[i] + k4_u[i]) / 6.0;

            if !next_x[i].is_finite() || !next_tangent[i].is_finite() {
                return Err(PhysicsError::NonFiniteValue);
            }
        }

        Ok(TransportGeodesicState::new(
            SpacetimeCoordinate::new(next_x, state.x.chart),
            FourVec::from_components(next_tangent),
            state.kind,
        ))
    }
}

/// Adaptive RK4 geodesic integration controls.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct AdaptiveGeodesicConfig {
    pub tolerance: f64,
    pub invariant_tolerance: f64,
    pub min_step: AffineStep,
    pub max_step: AffineStep,
    pub max_substeps: usize,
    pub safety_factor: f64,
    pub min_scale: f64,
    pub max_scale: f64,
}

impl AdaptiveGeodesicConfig {
    pub const DEFAULT: Self = Self {
        tolerance: 1.0e-9,
        invariant_tolerance: 1.0e-7,
        min_step: AffineStep::new(1.0e-12),
        max_step: AffineStep::new(f64::INFINITY),
        max_substeps: 10_000,
        safety_factor: 0.9,
        min_scale: 0.2,
        max_scale: 4.0,
    };

    pub const fn new(tolerance: f64, invariant_tolerance: f64) -> Self {
        Self {
            tolerance,
            invariant_tolerance,
            ..Self::DEFAULT
        }
    }
}

/// Diagnostic metadata for an adaptive geodesic step.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct AdaptiveGeodesicStepReport {
    pub requested_step: AffineStep,
    pub accepted_substeps: usize,
    pub rejected_substeps: usize,
    pub estimated_error: f64,
    pub invariant_error: f64,
}

/// Adaptive fourth-order Runge-Kutta geodesic stepper using step doubling.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct AdaptiveGeodesicStepper {
    pub config: AdaptiveGeodesicConfig,
}

impl AdaptiveGeodesicStepper {
    pub const DEFAULT: Self = Self {
        config: AdaptiveGeodesicConfig::DEFAULT,
    };

    pub const fn new(config: AdaptiveGeodesicConfig) -> Self {
        Self { config }
    }

    pub fn step_timelike<M: MetricField>(
        self,
        metric: &M,
        x: SpacetimeCoordinate,
        four_velocity: FourVelocity,
        d_lambda: AffineStep,
    ) -> Result<(TransportGeodesicState, AdaptiveGeodesicStepReport), PhysicsError> {
        self.step_transport_geodesic(
            metric,
            TransportGeodesicState::timelike(x, four_velocity),
            d_lambda,
        )
    }

    pub fn step_null<M: MetricField>(
        self,
        metric: &M,
        x: SpacetimeCoordinate,
        wave_vector: FourVec,
        d_lambda: AffineStep,
    ) -> Result<(TransportGeodesicState, AdaptiveGeodesicStepReport), PhysicsError> {
        self.step_transport_geodesic(
            metric,
            TransportGeodesicState::null(x, wave_vector),
            d_lambda,
        )
    }

    pub fn step_transport_geodesic<M: MetricField>(
        self,
        metric: &M,
        state: TransportGeodesicState,
        d_lambda: AffineStep,
    ) -> Result<(TransportGeodesicState, AdaptiveGeodesicStepReport), PhysicsError> {
        self.validate()?;
        validate_step(d_lambda)?;

        let requested = d_lambda.value;
        let direction = requested.signum();
        let expected_invariant = state.expected_invariant(metric);
        let mut remaining = requested.abs();
        let mut step = remaining.min(self.config.max_step.abs().value);
        let mut current = state;
        let mut accepted = 0;
        let mut rejected = 0;
        let mut max_error = 0.0;

        while remaining > 0.0 {
            if accepted + rejected >= self.config.max_substeps {
                return Err(PhysicsError::InvalidStep);
            }

            let candidate_step = step.min(remaining) * direction;
            let full = Rk4GeodesicStepper.step_transport_geodesic(
                metric,
                current,
                AffineStep::new(candidate_step),
            )?;
            let half_step = AffineStep::new(0.5 * candidate_step);
            let half = Rk4GeodesicStepper.step_transport_geodesic(metric, current, half_step)?;
            let half = Rk4GeodesicStepper.step_transport_geodesic(metric, half, half_step)?;
            let error = transport_state_error(full, half);
            let invariant_error = half.invariant_error(metric, expected_invariant);
            let accepted_by_error = error <= self.config.tolerance
                && invariant_error <= self.config.invariant_tolerance;

            if accepted_by_error || step <= self.config.min_step.abs().value {
                if !accepted_by_error && step <= self.config.min_step.abs().value {
                    return Err(PhysicsError::InvalidStep);
                }

                current = half;
                remaining -= candidate_step.abs();
                accepted += 1;
                max_error = f64::max(max_error, error);
            } else {
                rejected += 1;
            }

            let scale = next_step_scale(error, self.config);
            step = (step * scale)
                .max(self.config.min_step.abs().value)
                .min(self.config.max_step.abs().value)
                .min(remaining.max(self.config.min_step.abs().value));
        }

        let invariant_error = current.invariant_error(metric, expected_invariant);
        Ok((
            current,
            AdaptiveGeodesicStepReport {
                requested_step: d_lambda,
                accepted_substeps: accepted,
                rejected_substeps: rejected,
                estimated_error: max_error,
                invariant_error,
            },
        ))
    }

    fn validate(self) -> Result<(), PhysicsError> {
        if !self.config.tolerance.is_finite()
            || self.config.tolerance <= 0.0
            || !self.config.invariant_tolerance.is_finite()
            || self.config.invariant_tolerance < 0.0
            || !self.config.min_step.value.is_finite()
            || self.config.min_step.value <= 0.0
            || self.config.max_step.value <= 0.0
            || self.config.max_substeps == 0
            || !self.config.safety_factor.is_finite()
            || self.config.safety_factor <= 0.0
            || !self.config.min_scale.is_finite()
            || !self.config.max_scale.is_finite()
            || self.config.min_scale <= 0.0
            || self.config.max_scale < self.config.min_scale
        {
            return Err(PhysicsError::InvalidStep);
        }

        Ok(())
    }
}

fn validate_step(d_lambda: AffineStep) -> Result<(), PhysicsError> {
    if !d_lambda.value.is_finite() || d_lambda.value == 0.0 {
        return Err(PhysicsError::InvalidStep);
    }

    Ok(())
}

fn transport_state_error(lhs: TransportGeodesicState, rhs: TransportGeodesicState) -> f64 {
    let lhs_x = lhs.x.components;
    let rhs_x = rhs.x.components;
    let lhs_u = lhs.tangent.components();
    let rhs_u = rhs.tangent.components();
    let mut error = 0.0;

    for i in 0..4 {
        error = f64::max(error, (lhs_x[i] - rhs_x[i]).abs());
        error = f64::max(error, (lhs_u[i] - rhs_u[i]).abs());
    }

    error
}

fn next_step_scale(error: f64, config: AdaptiveGeodesicConfig) -> f64 {
    if error == 0.0 {
        return config.max_scale;
    }

    (config.safety_factor * (config.tolerance / error).powf(0.2))
        .max(config.min_scale)
        .min(config.max_scale)
}

impl<M: MetricField> GeodesicStepper<M> for Rk4GeodesicStepper {
    fn step_geodesic(
        &self,
        metric: &M,
        state: GeodesicState,
        d_lambda: AffineStep,
    ) -> Result<GeodesicState, PhysicsError> {
        let transport_state = TransportGeodesicState::timelike(state.x, state.four_velocity);
        let next = self.step_transport_geodesic(metric, transport_state, d_lambda)?;

        Ok(GeodesicState::new(
            next.x,
            FourVelocity {
                temporal: next.tangent.ct,
                spatial: next.tangent.spatial,
            },
        ))
    }
}
