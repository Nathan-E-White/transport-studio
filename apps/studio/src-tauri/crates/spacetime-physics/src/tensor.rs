use std::ops::{Add, Mul, Sub};

use serde::{Deserialize, Serialize};

use crate::vec3::{self, Vec3};
use crate::{CoordinateTime, PhysicsError};

#[derive(Debug, Copy, Clone, PartialEq, PartialOrd, Default, Serialize, Deserialize)]
pub struct Vec3D<T> {
    pub data: [T; 3],
}

/// Rank-2 spatial tensor over a 3D slice.
#[derive(Debug, Copy, Clone, PartialEq, Serialize, Deserialize)]
pub struct SpatialTensor2 {
    pub components: [[f64; 3]; 3],
}

impl SpatialTensor2 {
    pub const ZERO: Self = Self {
        components: [[0.0; 3]; 3],
    };

    pub const IDENTITY: Self = Self {
        components: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
    };

    pub const fn new(components: [[f64; 3]; 3]) -> Self {
        Self { components }
    }

    pub const fn component(self, i: usize, j: usize) -> f64 {
        self.components[i][j]
    }

    pub fn trace(self) -> f64 {
        self.components[0][0] + self.components[1][1] + self.components[2][2]
    }

    pub fn determinant(self) -> f64 {
        let m = self.components;

        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
            - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    }

    pub fn trace_with_inverse(self, inverse_metric: Self) -> f64 {
        let mut trace = 0.0;

        for i in 0..3 {
            for j in 0..3 {
                trace += inverse_metric.components[i][j] * self.components[i][j];
            }
        }

        trace
    }
}

/// Symmetric rank-2 spatial tensor used for gamma_ij, K_ij, and A_ij.
#[derive(Debug, Copy, Clone, PartialEq, Serialize, Deserialize)]
pub struct SymmetricSpatialTensor2 {
    pub components: [[f64; 3]; 3],
}

impl SymmetricSpatialTensor2 {
    pub const ZERO: Self = Self {
        components: [[0.0; 3]; 3],
    };

    pub const IDENTITY: Self = Self {
        components: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
    };

    pub const fn new(components: [[f64; 3]; 3]) -> Self {
        Self { components }
    }

    pub const fn diagonal(xx: f64, yy: f64, zz: f64) -> Self {
        Self {
            components: [[xx, 0.0, 0.0], [0.0, yy, 0.0], [0.0, 0.0, zz]],
        }
    }

    pub const fn component(self, i: usize, j: usize) -> f64 {
        self.components[i][j]
    }

    pub const fn to_full(self) -> SpatialTensor2 {
        SpatialTensor2::new(self.components)
    }

    pub fn determinant(self) -> f64 {
        self.to_full().determinant()
    }

    pub fn trace(self) -> f64 {
        self.to_full().trace()
    }
}

/// Dense packed vector representation useful for interop, arrays,
/// serialization, and eventual SIMD/GPU-facing paths.
#[derive(Debug, Copy, Clone, PartialEq, Serialize, Deserialize)]
pub struct Vec3Packed {
    pub data: [f64; 3],
}

impl Vec3Packed {
    pub const fn new(data: [f64; 3]) -> Self {
        Self { data }
    }

    pub const fn to_vec3(self) -> Vec3 {
        Vec3 {
            x: self.data[0],
            y: self.data[1],
            z: self.data[2],
        }
    }
}

impl From<Vec3> for [f64; 3] {
    fn from(value: Vec3) -> Self {
        [value.x, value.y, value.z]
    }
}

impl Mul<Vec3> for f64 {
    type Output = Vec3;

    fn mul(self, rhs: Vec3) -> Self::Output {
        rhs * self
    }
}

/// Spacetime four-vector using coordinates (ct, x, y, z).
///
/// Metric convention is (+---):
/// s² = (ct)² - x² - y² - z².
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct FourVec {
    pub ct: f64,
    pub spatial: Vec3,
}

impl FourVec {
    pub const fn new(ct: f64, spatial: Vec3) -> Self {
        Self { ct, spatial }
    }

    pub const fn from_components(components: [f64; 4]) -> Self {
        Self {
            ct: components[0],
            spatial: vec3::new(components[1], components[2], components[3]),
        }
    }

    pub const fn components(self) -> [f64; 4] {
        [self.ct, self.spatial.x, self.spatial.y, self.spatial.z]
    }

    pub fn from_time_and_position(c: f64, t: CoordinateTime, r: Vec3) -> Self {
        Self {
            ct: c * t.seconds(),
            spatial: r,
        }
    }

    pub fn coordinate_time(self, c: f64) -> Result<CoordinateTime, PhysicsError> {
        if c <= 0.0 {
            return Err(PhysicsError::SpeedOfLightMustBePositive);
        }

        Ok(CoordinateTime::from_seconds(self.ct / c))
    }

    pub fn minkowski_dot(self, other: Self) -> f64 {
        self.ct * other.ct - self.spatial.dot(other.spatial)
    }

    pub fn interval_squared(self) -> f64 {
        self.minkowski_dot(self)
    }

    pub fn is_timelike(self) -> bool {
        self.interval_squared() > 0.0
    }

    pub fn is_spacelike(self) -> bool {
        self.interval_squared() < 0.0
    }

    pub fn is_lightlike(self, tolerance: f64) -> bool {
        self.interval_squared().abs() <= tolerance
    }
}

impl Add for FourVec {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Self::new(self.ct + rhs.ct, self.spatial + rhs.spatial)
    }
}

impl Sub for FourVec {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self::Output {
        Self::new(self.ct - rhs.ct, self.spatial - rhs.spatial)
    }
}

impl Mul<f64> for FourVec {
    type Output = Self;

    fn mul(self, rhs: f64) -> Self::Output {
        Self::new(self.ct * rhs, self.spatial * rhs)
    }
}

/// Coordinate index for a 3+1 spacetime quantity.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum SpacetimeIndex {
    T,
    X,
    Y,
    Z,
}

impl SpacetimeIndex {
    pub const fn as_usize(self) -> usize {
        match self {
            Self::T => 0,
            Self::X => 1,
            Self::Y => 2,
            Self::Z => 3,
        }
    }
}

/// Coordinate-system marker for spacetime models.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum CoordinateChartKind {
    Cartesian,
    Spherical,
    Cylindrical,
    Curvilinear,
    ProblemSpecific,
}

/// A spacetime coordinate x^μ.
///
/// Coordinates are stored as [t, x1, x2, x3]. Whether t is coordinate time,
/// ct, conformal time, or another chart-specific coordinate is determined by
/// the associated metric/chart model.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct SpacetimeCoordinate {
    pub components: [f64; 4],
    pub chart: CoordinateChartKind,
}

impl SpacetimeCoordinate {
    pub const fn new(components: [f64; 4], chart: CoordinateChartKind) -> Self {
        Self { components, chart }
    }

    pub fn component(self, index: SpacetimeIndex) -> f64 {
        self.components[index.as_usize()]
    }
}

/// Rank-2 covariant tensor in 3+1 spacetime.
///
/// Useful for metrics g_μν and stress-energy tensors T_μν.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct CovariantTensor2 {
    pub components: [[f64; 4]; 4],
}

impl CovariantTensor2 {
    pub const ZERO: Self = Self {
        components: [[0.0; 4]; 4],
    };

    pub const fn new(components: [[f64; 4]; 4]) -> Self {
        Self { components }
    }

    pub fn component(self, mu: SpacetimeIndex, nu: SpacetimeIndex) -> f64 {
        self.components[mu.as_usize()][nu.as_usize()]
    }

    pub const fn minkowski_plus_minus_minus_minus() -> Self {
        Self {
            components: [
                [1.0, 0.0, 0.0, 0.0],
                [0.0, -1.0, 0.0, 0.0],
                [0.0, 0.0, -1.0, 0.0],
                [0.0, 0.0, 0.0, -1.0],
            ],
        }
    }

    pub fn trace_with_inverse_metric(self, inverse_metric: ContravariantTensor2) -> f64 {
        let mut trace = 0.0;

        for mu in 0..4 {
            for nu in 0..4 {
                trace += inverse_metric.components[mu][nu] * self.components[mu][nu];
            }
        }

        trace
    }
}

/// Rank-2 contravariant tensor in 3+1 spacetime.
///
/// Useful for inverse metrics g^μν and stress-energy tensors T^μν.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct ContravariantTensor2 {
    pub components: [[f64; 4]; 4],
}

impl ContravariantTensor2 {
    pub const ZERO: Self = Self {
        components: [[0.0; 4]; 4],
    };

    pub const fn new(components: [[f64; 4]; 4]) -> Self {
        Self { components }
    }

    pub fn component(self, mu: SpacetimeIndex, nu: SpacetimeIndex) -> f64 {
        self.components[mu.as_usize()][nu.as_usize()]
    }

    pub const fn minkowski_plus_minus_minus_minus() -> Self {
        Self {
            components: [
                [1.0, 0.0, 0.0, 0.0],
                [0.0, -1.0, 0.0, 0.0],
                [0.0, 0.0, -1.0, 0.0],
                [0.0, 0.0, 0.0, -1.0],
            ],
        }
    }
}

/// Christoffel symbols Γ^ρ_{μν} for an affine connection.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct ChristoffelSymbols {
    pub components: [[[f64; 4]; 4]; 4],
}

impl ChristoffelSymbols {
    pub const ZERO: Self = Self {
        components: [[[0.0; 4]; 4]; 4],
    };

    pub const fn new(components: [[[f64; 4]; 4]; 4]) -> Self {
        Self { components }
    }

    pub fn component(self, rho: SpacetimeIndex, mu: SpacetimeIndex, nu: SpacetimeIndex) -> f64 {
        self.components[rho.as_usize()][mu.as_usize()][nu.as_usize()]
    }
}

/// Ricci tensor R_μν.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct RicciTensor {
    pub components: [[f64; 4]; 4],
}

impl RicciTensor {
    pub const ZERO: Self = Self {
        components: [[0.0; 4]; 4],
    };

    pub const fn new(components: [[f64; 4]; 4]) -> Self {
        Self { components }
    }
}

/// Ricci scalar R.
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd)]
pub struct RicciScalar {
    pub value: f64,
}

impl RicciScalar {
    pub const ZERO: Self = Self { value: 0.0 };

    pub const fn new(value: f64) -> Self {
        Self { value }
    }
}

/// Einstein tensor G_μν = R_μν - 1/2 R g_μν.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct EinsteinTensor {
    pub components: [[f64; 4]; 4],
}

impl EinsteinTensor {
    pub const ZERO: Self = Self {
        components: [[0.0; 4]; 4],
    };

    pub const fn new(components: [[f64; 4]; 4]) -> Self {
        Self { components }
    }

    pub fn from_ricci(metric: CovariantTensor2, ricci: RicciTensor, scalar: RicciScalar) -> Self {
        let mut components = [[0.0; 4]; 4];

        for mu in 0..4 {
            for nu in 0..4 {
                components[mu][nu] =
                    ricci.components[mu][nu] - 0.5 * scalar.value * metric.components[mu][nu];
            }
        }

        Self { components }
    }
}

/// Stress-energy tensor T_μν or T^μν, depending on solver convention.
///
/// The concrete convention should be fixed at the solver boundary.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct StressEnergyTensor {
    pub components: [[f64; 4]; 4],
}

impl StressEnergyTensor {
    pub const ZERO: Self = Self {
        components: [[0.0; 4]; 4],
    };

    pub const fn new(components: [[f64; 4]; 4]) -> Self {
        Self { components }
    }
}
