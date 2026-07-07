//! Finite-difference and method-of-lines numerics for grid-backed solvers.

use crate::vec3;
use crate::{EvolutionGridField3, GridAxis, PhysicsError, TimeDuration, UniformGrid3, Vec3};

/// Centered finite-difference stencil order.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum FiniteDifferenceOrder {
    Second,
    Fourth,
}

impl FiniteDifferenceOrder {
    pub const fn ghost_radius(self) -> usize {
        match self {
            Self::Second => 1,
            Self::Fourth => 2,
        }
    }
}

/// Centered finite-difference derivative operator for scalar evolution fields.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct FiniteDifferenceOperator {
    pub order: FiniteDifferenceOrder,
}

impl FiniteDifferenceOperator {
    pub const SECOND_ORDER: Self = Self {
        order: FiniteDifferenceOrder::Second,
    };

    pub const FOURTH_ORDER: Self = Self {
        order: FiniteDifferenceOrder::Fourth,
    };

    pub const fn new(order: FiniteDifferenceOrder) -> Self {
        Self { order }
    }

    pub fn first_derivative(
        self,
        field: &EvolutionGridField3<f64>,
        axis: GridAxis,
    ) -> Result<EvolutionGridField3<f64>, PhysicsError> {
        self.validate_field(field)?;

        let mut derivative = field.clone();
        derivative.fill(0.0);
        let h = axis_spacing(field.grid, axis);

        for index in 0..field.interior_len() {
            let ijk = field.interior_ijk_for_index(index)?;
            let value = match self.order {
                FiniteDifferenceOrder::Second => {
                    (offset_value(field, ijk, axis, 1)? - offset_value(field, ijk, axis, -1)?)
                        / (2.0 * h)
                }
                FiniteDifferenceOrder::Fourth => {
                    (-offset_value(field, ijk, axis, 2)? + 8.0 * offset_value(field, ijk, axis, 1)?
                        - 8.0 * offset_value(field, ijk, axis, -1)?
                        + offset_value(field, ijk, axis, -2)?)
                        / (12.0 * h)
                }
            };
            derivative.set_interior(ijk[0], ijk[1], ijk[2], value)?;
        }

        Ok(derivative)
    }

    pub fn second_derivative(
        self,
        field: &EvolutionGridField3<f64>,
        axis: GridAxis,
    ) -> Result<EvolutionGridField3<f64>, PhysicsError> {
        self.validate_field(field)?;

        let mut derivative = field.clone();
        derivative.fill(0.0);
        let h2 = axis_spacing(field.grid, axis).powi(2);

        for index in 0..field.interior_len() {
            let ijk = field.interior_ijk_for_index(index)?;
            let center = *field.get_interior(ijk[0], ijk[1], ijk[2])?;
            let value = match self.order {
                FiniteDifferenceOrder::Second => {
                    (offset_value(field, ijk, axis, 1)? - 2.0 * center
                        + offset_value(field, ijk, axis, -1)?)
                        / h2
                }
                FiniteDifferenceOrder::Fourth => {
                    (-offset_value(field, ijk, axis, 2)?
                        + 16.0 * offset_value(field, ijk, axis, 1)?
                        - 30.0 * center
                        + 16.0 * offset_value(field, ijk, axis, -1)?
                        - offset_value(field, ijk, axis, -2)?)
                        / (12.0 * h2)
                }
            };
            derivative.set_interior(ijk[0], ijk[1], ijk[2], value)?;
        }

        Ok(derivative)
    }

    pub fn gradient(
        self,
        field: &EvolutionGridField3<f64>,
    ) -> Result<EvolutionGridField3<Vec3>, PhysicsError> {
        self.validate_field(field)?;

        let dx = self.first_derivative(field, GridAxis::X)?;
        let dy = self.first_derivative(field, GridAxis::Y)?;
        let dz = self.first_derivative(field, GridAxis::Z)?;
        let mut gradient = EvolutionGridField3::new(
            field.grid,
            field.centering,
            field.ghost_zones,
            field.boundary_conditions,
            vec3::ZERO,
        )?;

        for index in 0..field.interior_len() {
            let ijk = field.interior_ijk_for_index(index)?;
            gradient.set_interior(
                ijk[0],
                ijk[1],
                ijk[2],
                vec3::new(
                    *dx.get_interior(ijk[0], ijk[1], ijk[2])?,
                    *dy.get_interior(ijk[0], ijk[1], ijk[2])?,
                    *dz.get_interior(ijk[0], ijk[1], ijk[2])?,
                ),
            )?;
        }

        Ok(gradient)
    }

    fn validate_field(self, field: &EvolutionGridField3<f64>) -> Result<(), PhysicsError> {
        validate_spacing(field.grid)?;

        let radius = self.order.ghost_radius();
        if field.ghost_zones.lower.iter().any(|&width| width < radius)
            || field.ghost_zones.upper.iter().any(|&width| width < radius)
        {
            return Err(PhysicsError::InvalidGrid);
        }

        Ok(())
    }
}

/// Kreiss-Oliger dissipation operator for scalar evolution fields.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct KreissOligerDissipation {
    pub epsilon: f64,
}

impl KreissOligerDissipation {
    pub const fn new(epsilon: f64) -> Self {
        Self { epsilon }
    }

    pub fn dissipation(
        self,
        field: &EvolutionGridField3<f64>,
    ) -> Result<EvolutionGridField3<f64>, PhysicsError> {
        if !self.epsilon.is_finite() || self.epsilon < 0.0 {
            return Err(PhysicsError::InvalidStep);
        }

        FiniteDifferenceOperator::FOURTH_ORDER.validate_field(field)?;

        let mut dissipation = field.clone();
        dissipation.fill(0.0);

        for index in 0..field.interior_len() {
            let ijk = field.interior_ijk_for_index(index)?;
            let center = *field.get_interior(ijk[0], ijk[1], ijk[2])?;
            let mut value = 0.0;

            for axis in [GridAxis::X, GridAxis::Y, GridAxis::Z] {
                let h = axis_spacing(field.grid, axis);
                let fourth_difference = offset_value(field, ijk, axis, 2)?
                    - 4.0 * offset_value(field, ijk, axis, 1)?
                    + 6.0 * center
                    - 4.0 * offset_value(field, ijk, axis, -1)?
                    + offset_value(field, ijk, axis, -2)?;
                value += -self.epsilon * h * fourth_difference / 16.0;
            }

            dissipation.set_interior(ijk[0], ijk[1], ijk[2], value)?;
        }

        Ok(dissipation)
    }

    pub fn add_to_rhs(
        self,
        field: &EvolutionGridField3<f64>,
        rhs: &mut EvolutionGridField3<f64>,
    ) -> Result<(), PhysicsError> {
        if !field.same_layout(rhs) {
            return Err(PhysicsError::InvalidGrid);
        }

        let dissipation = self.dissipation(field)?;
        rhs.add_scaled_mut(&dissipation, 1.0)
    }
}

/// Courant-Friedrichs-Lewy limit for explicit time integration.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct CflCondition {
    pub courant: f64,
}

impl CflCondition {
    pub const fn new(courant: f64) -> Self {
        Self { courant }
    }

    pub fn maximum_stable_dt(
        self,
        grid: UniformGrid3,
        max_characteristic_speed: f64,
    ) -> Result<TimeDuration, PhysicsError> {
        if !self.courant.is_finite()
            || self.courant <= 0.0
            || !max_characteristic_speed.is_finite()
            || max_characteristic_speed <= 0.0
        {
            return Err(PhysicsError::InvalidStep);
        }

        validate_spacing(grid)?;
        Ok(TimeDuration::from_seconds(
            self.courant * min_spacing(grid) / max_characteristic_speed,
        ))
    }

    pub fn check(
        self,
        grid: UniformGrid3,
        max_characteristic_speed: f64,
        dt: TimeDuration,
    ) -> Result<(), PhysicsError> {
        if !dt.seconds().is_finite() || dt.seconds() <= 0.0 {
            return Err(PhysicsError::InvalidStep);
        }

        let stable_dt = self.maximum_stable_dt(grid, max_characteristic_speed)?;
        if dt.seconds() > stable_dt.seconds() {
            return Err(PhysicsError::InvalidStep);
        }

        Ok(())
    }
}

/// Minimal vector-space operations needed by explicit MOL steppers.
pub trait MolState: Clone {
    fn zero_like(&self) -> Self;

    fn add_scaled_mut(&mut self, derivative: &Self, scale: f64) -> Result<(), PhysicsError>;

    fn scaled_add(&self, derivative: &Self, scale: f64) -> Result<Self, PhysicsError> {
        let mut next = self.clone();
        next.add_scaled_mut(derivative, scale)?;
        Ok(next)
    }
}

impl MolState for EvolutionGridField3<f64> {
    fn zero_like(&self) -> Self {
        let mut zero = self.clone();
        zero.fill(0.0);
        zero
    }

    fn add_scaled_mut(&mut self, derivative: &Self, scale: f64) -> Result<(), PhysicsError> {
        if !self.same_layout(derivative) || !scale.is_finite() {
            return Err(PhysicsError::InvalidStep);
        }

        for index in 0..self.interior_len() {
            let ijk = self.interior_ijk_for_index(index)?;
            let value = *self.get_interior(ijk[0], ijk[1], ijk[2])?
                + scale * *derivative.get_interior(ijk[0], ijk[1], ijk[2])?;
            self.set_interior(ijk[0], ijk[1], ijk[2], value)?;
        }

        Ok(())
    }
}

/// Right-hand side provider for method-of-lines integration.
pub trait MethodOfLinesSystem<S: MolState> {
    fn rhs(&self, state: &S, derivative: &mut S) -> Result<(), PhysicsError>;

    fn apply_boundary_conditions(&self, state: &mut S) -> Result<(), PhysicsError>;

    fn max_characteristic_speed(&self, state: &S) -> Result<f64, PhysicsError>;

    fn grid(&self, state: &S) -> UniformGrid3;
}

/// Classical fourth-order Runge-Kutta stepper for MOL systems.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct Rk4MethodOfLinesStepper {
    pub cfl: CflCondition,
}

impl Rk4MethodOfLinesStepper {
    pub const fn new(cfl: CflCondition) -> Self {
        Self { cfl }
    }

    pub fn step<S, System>(
        self,
        system: &System,
        state: &S,
        dt: TimeDuration,
    ) -> Result<S, PhysicsError>
    where
        S: MolState,
        System: MethodOfLinesSystem<S>,
    {
        self.cfl.check(
            system.grid(state),
            system.max_characteristic_speed(state)?,
            dt,
        )?;

        let h = dt.seconds();

        let mut y = state.clone();
        system.apply_boundary_conditions(&mut y)?;

        let mut k1 = y.zero_like();
        system.rhs(&y, &mut k1)?;

        let mut y2 = y.scaled_add(&k1, 0.5 * h)?;
        system.apply_boundary_conditions(&mut y2)?;
        let mut k2 = y.zero_like();
        system.rhs(&y2, &mut k2)?;

        let mut y3 = y.scaled_add(&k2, 0.5 * h)?;
        system.apply_boundary_conditions(&mut y3)?;
        let mut k3 = y.zero_like();
        system.rhs(&y3, &mut k3)?;

        let mut y4 = y.scaled_add(&k3, h)?;
        system.apply_boundary_conditions(&mut y4)?;
        let mut k4 = y.zero_like();
        system.rhs(&y4, &mut k4)?;

        let mut next = y;
        next.add_scaled_mut(&k1, h / 6.0)?;
        next.add_scaled_mut(&k2, h / 3.0)?;
        next.add_scaled_mut(&k3, h / 3.0)?;
        next.add_scaled_mut(&k4, h / 6.0)?;
        system.apply_boundary_conditions(&mut next)?;

        Ok(next)
    }
}

fn offset_value(
    field: &EvolutionGridField3<f64>,
    interior_ijk: [usize; 3],
    axis: GridAxis,
    offset: isize,
) -> Result<f64, PhysicsError> {
    let mut storage_ijk = field.storage_ijk_for_interior_ijk(interior_ijk)?;
    let axis = axis.as_usize();
    let shifted = storage_ijk[axis] as isize + offset;

    if shifted < 0 || shifted as usize >= field.storage_dimensions[axis] {
        return Err(PhysicsError::PointOutsideGrid);
    }

    storage_ijk[axis] = shifted as usize;
    Ok(*field.get_storage(storage_ijk[0], storage_ijk[1], storage_ijk[2])?)
}

fn axis_spacing(grid: UniformGrid3, axis: GridAxis) -> f64 {
    match axis {
        GridAxis::X => grid.spacing.x,
        GridAxis::Y => grid.spacing.y,
        GridAxis::Z => grid.spacing.z,
    }
}

fn min_spacing(grid: UniformGrid3) -> f64 {
    grid.spacing.x.min(grid.spacing.y).min(grid.spacing.z)
}

fn validate_spacing(grid: UniformGrid3) -> Result<(), PhysicsError> {
    if !grid.spacing.x.is_finite()
        || !grid.spacing.y.is_finite()
        || !grid.spacing.z.is_finite()
        || grid.spacing.x <= 0.0
        || grid.spacing.y <= 0.0
        || grid.spacing.z <= 0.0
    {
        return Err(PhysicsError::InvalidGrid);
    }

    Ok(())
}
