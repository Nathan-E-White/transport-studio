use std::ops::{Add, Div, Mul, Neg, Sub};

/// Coordinate time in a chosen frame.
///
/// In Galilean mechanics this is the universal absolute time. In relativistic
/// mechanics this is frame-dependent lab/coordinate time.
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd)]
pub struct CoordinateTime {
    seconds: f64,
}

impl CoordinateTime {
    pub const ZERO: Self = Self { seconds: 0.0 };

    pub const fn from_seconds(seconds: f64) -> Self {
        Self { seconds }
    }

    pub const fn seconds(self) -> f64 {
        self.seconds
    }
}

/// Elapsed coordinate time in a chosen frame.
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd)]
pub struct TimeDuration {
    seconds: f64,
}

impl TimeDuration {
    pub const ZERO: Self = Self { seconds: 0.0 };

    pub const fn from_seconds(seconds: f64) -> Self {
        Self { seconds }
    }

    pub const fn seconds(self) -> f64 {
        self.seconds
    }

    pub fn abs(self) -> Self {
        Self::from_seconds(self.seconds.abs())
    }
}

impl Add<TimeDuration> for CoordinateTime {
    type Output = CoordinateTime;

    fn add(self, rhs: TimeDuration) -> Self::Output {
        CoordinateTime::from_seconds(self.seconds + rhs.seconds)
    }
}

impl Sub<TimeDuration> for CoordinateTime {
    type Output = CoordinateTime;

    fn sub(self, rhs: TimeDuration) -> Self::Output {
        CoordinateTime::from_seconds(self.seconds - rhs.seconds)
    }
}

impl Sub<CoordinateTime> for CoordinateTime {
    type Output = TimeDuration;

    fn sub(self, rhs: CoordinateTime) -> Self::Output {
        TimeDuration::from_seconds(self.seconds - rhs.seconds)
    }
}

impl Add for TimeDuration {
    type Output = TimeDuration;

    fn add(self, rhs: TimeDuration) -> Self::Output {
        TimeDuration::from_seconds(self.seconds + rhs.seconds)
    }
}

impl Sub for TimeDuration {
    type Output = TimeDuration;

    fn sub(self, rhs: TimeDuration) -> Self::Output {
        TimeDuration::from_seconds(self.seconds - rhs.seconds)
    }
}

impl Mul<f64> for TimeDuration {
    type Output = TimeDuration;

    fn mul(self, rhs: f64) -> Self::Output {
        TimeDuration::from_seconds(self.seconds * rhs)
    }
}

impl Div<f64> for TimeDuration {
    type Output = TimeDuration;

    fn div(self, rhs: f64) -> Self::Output {
        TimeDuration::from_seconds(self.seconds / rhs)
    }
}

impl Neg for TimeDuration {
    type Output = TimeDuration;

    fn neg(self) -> Self::Output {
        TimeDuration::from_seconds(-self.seconds)
    }
}

/// Proper time measured by a clock comoving with a massive particle/object.
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd)]
pub struct ProperTime {
    seconds: f64,
}

impl ProperTime {
    pub const ZERO: Self = Self { seconds: 0.0 };

    pub const fn from_seconds(seconds: f64) -> Self {
        Self { seconds }
    }

    pub const fn seconds(self) -> f64 {
        self.seconds
    }
}

/// Elapsed proper time along a timelike worldline.
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd)]
pub struct ProperDuration {
    seconds: f64,
}

impl ProperDuration {
    pub const ZERO: Self = Self { seconds: 0.0 };

    pub const fn from_seconds(seconds: f64) -> Self {
        Self { seconds }
    }

    pub const fn seconds(self) -> f64 {
        self.seconds
    }
}

impl Add<ProperDuration> for ProperTime {
    type Output = ProperTime;

    fn add(self, rhs: ProperDuration) -> Self::Output {
        ProperTime::from_seconds(self.seconds + rhs.seconds)
    }
}

impl Sub<ProperDuration> for ProperTime {
    type Output = ProperTime;

    fn sub(self, rhs: ProperDuration) -> Self::Output {
        ProperTime::from_seconds(self.seconds - rhs.seconds)
    }
}

impl Sub<ProperTime> for ProperTime {
    type Output = ProperDuration;

    fn sub(self, rhs: ProperTime) -> Self::Output {
        ProperDuration::from_seconds(self.seconds - rhs.seconds)
    }
}

impl Add for ProperDuration {
    type Output = ProperDuration;

    fn add(self, rhs: ProperDuration) -> Self::Output {
        ProperDuration::from_seconds(self.seconds + rhs.seconds)
    }
}

impl Sub for ProperDuration {
    type Output = ProperDuration;

    fn sub(self, rhs: ProperDuration) -> Self::Output {
        ProperDuration::from_seconds(self.seconds - rhs.seconds)
    }
}

impl Mul<f64> for ProperDuration {
    type Output = ProperDuration;

    fn mul(self, rhs: f64) -> Self::Output {
        ProperDuration::from_seconds(self.seconds * rhs)
    }
}

impl Div<f64> for ProperDuration {
    type Output = ProperDuration;

    fn div(self, rhs: f64) -> Self::Output {
        ProperDuration::from_seconds(self.seconds / rhs)
    }
}
