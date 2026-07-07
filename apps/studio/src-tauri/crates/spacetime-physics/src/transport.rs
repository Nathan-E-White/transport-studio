use crate::{
    AdaptiveGeodesicConfig, AdaptiveGeodesicStepReport, AdaptiveGeodesicStepper, AffineStep,
    ChristoffelSymbols, CovariantTensor2, DiagonalLocalFrame, FourVec, FourVelocity, MetricField,
    MetricFieldTransportExt, PhysicsError, Rk4GeodesicStepper, SpacetimeCoordinate,
    StressEnergyContribution, StressEnergyGrid, TransportGeodesicState,
};

/// Transport-facing context for fixed-background curved Monte Carlo kernels.
#[derive(Debug, Clone, PartialEq)]
pub struct CurvedTransportContext<M> {
    pub metric: M,
    pub affine_step: AffineStep,
    pub invariant_tolerance: f64,
    pub backreaction_policy: BackreactionPolicy,
}

impl<M: MetricField> CurvedTransportContext<M> {
    pub const fn new(metric: M, affine_step: AffineStep) -> Self {
        Self {
            metric,
            affine_step,
            invariant_tolerance: 1.0e-9,
            backreaction_policy: BackreactionPolicy::NONE,
        }
    }

    pub const fn with_backreaction_policy(
        mut self,
        backreaction_policy: BackreactionPolicy,
    ) -> Self {
        self.backreaction_policy = backreaction_policy;
        self
    }

    pub const fn with_invariant_tolerance(mut self, invariant_tolerance: f64) -> Self {
        self.invariant_tolerance = invariant_tolerance;
        self
    }

    pub fn metric_at(&self, x: SpacetimeCoordinate) -> CovariantTensor2 {
        self.metric.covariant_metric_at(x)
    }

    pub fn connection_at(&self, x: SpacetimeCoordinate) -> ChristoffelSymbols {
        self.metric.christoffel_symbols_at(x)
    }

    pub fn local_frame_at(
        &self,
        x: SpacetimeCoordinate,
    ) -> Result<DiagonalLocalFrame, PhysicsError> {
        self.metric.diagonal_local_frame_at(x)
    }

    pub fn invariant(&self, state: TransportGeodesicState) -> f64 {
        state.invariant(&self.metric)
    }

    pub fn step_geodesic(
        &self,
        state: TransportGeodesicState,
    ) -> Result<TransportGeodesicState, PhysicsError> {
        Rk4GeodesicStepper.step_transport_geodesic(&self.metric, state, self.affine_step)
    }

    pub fn step_adaptive_geodesic(
        &self,
        state: TransportGeodesicState,
        config: AdaptiveGeodesicConfig,
    ) -> Result<(TransportGeodesicState, AdaptiveGeodesicStepReport), PhysicsError> {
        AdaptiveGeodesicStepper::new(config).step_transport_geodesic(
            &self.metric,
            state,
            self.affine_step,
        )
    }

    pub fn step_timelike_particle(
        &self,
        x: SpacetimeCoordinate,
        four_velocity: FourVelocity,
        config: AdaptiveGeodesicConfig,
    ) -> Result<(TransportGeodesicState, AdaptiveGeodesicStepReport), PhysicsError> {
        AdaptiveGeodesicStepper::new(config).step_timelike(
            &self.metric,
            x,
            four_velocity,
            self.affine_step,
        )
    }

    pub fn step_null_ray(
        &self,
        x: SpacetimeCoordinate,
        wave_vector: FourVec,
        config: AdaptiveGeodesicConfig,
    ) -> Result<(TransportGeodesicState, AdaptiveGeodesicStepReport), PhysicsError> {
        AdaptiveGeodesicStepper::new(config).step_null(
            &self.metric,
            x,
            wave_vector,
            self.affine_step,
        )
    }

    pub fn deposit_if_enabled(
        &self,
        accumulator: &mut StressEnergyGrid,
        contribution: StressEnergyContribution,
    ) -> Result<Option<usize>, PhysicsError> {
        if self.backreaction_policy.updates_metric()
            || matches!(
                self.backreaction_policy.channel,
                BackreactionChannel::MaterialState | BackreactionChannel::RadiationHydrodynamics
            )
        {
            return accumulator.deposit_nearest(contribution).map(Some);
        }

        Ok(None)
    }
}

/// Where particle/radiation histories feed back into the rest of the problem.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum BackreactionChannel {
    None,
    MaterialState,
    RadiationHydrodynamics,
    StressEnergyMetricEvolution,
}

/// Explicit policy for whether particles only sample a background or source it.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct BackreactionPolicy {
    pub channel: BackreactionChannel,
}

impl BackreactionPolicy {
    pub const NONE: Self = Self {
        channel: BackreactionChannel::None,
    };

    pub const MATERIAL: Self = Self {
        channel: BackreactionChannel::MaterialState,
    };

    pub const RAD_HYDRO: Self = Self {
        channel: BackreactionChannel::RadiationHydrodynamics,
    };

    pub const DYNAMIC_SPACETIME: Self = Self {
        channel: BackreactionChannel::StressEnergyMetricEvolution,
    };

    pub const fn new(channel: BackreactionChannel) -> Self {
        Self { channel }
    }

    pub const fn updates_metric(self) -> bool {
        matches!(
            self.channel,
            BackreactionChannel::StressEnergyMetricEvolution
        )
    }
}
