use super::*;
use approx::assert_abs_diff_eq;
use rayon::prelude::*;

#[derive(Debug, Copy, Clone)]
struct ScalarAdvectionSystem {
    speed: f64,
    derivative: FiniteDifferenceOperator,
}

impl MethodOfLinesSystem<EvolutionGridField3<f64>> for ScalarAdvectionSystem {
    fn rhs(
        &self,
        state: &EvolutionGridField3<f64>,
        derivative: &mut EvolutionGridField3<f64>,
    ) -> Result<(), PhysicsError> {
        derivative.fill(0.0);
        let dx = self.derivative.first_derivative(state, GridAxis::X)?;

        for index in 0..state.interior_len() {
            let ijk = state.interior_ijk_for_index(index)?;
            derivative.set_interior(
                ijk[0],
                ijk[1],
                ijk[2],
                -self.speed * *dx.get_interior(ijk[0], ijk[1], ijk[2])?,
            )?;
        }

        Ok(())
    }

    fn apply_boundary_conditions(
        &self,
        state: &mut EvolutionGridField3<f64>,
    ) -> Result<(), PhysicsError> {
        state.apply_boundary_conditions()
    }

    fn max_characteristic_speed(
        &self,
        _state: &EvolutionGridField3<f64>,
    ) -> Result<f64, PhysicsError> {
        Ok(self.speed.abs())
    }

    fn grid(&self, state: &EvolutionGridField3<f64>) -> UniformGrid3 {
        state.grid
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct SourceDrivenGeometryStepper;

impl BssnGeometryStepper for SourceDrivenGeometryStepper {
    fn evolve_geometry(
        &self,
        geometry: &mut BssnGridFields,
        stress_energy: &EvolutionGridField3<StressEnergyTensor>,
        dt: TimeDuration,
    ) -> Result<(), PhysicsError> {
        let source = stress_energy.get_interior(0, 0, 0)?.components[0][0];

        geometry
            .lapse
            .set_interior(0, 0, 0, 1.0 + source * dt.seconds())?;
        geometry.conformal_metric.set_interior(
            0,
            0,
            0,
            SymmetricSpatialTensor2::diagonal(8.0, 1.0, 1.0),
        )?;
        geometry.apply_boundary_conditions()
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct MetricDrivenMatterStepper;

impl<Eos: EquationOfState> MatterRadiationStepper<Eos> for MetricDrivenMatterStepper {
    fn evolve_matter(
        &self,
        matter: &mut ConservativeMatterGrid<Eos>,
        metric: &MatterMetricCellGrid,
        dt: TimeDuration,
    ) -> Result<(), PhysicsError> {
        let lapse = *metric.lapse.get_interior(0, 0, 0)?;
        let mut cell = matter.cell_state(0, 0, 0)?;
        cell.total_energy_density += lapse * dt.seconds();
        matter.set_cell_state(0, 0, 0, cell)?;
        matter.apply_boundary_conditions()
    }
}

#[derive(Debug, Copy, Clone, PartialEq)]
struct LinearPotential {
    value: f64,
    gradient: [f64; 4],
}

impl ScalarPotential for LinearPotential {
    fn value_at(&self, x: SpacetimeCoordinate) -> f64 {
        self.value
            + self.gradient[0] * x.components[0]
            + self.gradient[1] * x.components[1]
            + self.gradient[2] * x.components[2]
            + self.gradient[3] * x.components[3]
    }

    fn gradient_at(&self, _x: SpacetimeCoordinate) -> [f64; 4] {
        self.gradient
    }
}

#[test]
fn vec3_addition_and_dot_product_work() {
    let lhs = vec3::new(1.0, 2.0, 3.0);
    let rhs = vec3::new(4.0, 5.0, 6.0);

    assert_eq!(lhs + rhs, vec3::new(5.0, 7.0, 9.0));
    assert_eq!(lhs.dot(rhs), 32.0);
}

#[test]
fn galilean_boost_preserves_coordinate_time() {
    let boost = GalileanBoost::new(vec3::new(10.0, 0.0, 0.0));
    let event = GalileanEvent::new(
        CoordinateTime::from_seconds(2.0),
        vec3::new(100.0, 0.0, 0.0),
    );

    let transformed = boost.transform_event(event);

    assert_eq!(transformed.t, CoordinateTime::from_seconds(2.0));
    assert_eq!(transformed.r, vec3::new(80.0, 0.0, 0.0));
}

#[test]
fn proper_duration_for_subluminal_segment_is_less_than_coordinate_duration() {
    let c = 10.0;
    let start = WorldlineEvent::new(CoordinateTime::from_seconds(0.0), vec3::ZERO);
    let end = WorldlineEvent::new(CoordinateTime::from_seconds(1.0), vec3::new(6.0, 0.0, 0.0));

    let segment = WorldlineSegment::new(start, end);
    let proper = segment.proper_duration(c).unwrap();

    assert!(proper.seconds() < segment.coordinate_duration().seconds());
    assert!((proper.seconds() - 0.8).abs() < 1.0e-12);
}

#[test]
fn four_velocity_has_minkowski_norm_c_squared() {
    let c = 10.0;
    let velocity = vec3::new(6.0, 0.0, 0.0);
    let four_velocity = FourVelocity::from_velocity(velocity, c).unwrap();

    assert!((four_velocity.minkowski_norm_squared() - c * c).abs() < 1.0e-12);
}

#[test]
fn spacetime_index_maps_to_component_indices() {
    assert_eq!(SpacetimeIndex::T.as_usize(), 0);
    assert_eq!(SpacetimeIndex::X.as_usize(), 1);
    assert_eq!(SpacetimeIndex::Y.as_usize(), 2);
    assert_eq!(SpacetimeIndex::Z.as_usize(), 3);
}

#[test]
fn einstein_residual_subtracts_stress_energy_source() {
    let geometry = EinsteinTensor::new([
        [2.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 0.0],
    ]);
    let source = StressEnergyTensor::new([
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 0.0],
    ]);
    let constants = RelativisticCouplingConstants::new(1.0, 1.0 / (8.0 * std::f64::consts::PI));

    let residual = EinsteinEquationResidual::from_tensors(geometry, source, constants).unwrap();

    assert!((residual.components[0][0] - 1.0).abs() < 1.0e-12);
}

#[test]
fn backreaction_policy_identifies_metric_updates() {
    assert!(!BackreactionPolicy::NONE.updates_metric());
    assert!(!BackreactionPolicy::MATERIAL.updates_metric());
    assert!(!BackreactionPolicy::RAD_HYDRO.updates_metric());
    assert!(BackreactionPolicy::DYNAMIC_SPACETIME.updates_metric());
}

#[test]
fn minkowski_metric_field_returns_flat_metric_and_zero_connection() {
    let metric = MinkowskiMetricField;
    let x = SpacetimeCoordinate::new([0.0, 1.0, 2.0, 3.0], CoordinateChartKind::Cartesian);

    assert_eq!(
        metric.covariant_metric_at(x),
        CovariantTensor2::minkowski_plus_minus_minus_minus()
    );
    assert_eq!(
        metric.inverse_metric_at(x),
        ContravariantTensor2::minkowski_plus_minus_minus_minus()
    );
    assert_eq!(metric.christoffel_symbols_at(x), ChristoffelSymbols::ZERO);
}

#[test]
fn flat_curvature_operator_returns_zero_einstein_tensor() {
    let metric = MinkowskiMetricField;
    let curvature = FlatCurvatureOperator;
    let x = SpacetimeCoordinate::new([0.0, 0.0, 0.0, 0.0], CoordinateChartKind::Cartesian);

    assert_eq!(curvature.ricci_tensor_at(&metric, x), RicciTensor::ZERO);
    assert_eq!(curvature.ricci_scalar_at(&metric, x), RicciScalar::ZERO);
    assert_eq!(
        curvature.einstein_tensor_at(&metric, x),
        EinsteinTensor::ZERO
    );
}

#[test]
fn finite_difference_curvature_operator_returns_zero_for_flat_grid_metric() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [3, 3, 3]);
    let mut metric = EvolutionGridField3::cell_centered_with_ghosts(
        grid,
        2,
        BoundaryConditions3::OUTFLOW,
        SymmetricSpatialTensor2::IDENTITY,
    )
    .unwrap();
    metric.apply_boundary_conditions().unwrap();

    let curvature = FiniteDifferenceCurvatureOperator::SECOND_ORDER
        .curvature_grid(&metric)
        .unwrap();

    for index in 0..metric.interior_len() {
        let ricci = curvature.ricci_tensor.get_interior_index(index).unwrap();
        let einstein = curvature.einstein_tensor.get_interior_index(index).unwrap();
        let scalar = curvature.ricci_scalar.get_interior_index(index).unwrap();

        assert_abs_diff_eq!(*scalar, 0.0, epsilon = 1.0e-12);
        for i in 0..3 {
            for j in 0..3 {
                assert_abs_diff_eq!(ricci.components[i][j], 0.0, epsilon = 1.0e-12);
                assert_abs_diff_eq!(einstein.components[i][j], 0.0, epsilon = 1.0e-12);
            }
        }
    }
}

#[test]
fn euler_geodesic_stepper_moves_freely_in_minkowski_space() {
    let c = 10.0;
    let metric = MinkowskiMetricField;
    let stepper = EulerGeodesicStepper;
    let state = GeodesicState::new(
        SpacetimeCoordinate::new([0.0, 0.0, 0.0, 0.0], CoordinateChartKind::Cartesian),
        FourVelocity::from_velocity(vec3::new(1.0, 0.0, 0.0), c).unwrap(),
    );

    let next = stepper
        .step_geodesic(&metric, state, AffineStep::new(0.5))
        .unwrap();

    assert!(next.x.components[0] > state.x.components[0]);
    assert!(next.x.components[1] > state.x.components[1]);
    assert_eq!(next.four_velocity, state.four_velocity);
}

#[test]
fn rk4_geodesic_stepper_preserves_timelike_invariant_in_minkowski_space() {
    let c = 10.0;
    let metric = MinkowskiMetricField;
    let state = TransportGeodesicState::timelike(
        SpacetimeCoordinate::new([0.0, 0.0, 0.0, 0.0], CoordinateChartKind::Cartesian),
        FourVelocity::from_velocity(vec3::new(1.0, 2.0, 0.0), c).unwrap(),
    );

    let next = Rk4GeodesicStepper
        .step_transport_geodesic(&metric, state, AffineStep::new(0.25))
        .unwrap();

    assert!((state.invariant(&metric) - c * c).abs() < 1.0e-12);
    assert!((next.invariant(&metric) - c * c).abs() < 1.0e-12);
    assert_eq!(next.tangent, state.tangent);
}

#[test]
fn rk4_geodesic_stepper_preserves_null_invariant_in_minkowski_space() {
    let metric = MinkowskiMetricField;
    let state = TransportGeodesicState::null(
        SpacetimeCoordinate::new([0.0, 0.0, 0.0, 0.0], CoordinateChartKind::Cartesian),
        FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
    );

    let next = Rk4GeodesicStepper
        .step_transport_geodesic(&metric, state, AffineStep::new(0.5))
        .unwrap();

    assert!(state.invariant(&metric).abs() < 1.0e-12);
    assert!(next.invariant(&metric).abs() < 1.0e-12);
    assert_eq!(next.x.components, [0.5, 0.5, 0.0, 0.0]);
}

#[test]
fn adaptive_geodesic_stepper_substeps_timelike_particles() {
    let c = 10.0;
    let metric = MinkowskiMetricField;
    let state = TransportGeodesicState::timelike(
        SpacetimeCoordinate::new([0.0, 0.0, 0.0, 0.0], CoordinateChartKind::Cartesian),
        FourVelocity::from_velocity(vec3::new(1.0, 0.0, 0.0), c).unwrap(),
    );
    let config = AdaptiveGeodesicConfig {
        max_step: AffineStep::new(0.2),
        ..AdaptiveGeodesicConfig::DEFAULT
    };

    let (next, report) = AdaptiveGeodesicStepper::new(config)
        .step_transport_geodesic(&metric, state, AffineStep::new(0.5))
        .unwrap();

    assert!(report.accepted_substeps >= 3);
    assert_eq!(report.rejected_substeps, 0);
    assert_abs_diff_eq!(next.invariant(&metric), c * c, epsilon = 1.0e-12);
    assert_abs_diff_eq!(
        next.x.components[1],
        state.tangent.spatial.x * 0.5,
        epsilon = 1.0e-12
    );
}

#[test]
fn adaptive_geodesic_stepper_supports_null_rays() {
    let metric = MinkowskiMetricField;
    let config = AdaptiveGeodesicConfig {
        max_step: AffineStep::new(0.25),
        ..AdaptiveGeodesicConfig::DEFAULT
    };

    let (next, report) = AdaptiveGeodesicStepper::new(config)
        .step_null(
            &metric,
            SpacetimeCoordinate::new([0.0, 0.0, 0.0, 0.0], CoordinateChartKind::Cartesian),
            FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
            AffineStep::new(0.5),
        )
        .unwrap();

    assert!(report.accepted_substeps >= 2);
    assert_abs_diff_eq!(report.invariant_error, 0.0, epsilon = 1.0e-12);
    assert_eq!(next.kind, GeodesicKind::Null);
    assert_eq!(next.x.components, [0.5, 0.5, 0.0, 0.0]);
}

#[test]
fn curved_transport_context_exposes_adaptive_timelike_and_null_steps() {
    let c = 10.0;
    let context = CurvedTransportContext::new(MinkowskiMetricField, AffineStep::new(0.25));
    let config = AdaptiveGeodesicConfig::DEFAULT;
    let (particle, particle_report) = context
        .step_timelike_particle(
            SpacetimeCoordinate::new([0.0, 0.0, 0.0, 0.0], CoordinateChartKind::Cartesian),
            FourVelocity::from_velocity(vec3::new(1.0, 0.0, 0.0), c).unwrap(),
            config,
        )
        .unwrap();
    let (ray, ray_report) = context
        .step_null_ray(
            SpacetimeCoordinate::new([0.0, 0.0, 0.0, 0.0], CoordinateChartKind::Cartesian),
            FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
            config,
        )
        .unwrap();

    assert_eq!(particle.kind, GeodesicKind::Timelike);
    assert_eq!(ray.kind, GeodesicKind::Null);
    assert!(particle_report.accepted_substeps > 0);
    assert!(ray_report.accepted_substeps > 0);
    assert_abs_diff_eq!(
        particle.invariant(&context.metric),
        c * c,
        epsilon = 1.0e-12
    );
    assert_abs_diff_eq!(ray.invariant(&context.metric), 0.0, epsilon = 1.0e-12);
}

#[test]
fn weak_field_constant_potential_has_zero_connection() {
    let metric = WeakFieldMetric::new(ConstantPotential::new(-0.01), 10.0);
    let x = SpacetimeCoordinate::new([0.0, 1.0, 2.0, 3.0], CoordinateChartKind::Cartesian);

    assert_eq!(metric.christoffel_symbols_at(x), ChristoffelSymbols::ZERO);
}

#[test]
fn weak_field_gradient_changes_transport_path_relative_to_flat_space() {
    let flat = CurvedTransportContext::new(MinkowskiMetricField, AffineStep::new(0.1));
    let weak = CurvedTransportContext::new(
        WeakFieldMetric::new(
            LinearPotential {
                value: -0.01,
                gradient: [0.0, -0.2, 0.0, 0.0],
            },
            10.0,
        ),
        AffineStep::new(0.1),
    );
    let state = TransportGeodesicState::null(
        SpacetimeCoordinate::new([0.0, 0.0, 0.0, 0.0], CoordinateChartKind::Cartesian),
        FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
    );

    let flat_next = flat.step_geodesic(state).unwrap();
    let weak_next = weak.step_geodesic(state).unwrap();

    assert_ne!(flat_next.tangent, weak_next.tangent);
    assert!(weak_next.tangent.spatial.x > flat_next.tangent.spatial.x);
}

#[test]
fn diagonal_local_frame_scales_coordinate_components() {
    let metric = WeakFieldMetric::new(ConstantPotential::new(-0.01), 10.0);
    let x = SpacetimeCoordinate::new([0.0, 0.0, 0.0, 0.0], CoordinateChartKind::Cartesian);
    let frame = metric.diagonal_local_frame_at(x).unwrap();
    let local = frame.coordinate_to_local_components(FourVec::new(2.0, vec3::new(3.0, 0.0, 0.0)));

    assert!(local.ct < 2.0);
    assert!(local.spatial.x > 3.0);
}

#[test]
fn stress_energy_grid_deposits_nearest_cell_deterministically() {
    let mut grid =
        StressEnergyGrid::new(UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [2, 2, 1])).unwrap();
    let contribution = StressEnergyContribution::new(
        SpacetimeCoordinate::new([0.0, 1.25, 0.25, 0.0], CoordinateChartKind::Cartesian),
        FourVec::new(2.0, vec3::new(1.0, 0.0, 0.0)),
        0.5,
    );

    let first_index = grid.deposit_nearest(contribution).unwrap();
    let second_index = grid.deposit_nearest(contribution).unwrap();
    let total = grid.total_stress_energy();

    assert_eq!(first_index, 1);
    assert_eq!(second_index, 1);
    assert!((total.components[0][0] - 4.0).abs() < 1.0e-12);
    assert!((total.components[0][1] - 2.0).abs() < 1.0e-12);
    assert!((total.components[1][1] - 1.0).abs() < 1.0e-12);
}

#[test]
fn conservative_matter_grid_computes_pressure_and_stress_energy() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 1, 1]);
    let mut matter = ConservativeMatterGrid::new(
        grid,
        CoordinateTime::ZERO,
        1,
        BoundaryConditions3::OUTFLOW,
        IdealGasEquationOfState::new(5.0 / 3.0),
    )
    .unwrap();

    matter
        .set_cell_state(
            0,
            0,
            0,
            ConservativeMatterCell::new(2.0, vec3::new(2.0, 0.0, 0.0), 5.0),
        )
        .unwrap();

    let pressure = matter.pressure_at(0, 0, 0).unwrap();
    let stress_energy = matter.matter_stress_energy_at_cell(0, 0, 0).unwrap();

    assert_abs_diff_eq!(pressure, 8.0 / 3.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(stress_energy.components[0][0], 5.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(stress_energy.components[0][1], 2.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(
        stress_energy.components[1][1],
        14.0 / 3.0,
        epsilon = 1.0e-12
    );
}

#[test]
fn conservative_matter_grid_deposits_particle_stress_energy() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [2, 1, 1]);
    let mut matter = ConservativeMatterGrid::new(
        grid,
        CoordinateTime::ZERO,
        1,
        BoundaryConditions3::OUTFLOW,
        IdealGasEquationOfState::new(5.0 / 3.0),
    )
    .unwrap();
    let contribution = StressEnergyContribution::new(
        SpacetimeCoordinate::new([0.0, 1.25, 0.25, 0.25], CoordinateChartKind::Cartesian),
        FourVec::new(2.0, vec3::new(1.0, 0.0, 0.0)),
        0.5,
    );

    let index = matter.deposit_stress_energy_nearest(contribution).unwrap();
    let total = matter.total_stress_energy_at_cell(1, 0, 0).unwrap();

    assert_eq!(index, 1);
    assert_abs_diff_eq!(total.components[0][0], 2.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(total.components[0][1], 1.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(total.components[1][1], 0.5, epsilon = 1.0e-12);
}

#[test]
fn conservative_matter_grid_implements_stress_energy_source_lookup() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 1, 1]);
    let mut matter = ConservativeMatterGrid::new(
        grid,
        CoordinateTime::ZERO,
        1,
        BoundaryConditions3::OUTFLOW,
        IdealGasEquationOfState::new(5.0 / 3.0),
    )
    .unwrap();

    matter
        .set_cell_state(0, 0, 0, ConservativeMatterCell::new(1.0, vec3::ZERO, 3.0))
        .unwrap();

    let x = SpacetimeCoordinate::new([0.0, 0.5, 0.5, 0.5], CoordinateChartKind::Cartesian);
    let source = matter.stress_energy_at(&x, x);

    assert_abs_diff_eq!(source.components[0][0], 3.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(source.components[1][1], 2.0, epsilon = 1.0e-12);
}

#[test]
fn matter_metric_grid_samples_metric_field_on_cell_centers() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 1, 1]);
    let metric_grid = MatterMetricCellGrid::from_metric_field(
        &MinkowskiMetricField,
        grid,
        CoordinateTime::from_seconds(2.0),
        1,
        BoundaryConditions3::OUTFLOW,
    )
    .unwrap();

    assert_eq!(metric_grid.time, CoordinateTime::from_seconds(2.0));
    assert_eq!(
        *metric_grid.covariant_metric.get_interior(0, 0, 0).unwrap(),
        CovariantTensor2::minkowski_plus_minus_minus_minus()
    );
    assert_abs_diff_eq!(*metric_grid.lapse.get_interior(0, 0, 0).unwrap(), 1.0);
    assert_eq!(
        *metric_grid.shift.get_interior(0, 0, 0).unwrap(),
        vec3::ZERO
    );
}

#[test]
fn matter_metric_grid_samples_solver_lapse_and_shift() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 1, 1]);
    let mut adm = AdmGridFields::flat_cartesian_with_ghosts(
        grid,
        CoordinateTime::ZERO,
        1,
        BoundaryConditions3::OUTFLOW,
    )
    .unwrap();
    adm.lapse.set_interior(0, 0, 0, 2.0).unwrap();
    adm.shift
        .set_interior(0, 0, 0, vec3::new(0.5, 0.0, 0.0))
        .unwrap();

    let metric_grid =
        MatterMetricCellGrid::from_solver_grid(&adm, 1, BoundaryConditions3::OUTFLOW).unwrap();

    assert_abs_diff_eq!(*metric_grid.lapse.get_interior(0, 0, 0).unwrap(), 2.0);
    assert_eq!(
        *metric_grid.shift.get_interior(0, 0, 0).unwrap(),
        vec3::new(0.5, 0.0, 0.0)
    );
}

#[test]
fn coupled_bssn_matter_step_deposits_evolves_enforces_and_emits_diagnostics() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 1, 1]);
    let geometry = BssnGridFields::flat_cartesian_with_ghosts(
        grid,
        CoordinateTime::ZERO,
        2,
        BoundaryConditions3::OUTFLOW,
    )
    .unwrap();
    let mut matter = ConservativeMatterGrid::new(
        grid,
        CoordinateTime::ZERO,
        2,
        BoundaryConditions3::OUTFLOW,
        IdealGasEquationOfState::new(5.0 / 3.0),
    )
    .unwrap();
    matter
        .set_cell_state(0, 0, 0, ConservativeMatterCell::new(1.0, vec3::ZERO, 3.0))
        .unwrap();
    let mut state = CoupledBssnMatterState::new(geometry, matter);
    let stepper = CoupledBssnMatterStepper::new(
        SourceDrivenGeometryStepper,
        MetricDrivenMatterStepper,
        AlgebraicBssnGaugeEnforcer,
        ConstraintDiagnosticsOperator::SECOND_ORDER,
        2,
        BoundaryConditions3::OUTFLOW,
    );
    let contribution = StressEnergyContribution::new(
        SpacetimeCoordinate::new([0.0, 0.5, 0.5, 0.5], CoordinateChartKind::Cartesian),
        FourVec::new(2.0, vec3::new(0.0, 0.0, 0.0)),
        0.5,
    );

    let diagnostics = stepper
        .step(&mut state, &[contribution], TimeDuration::from_seconds(0.1))
        .unwrap();

    assert_eq!(diagnostics.deposited_history_count, 1);
    assert_abs_diff_eq!(
        diagnostics
            .stress_energy
            .get_interior(0, 0, 0)
            .unwrap()
            .components[0][0],
        5.0,
        epsilon = 1.0e-12
    );
    assert_abs_diff_eq!(
        *diagnostics
            .metric_on_matter
            .lapse
            .get_interior(0, 0, 0)
            .unwrap(),
        1.5,
        epsilon = 1.0e-12
    );
    assert_abs_diff_eq!(
        *state
            .matter
            .total_energy_density
            .get_interior(0, 0, 0)
            .unwrap(),
        3.15,
        epsilon = 1.0e-12
    );
    assert_abs_diff_eq!(state.geometry.time.seconds(), 0.1, epsilon = 1.0e-12);
    assert_abs_diff_eq!(state.matter.time.seconds(), 0.1, epsilon = 1.0e-12);
    assert_abs_diff_eq!(
        state
            .geometry
            .conformal_metric
            .get_interior(0, 0, 0)
            .unwrap()
            .determinant(),
        1.0,
        epsilon = 1.0e-12
    );
    assert!(diagnostics.constraints.finite_check.is_finite());
}

#[test]
fn curved_transport_context_gates_stress_energy_deposition_by_policy() {
    let contribution = StressEnergyContribution::new(
        SpacetimeCoordinate::new([0.0, 0.25, 0.25, 0.25], CoordinateChartKind::Cartesian),
        FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
        1.0,
    );
    let mut grid =
        StressEnergyGrid::new(UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 1, 1])).unwrap();
    let passive_context = CurvedTransportContext::new(MinkowskiMetricField, AffineStep::new(0.1));
    let active_context = CurvedTransportContext::new(MinkowskiMetricField, AffineStep::new(0.1))
        .with_backreaction_policy(BackreactionPolicy::DYNAMIC_SPACETIME);

    assert_eq!(
        passive_context
            .deposit_if_enabled(&mut grid, contribution)
            .unwrap(),
        None
    );
    assert_eq!(
        active_context
            .deposit_if_enabled(&mut grid, contribution)
            .unwrap(),
        Some(0)
    );
    assert!((grid.total_stress_energy().components[0][0] - 1.0).abs() < 1.0e-12);
}

#[test]
fn grid_field_indexes_cell_centered_storage_consistently() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(0.5), [2, 2, 2]);
    let field = GridField3::from_fn(grid, |ijk, center| {
        ijk[0] as f64 + 10.0 * ijk[1] as f64 + 100.0 * ijk[2] as f64 + center.x
    })
    .unwrap();

    assert_eq!(grid.linear_index(1, 0, 1).unwrap(), 5);
    assert_eq!(grid.ijk_for_index(5).unwrap(), [1, 0, 1]);
    assert!((*field.get(1, 0, 1).unwrap() - 101.75).abs() < 1.0e-12);
}

#[test]
fn evolution_grid_field_tracks_centering_ghosts_and_boundary_fill() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [3, 1, 1]);
    let mut field =
        EvolutionGridField3::cell_centered_with_ghosts(grid, 1, BoundaryConditions3::OUTFLOW, 0.0)
            .unwrap();

    field.set_interior(0, 0, 0, 10.0).unwrap();
    field.set_interior(1, 0, 0, 20.0).unwrap();
    field.set_interior(2, 0, 0, 30.0).unwrap();
    field.apply_boundary_conditions().unwrap();

    assert_eq!(field.centering, FieldCentering::Cell);
    assert_eq!(field.interior_dimensions, [3, 1, 1]);
    assert_eq!(field.storage_dimensions, [5, 3, 3]);
    assert_eq!(field.interior_len(), 3);
    assert_eq!(field.len(), 45);
    assert_eq!(*field.get_storage(0, 1, 1).unwrap(), 10.0);
    assert_eq!(*field.get_storage(4, 1, 1).unwrap(), 30.0);
}

#[test]
fn grid_fields_expose_ndarray_views_and_rayon_mutation() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [2, 2, 1]);
    let mut field = GridField3::new(grid, 0.0).unwrap();

    field
        .par_values_mut()
        .enumerate()
        .for_each(|(index, value)| *value = index as f64);

    {
        let view = field.as_array_view().unwrap();
        assert_eq!(view.shape(), &[1, 2, 2]);
        assert_abs_diff_eq!(view[[0, 1, 1]], 3.0);
    }

    {
        let mut view = field.as_array_view_mut().unwrap();
        view[[0, 0, 1]] = 42.0;
    }

    assert_abs_diff_eq!(*field.get(1, 0, 0).unwrap(), 42.0);
}

#[test]
fn evolution_grid_fields_expose_storage_ndarray_views() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 1, 1]);
    let mut field =
        EvolutionGridField3::cell_centered_with_ghosts(grid, 1, BoundaryConditions3::OUTFLOW, 0.0)
            .unwrap();

    field.par_fill(2.0);
    field.set_interior(0, 0, 0, 9.0).unwrap();

    let view = field.as_storage_array_view().unwrap();
    assert_eq!(view.shape(), &[3, 3, 3]);
    assert_abs_diff_eq!(view[[1, 1, 1]], 9.0);
}

#[test]
fn vertex_centered_evolution_grid_has_one_more_interior_point_per_axis() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [2, 3, 4]);
    let field = EvolutionGridField3::new(
        grid,
        FieldCentering::Vertex,
        GhostZones::NONE,
        BoundaryConditions3::PERIODIC,
        0.0,
    )
    .unwrap();

    assert_eq!(field.interior_dimensions, [3, 4, 5]);
    assert_eq!(field.storage_dimensions, [3, 4, 5]);
    assert_eq!(field.interior_len(), 60);
}

#[test]
fn adm_grid_fields_hold_solver_core_variables() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [2, 1, 1]);
    let fields = AdmGridFields::flat_cartesian(grid, CoordinateTime::from_seconds(0.0)).unwrap();
    let cell = fields.cell_state(0).unwrap();

    assert_eq!(fields.grid, grid);
    assert_eq!(fields.lapse.interior_len(), 2);
    assert_eq!(fields.lapse.ghost_zones, GhostZones::symmetric(1));
    assert_eq!(cell.lapse, 1.0);
    assert_eq!(cell.shift, vec3::ZERO);
    assert_eq!(cell.spatial_metric, SymmetricSpatialTensor2::IDENTITY);
    assert_eq!(cell.extrinsic_curvature, SymmetricSpatialTensor2::ZERO);
}

#[test]
fn adm_grid_fields_reject_mismatched_component_grids() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 1, 1]);
    let other_grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [2, 1, 1]);

    let result = AdmGridFields::new(
        grid,
        CoordinateTime::ZERO,
        EvolutionGridField3::cell_centered_with_ghosts(
            other_grid,
            1,
            BoundaryConditions3::OUTFLOW,
            1.0,
        )
        .unwrap(),
        EvolutionGridField3::cell_centered_with_ghosts(
            grid,
            1,
            BoundaryConditions3::OUTFLOW,
            vec3::ZERO,
        )
        .unwrap(),
        EvolutionGridField3::cell_centered_with_ghosts(
            grid,
            1,
            BoundaryConditions3::OUTFLOW,
            SymmetricSpatialTensor2::IDENTITY,
        )
        .unwrap(),
        EvolutionGridField3::cell_centered_with_ghosts(
            grid,
            1,
            BoundaryConditions3::OUTFLOW,
            SymmetricSpatialTensor2::ZERO,
        )
        .unwrap(),
    );

    assert_eq!(result.unwrap_err(), PhysicsError::InvalidGrid);
}

#[test]
fn bssn_grid_fields_hold_conformal_solver_variables() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 2, 1]);
    let fields = BssnGridFields::flat_cartesian(grid, CoordinateTime::from_seconds(0.0)).unwrap();
    let cell = fields.cell_state(1).unwrap();

    assert_eq!(fields.grid, grid);
    assert_eq!(fields.conformal_metric.interior_len(), 2);
    assert_eq!(
        fields.conformal_metric.ghost_zones,
        GhostZones::symmetric(1)
    );
    assert_eq!(cell.lapse, 1.0);
    assert_eq!(cell.shift, vec3::ZERO);
    assert_eq!(cell.conformal_metric, SymmetricSpatialTensor2::IDENTITY);
    assert_eq!(cell.conformal_factor, 0.0);
    assert_eq!(cell.trace_extrinsic_curvature, 0.0);
    assert_eq!(cell.trace_free_curvature, SymmetricSpatialTensor2::ZERO);
    assert_eq!(cell.connection_functions, vec3::ZERO);
}

#[test]
fn explicit_boundary_faces_can_be_configured_independently() {
    let boundaries = BoundaryConditions3::OUTFLOW
        .with_face(
            BoundaryFace::lower(GridAxis::X),
            BoundaryCondition::Periodic,
        )
        .with_face(
            BoundaryFace::upper(GridAxis::Z),
            BoundaryCondition::Reflecting,
        );

    assert_eq!(
        boundaries.get(BoundaryFace::lower(GridAxis::X)),
        BoundaryCondition::Periodic
    );
    assert_eq!(
        boundaries.get(BoundaryFace::upper(GridAxis::Z)),
        BoundaryCondition::Reflecting
    );
    assert_eq!(
        boundaries.get(BoundaryFace::upper(GridAxis::X)),
        BoundaryCondition::Outflow
    );
}

#[test]
fn finite_difference_derivatives_match_polynomial_fields() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [5, 1, 1]);
    let mut field =
        EvolutionGridField3::cell_centered_with_ghosts(grid, 2, BoundaryConditions3::OUTFLOW, 0.0)
            .unwrap();

    for i in 0..5 {
        let x = i as f64;
        field.set_interior(i, 0, 0, x * x).unwrap();
    }
    field.apply_boundary_conditions().unwrap();

    let first = FiniteDifferenceOperator::SECOND_ORDER
        .first_derivative(&field, GridAxis::X)
        .unwrap();
    let second = FiniteDifferenceOperator::SECOND_ORDER
        .second_derivative(&field, GridAxis::X)
        .unwrap();

    assert_abs_diff_eq!(
        *first.get_interior(2, 0, 0).unwrap(),
        4.0,
        epsilon = 1.0e-12
    );
    assert_abs_diff_eq!(
        *second.get_interior(2, 0, 0).unwrap(),
        2.0,
        epsilon = 1.0e-12
    );
}

#[test]
fn finite_difference_gradient_uses_all_axes() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [3, 3, 3]);
    let mut field =
        EvolutionGridField3::cell_centered_with_ghosts(grid, 1, BoundaryConditions3::OUTFLOW, 0.0)
            .unwrap();

    for k in 0..3 {
        for j in 0..3 {
            for i in 0..3 {
                field
                    .set_interior(i, j, k, i as f64 + 2.0 * j as f64 + 3.0 * k as f64)
                    .unwrap();
            }
        }
    }
    field.apply_boundary_conditions().unwrap();

    let gradient = FiniteDifferenceOperator::SECOND_ORDER
        .gradient(&field)
        .unwrap();

    assert_eq!(
        *gradient.get_interior(1, 1, 1).unwrap(),
        vec3::new(1.0, 2.0, 3.0)
    );
}

#[test]
fn kreiss_oliger_dissipation_damps_grid_scale_modes() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [8, 1, 1]);
    let mut field =
        EvolutionGridField3::cell_centered_with_ghosts(grid, 2, BoundaryConditions3::PERIODIC, 0.0)
            .unwrap();

    for i in 0..8 {
        field
            .set_interior(i, 0, 0, if i % 2 == 0 { 1.0 } else { -1.0 })
            .unwrap();
    }
    field.apply_boundary_conditions().unwrap();

    let dissipation = KreissOligerDissipation::new(0.1)
        .dissipation(&field)
        .unwrap();

    assert!(*dissipation.get_interior(2, 0, 0).unwrap() < 0.0);
    assert!(*dissipation.get_interior(3, 0, 0).unwrap() > 0.0);
}

#[test]
fn cfl_condition_accepts_and_rejects_steps() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::new(0.5, 1.0, 1.0), [2, 1, 1]);
    let cfl = CflCondition::new(0.4);

    assert_eq!(
        cfl.maximum_stable_dt(grid, 2.0).unwrap(),
        TimeDuration::from_seconds(0.1)
    );
    assert!(
        cfl.check(grid, 2.0, TimeDuration::from_seconds(0.1))
            .is_ok()
    );
    assert_eq!(
        cfl.check(grid, 2.0, TimeDuration::from_seconds(0.11))
            .unwrap_err(),
        PhysicsError::InvalidStep
    );
}

#[test]
fn rk4_method_of_lines_stepper_advances_scalar_field() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [5, 1, 1]);
    let mut field =
        EvolutionGridField3::cell_centered_with_ghosts(grid, 2, BoundaryConditions3::OUTFLOW, 0.0)
            .unwrap();

    for i in 0..5 {
        field.set_interior(i, 0, 0, i as f64).unwrap();
    }
    field.apply_boundary_conditions().unwrap();

    let system = ScalarAdvectionSystem {
        speed: 1.0,
        derivative: FiniteDifferenceOperator::SECOND_ORDER,
    };
    let stepper = Rk4MethodOfLinesStepper::new(CflCondition::new(0.5));
    let next = stepper
        .step(&system, &field, TimeDuration::from_seconds(0.1))
        .unwrap();

    assert!(*next.get_interior(2, 0, 0).unwrap() < *field.get_interior(2, 0, 0).unwrap());
    assert_eq!(
        stepper
            .step(&system, &field, TimeDuration::from_seconds(0.6))
            .unwrap_err(),
        PhysicsError::InvalidStep
    );
}

#[test]
fn adm_constraint_diagnostics_are_zero_for_flat_cartesian_data() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [3, 3, 3]);
    let fields = AdmGridFields::flat_cartesian_with_ghosts(
        grid,
        CoordinateTime::ZERO,
        2,
        BoundaryConditions3::OUTFLOW,
    )
    .unwrap();

    let diagnostics = ConstraintDiagnosticsOperator::SECOND_ORDER
        .adm_constraints(&fields)
        .unwrap();

    assert!(diagnostics.finite_check.is_finite());
    assert_abs_diff_eq!(
        diagnostics.hamiltonian_reduction.linf,
        0.0,
        epsilon = 1.0e-12
    );
    assert_abs_diff_eq!(diagnostics.momentum_reduction.linf, 0.0, epsilon = 1.0e-12);
}

#[test]
fn bssn_constraint_diagnostics_are_zero_for_flat_cartesian_data() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [3, 3, 3]);
    let fields = BssnGridFields::flat_cartesian_with_ghosts(
        grid,
        CoordinateTime::ZERO,
        2,
        BoundaryConditions3::OUTFLOW,
    )
    .unwrap();

    let diagnostics = ConstraintDiagnosticsOperator::SECOND_ORDER
        .bssn_constraints(&fields)
        .unwrap();

    assert!(diagnostics.finite_check.is_finite());
    assert_abs_diff_eq!(
        diagnostics.adm.hamiltonian_reduction.linf,
        0.0,
        epsilon = 1.0e-12
    );
    assert_abs_diff_eq!(
        diagnostics.adm.momentum_reduction.linf,
        0.0,
        epsilon = 1.0e-12
    );
    assert_abs_diff_eq!(
        diagnostics.determinant_reduction.linf,
        0.0,
        epsilon = 1.0e-12
    );
    assert_abs_diff_eq!(
        diagnostics.trace_free_reduction.linf,
        0.0,
        epsilon = 1.0e-12
    );
}

#[test]
fn bssn_algebraic_constraint_enforcement_normalizes_metric_and_trace() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 1, 1]);
    let mut fields = BssnGridFields::flat_cartesian_with_ghosts(
        grid,
        CoordinateTime::ZERO,
        2,
        BoundaryConditions3::OUTFLOW,
    )
    .unwrap();

    fields
        .conformal_metric
        .set_interior(0, 0, 0, SymmetricSpatialTensor2::diagonal(8.0, 1.0, 1.0))
        .unwrap();
    fields
        .trace_free_curvature
        .set_interior(0, 0, 0, SymmetricSpatialTensor2::diagonal(3.0, 0.0, 0.0))
        .unwrap();

    enforce_bssn_algebraic_constraints(&mut fields).unwrap();

    let diagnostics = ConstraintDiagnosticsOperator::SECOND_ORDER
        .bssn_constraints(&fields)
        .unwrap();

    assert_abs_diff_eq!(
        diagnostics.determinant_reduction.linf,
        0.0,
        epsilon = 1.0e-12
    );
    assert_abs_diff_eq!(
        diagnostics.trace_free_reduction.linf,
        0.0,
        epsilon = 1.0e-12
    );
}

#[test]
fn finite_checks_detect_non_finite_adm_values() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 1, 1]);
    let mut fields = AdmGridFields::flat_cartesian_with_ghosts(
        grid,
        CoordinateTime::ZERO,
        2,
        BoundaryConditions3::OUTFLOW,
    )
    .unwrap();

    fields.lapse.set_interior(0, 0, 0, f64::NAN).unwrap();

    let check = check_adm_finite(&fields).unwrap();

    assert!(!check.is_finite());
    assert_eq!(check.first_non_finite_index, Some(0));
}

#[test]
fn scalar_reductions_report_norms_and_non_finite_counts() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [3, 1, 1]);
    let mut field =
        EvolutionGridField3::cell_centered_with_ghosts(grid, 1, BoundaryConditions3::OUTFLOW, 0.0)
            .unwrap();

    field.set_interior(0, 0, 0, -2.0).unwrap();
    field.set_interior(1, 0, 0, 1.0).unwrap();
    field.set_interior(2, 0, 0, f64::INFINITY).unwrap();

    let reduction = reduce_scalar_field(&field).unwrap();

    assert_eq!(reduction.count, 3);
    assert_eq!(reduction.non_finite_count, 1);
    assert_abs_diff_eq!(reduction.min, -2.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(reduction.max, 1.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(reduction.mean, -0.5, epsilon = 1.0e-12);
    assert_abs_diff_eq!(reduction.l1, 3.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(reduction.l2, 5.0_f64.sqrt(), epsilon = 1.0e-12);
    assert_abs_diff_eq!(reduction.linf, 2.0, epsilon = 1.0e-12);
}
