use crate::vec3::{self, Vec3};
use crate::{CoordinateTime, FourVec, PhysicsError, ProperDuration, TimeDuration};

/// Classical spacetime event.
///
/// Galilean mechanics treats time as absolute and transforms positions as:
/// r' = r - u t.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct GalileanEvent {
    pub t: CoordinateTime,
    pub r: Vec3,
}

impl GalileanEvent {
    pub const fn new(t: CoordinateTime, r: Vec3) -> Self {
        Self { t, r }
    }
}

/// Galilean inertial-frame boost by relative frame velocity.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct GalileanBoost {
    pub velocity: Vec3,
}

impl GalileanBoost {
    pub const fn new(velocity: Vec3) -> Self {
        Self { velocity }
    }

    pub fn transform_event(self, event: GalileanEvent) -> GalileanEvent {
        GalileanEvent {
            t: event.t,
            r: event.r - self.velocity * event.t.seconds(),
        }
    }

    pub fn transform_velocity(self, velocity: Vec3) -> Vec3 {
        velocity - self.velocity
    }
}

/// Lorentz boost for four-vectors under the (+---) convention.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct LorentzBoost {
    pub velocity: Vec3,
    pub c: f64,
}

impl LorentzBoost {
    pub fn new(velocity: Vec3, c: f64) -> Result<Self, PhysicsError> {
        if c <= 0.0 {
            return Err(PhysicsError::SpeedOfLightMustBePositive);
        }

        if velocity.norm_squared() >= c * c {
            return Err(PhysicsError::SuperluminalBoost);
        }

        Ok(Self { velocity, c })
    }

    pub fn beta(self) -> Vec3 {
        self.velocity / self.c
    }

    pub fn beta_squared(self) -> f64 {
        self.beta().norm_squared()
    }

    pub fn gamma(self) -> f64 {
        1.0 / (1.0 - self.beta_squared()).sqrt()
    }

    pub fn transform_four_vector(self, x: FourVec) -> FourVec {
        let beta = self.beta();
        let beta_squared = beta.norm_squared();

        if beta_squared == 0.0 {
            return x;
        }

        let gamma = self.gamma();
        let beta_dot_r = beta.dot(x.spatial);

        let ct_prime = gamma * (x.ct - beta_dot_r);
        let spatial_prime =
            x.spatial + beta * (((gamma - 1.0) * beta_dot_r / beta_squared) - gamma * x.ct);

        FourVec::new(ct_prime, spatial_prime)
    }
}

/// Event in a chosen coordinate frame.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct WorldlineEvent {
    pub t: CoordinateTime,
    pub r: Vec3,
}

impl WorldlineEvent {
    pub const fn new(t: CoordinateTime, r: Vec3) -> Self {
        Self { t, r }
    }

    pub fn to_four_vec(self, c: f64) -> FourVec {
        FourVec::from_time_and_position(c, self.t, self.r)
    }

    pub fn displacement_to(self, other: Self) -> SpacetimeDisplacement {
        SpacetimeDisplacement {
            dt: other.t - self.t,
            dr: other.r - self.r,
        }
    }
}

/// Coordinate-frame displacement between two spacetime events.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct SpacetimeDisplacement {
    pub dt: TimeDuration,
    pub dr: Vec3,
}

impl SpacetimeDisplacement {
    pub const fn new(dt: TimeDuration, dr: Vec3) -> Self {
        Self { dt, dr }
    }

    pub fn to_four_vec(self, c: f64) -> FourVec {
        FourVec::new(c * self.dt.seconds(), self.dr)
    }

    pub fn coordinate_velocity(self) -> Option<Vec3> {
        let dt = self.dt.seconds();

        if dt == 0.0 { None } else { Some(self.dr / dt) }
    }

    pub fn coordinate_speed(self) -> Option<f64> {
        self.coordinate_velocity().map(vec3::norm)
    }

    pub fn interval_squared(self, c: f64) -> Result<f64, PhysicsError> {
        if c <= 0.0 {
            return Err(PhysicsError::SpeedOfLightMustBePositive);
        }

        let ct = c * self.dt.seconds();
        Ok(ct * ct - self.dr.norm_squared())
    }

    pub fn proper_duration(self, c: f64) -> Result<ProperDuration, PhysicsError> {
        let interval_squared = self.interval_squared(c)?;

        if interval_squared < 0.0 {
            return Err(PhysicsError::SpacelikeInterval);
        }

        Ok(ProperDuration::from_seconds(interval_squared.sqrt() / c))
    }
}

/// Finite piece of a particle/object worldline between two events.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct WorldlineSegment {
    pub start: WorldlineEvent,
    pub end: WorldlineEvent,
}

impl WorldlineSegment {
    pub const fn new(start: WorldlineEvent, end: WorldlineEvent) -> Self {
        Self { start, end }
    }

    pub fn displacement(self) -> SpacetimeDisplacement {
        self.start.displacement_to(self.end)
    }

    pub fn coordinate_duration(self) -> TimeDuration {
        self.end.t - self.start.t
    }

    pub fn spatial_displacement(self) -> Vec3 {
        self.end.r - self.start.r
    }

    pub fn coordinate_velocity(self) -> Option<Vec3> {
        self.displacement().coordinate_velocity()
    }

    pub fn proper_duration(self, c: f64) -> Result<ProperDuration, PhysicsError> {
        self.displacement().proper_duration(c)
    }
}

/// Lorentz factor γ = 1 / sqrt(1 - v²/c²).
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd)]
pub struct LorentzFactor {
    gamma: f64,
}

impl LorentzFactor {
    pub fn from_speed(speed: f64, c: f64) -> Result<Self, PhysicsError> {
        if c <= 0.0 {
            return Err(PhysicsError::SpeedOfLightMustBePositive);
        }

        if speed >= c {
            return Err(PhysicsError::SuperluminalBoost);
        }

        let beta_squared = speed * speed / (c * c);
        Ok(Self {
            gamma: 1.0 / (1.0 - beta_squared).sqrt(),
        })
    }

    pub fn from_velocity(velocity: Vec3, c: f64) -> Result<Self, PhysicsError> {
        Self::from_speed(velocity.norm(), c)
    }

    pub const fn value(self) -> f64 {
        self.gamma
    }

    pub fn coordinate_to_proper_duration(self, dt: TimeDuration) -> ProperDuration {
        ProperDuration::from_seconds(dt.seconds() / self.gamma)
    }

    pub fn proper_to_coordinate_duration(self, d_tau: ProperDuration) -> TimeDuration {
        TimeDuration::from_seconds(d_tau.seconds() * self.gamma)
    }
}

/// Relativistic four-velocity U = γ(c, v), using the (+---) convention.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct FourVelocity {
    pub temporal: f64,
    pub spatial: Vec3,
}

impl FourVelocity {
    pub fn from_velocity(velocity: Vec3, c: f64) -> Result<Self, PhysicsError> {
        let gamma = LorentzFactor::from_velocity(velocity, c)?.value();

        Ok(Self {
            temporal: gamma * c,
            spatial: velocity * gamma,
        })
    }

    pub fn minkowski_norm_squared(self) -> f64 {
        self.temporal * self.temporal - self.spatial.norm_squared()
    }

    pub fn to_four_vec(self) -> FourVec {
        FourVec::new(self.temporal, self.spatial)
    }
}

/// Explicit metric object for Euclidean 3-space.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct EuclideanMetric;

impl EuclideanMetric {
    pub fn inner(self, lhs: Vec3, rhs: Vec3) -> f64 {
        lhs.dot(rhs)
    }
}

/// Explicit metric object for Minkowski spacetime with signature (+---).
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct MinkowskiMetricPlusMinusMinusMinus;

impl MinkowskiMetricPlusMinusMinusMinus {
    pub fn inner(self, lhs: FourVec, rhs: FourVec) -> f64 {
        lhs.minkowski_dot(rhs)
    }
}
