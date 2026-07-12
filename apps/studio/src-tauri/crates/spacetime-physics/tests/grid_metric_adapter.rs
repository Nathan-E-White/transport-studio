use spacetime_physics::{
    AdmGridFields, AffineStep, BssnGridFields, CoordinateChartKind, CoordinateTime, FourVec,
    FourVelocity, GridMetricAdapterError, GridMetricFieldAdapter, GridMetricInterpolation,
    Rk4GeodesicStepper, SpacetimeCoordinate, SymmetricSpatialTensor2, TransportGeodesicState,
    UniformGrid3, vec3,
};

fn flat_fields() -> BssnGridFields {
    BssnGridFields::flat_cartesian(
        UniformGrid3::new(vec3::new(-4.0, -4.0, -4.0), vec3::splat(1.0), [8, 8, 8]),
        CoordinateTime::ZERO,
    )
    .unwrap()
}

fn flat_adapter() -> GridMetricFieldAdapter<'static> {
    let fields = Box::leak(Box::new(flat_fields()));
    GridMetricFieldAdapter::new(fields, GridMetricInterpolation::NearestCell)
}

fn query_mutated(mutator: impl FnOnce(&mut BssnGridFields)) -> GridMetricAdapterError {
    let mut fields = flat_fields();
    mutator(&mut fields);
    GridMetricFieldAdapter::new(&fields, GridMetricInterpolation::NearestCell)
        .query(SpacetimeCoordinate::new(
            [0.0; 4],
            CoordinateChartKind::Cartesian,
        ))
        .unwrap_err()
}

#[test]
fn flat_grid_adapter_preserves_timelike_geodesic_invariant() {
    let metric = flat_adapter();
    let state = TransportGeodesicState::timelike(
        SpacetimeCoordinate::new([0.0, 0.0, 0.0, 0.0], CoordinateChartKind::Cartesian),
        FourVelocity::from_velocity(vec3::new(0.1, 0.2, 0.0), 1.0).unwrap(),
    );
    metric.query(state.x).unwrap();
    let next = Rk4GeodesicStepper
        .step_transport_geodesic(&metric, state, AffineStep::new(0.25))
        .unwrap();
    assert!((next.invariant(&metric) - state.invariant(&metric)).abs() < 1.0e-12);
}

#[test]
fn flat_grid_adapter_preserves_null_geodesic_invariant() {
    let metric = flat_adapter();
    let state = TransportGeodesicState::null(
        SpacetimeCoordinate::new([0.0, 0.0, 0.0, 0.0], CoordinateChartKind::Cartesian),
        FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
    );
    let next = Rk4GeodesicStepper
        .step_transport_geodesic(&metric, state, AffineStep::new(0.5))
        .unwrap();
    assert!(next.invariant(&metric).abs() < 1.0e-12);
}

#[test]
fn adapter_diagnostics_separate_policy_and_numerical_failures() {
    let metric = flat_adapter();
    let spherical = SpacetimeCoordinate::new([0.0; 4], CoordinateChartKind::Spherical);
    assert_eq!(
        metric.query(spherical).unwrap_err(),
        GridMetricAdapterError::UnsupportedChart(CoordinateChartKind::Spherical)
    );

    let trilinear_fields = flat_fields();
    let trilinear =
        GridMetricFieldAdapter::new(&trilinear_fields, GridMetricInterpolation::Trilinear);
    let cartesian = SpacetimeCoordinate::new([0.0; 4], CoordinateChartKind::Cartesian);
    assert_eq!(
        trilinear.query(cartesian).unwrap_err(),
        GridMetricAdapterError::UnsupportedInterpolation(GridMetricInterpolation::Trilinear)
    );

    let outside = SpacetimeCoordinate::new([0.0, 99.0, 0.0, 0.0], CoordinateChartKind::Cartesian);
    assert!(matches!(
        metric.query(outside),
        Err(GridMetricAdapterError::OutOfDomain)
    ));
}

#[test]
fn adapter_rejects_non_finite_components_and_adapts_non_flat_data() {
    for shift in [
        vec3::new(f64::NAN, 0.0, 0.0),
        vec3::new(0.0, f64::NAN, 0.0),
        vec3::new(0.0, 0.0, f64::NAN),
    ] {
        assert_eq!(
            query_mutated(|fields| fields.shift.set_interior(4, 4, 4, shift).unwrap()),
            GridMetricAdapterError::NumericalFailure(
                spacetime_physics::PhysicsError::NonFiniteValue
            ),
        );
    }
    let mut fields = flat_fields();
    fields
        .shift
        .set_interior(4, 4, 4, vec3::new(0.1, 0.0, 0.0))
        .unwrap();
    let mut spatial = SymmetricSpatialTensor2::IDENTITY;
    spatial.components[0][0] = 2.0;
    fields
        .conformal_metric
        .set_interior(4, 4, 4, spatial)
        .unwrap();
    let sample = GridMetricFieldAdapter::new(&fields, GridMetricInterpolation::NearestCell)
        .query(SpacetimeCoordinate::new(
            [0.0; 4],
            CoordinateChartKind::Cartesian,
        ))
        .unwrap();
    assert_eq!(sample.covariant.components[1][1], -2.0);
    assert_eq!(sample.covariant.components[0][1], -0.2);
}

#[test]
fn adm_fields_use_the_same_point_query_seam() {
    let fields = AdmGridFields::flat_cartesian(
        UniformGrid3::new(vec3::new(-1.0, -1.0, -1.0), vec3::splat(1.0), [2, 2, 2]),
        CoordinateTime::ZERO,
    )
    .unwrap();
    let sample = GridMetricFieldAdapter::from_adm(&fields, GridMetricInterpolation::NearestCell)
        .query(SpacetimeCoordinate::new(
            [0.0; 4],
            CoordinateChartKind::Cartesian,
        ))
        .unwrap();
    assert_eq!(
        sample.covariant,
        spacetime_physics::CovariantTensor2::minkowski_plus_minus_minus_minus()
    );
}

#[test]
fn rk4_returns_out_of_domain_instead_of_panicking() {
    let fields = BssnGridFields::flat_cartesian(
        UniformGrid3::new(vec3::new(-0.5, -0.5, -0.5), vec3::splat(1.0), [1, 1, 1]),
        CoordinateTime::ZERO,
    )
    .unwrap();
    let metric = GridMetricFieldAdapter::from_bssn(&fields, GridMetricInterpolation::NearestCell);
    let state = TransportGeodesicState::null(
        SpacetimeCoordinate::new([0.0; 4], CoordinateChartKind::Cartesian),
        FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
    );
    assert_eq!(
        Rk4GeodesicStepper
            .step_transport_geodesic(&metric, state, AffineStep::new(2.0))
            .unwrap_err(),
        spacetime_physics::PhysicsError::PointOutsideGrid,
    );
}

#[test]
fn nontrivial_bssn_sample_reconstructs_inverse_3_plus_1_metric() {
    let mut fields = flat_fields();
    fields.lapse.set_interior(4, 4, 4, 2.0).unwrap();
    fields
        .shift
        .set_interior(4, 4, 4, vec3::new(0.1, 0.2, 0.3))
        .unwrap();
    let spatial = SymmetricSpatialTensor2::new([[2.0, 0.2, 0.1], [0.2, 3.0, 0.3], [0.1, 0.3, 4.0]]);
    fields
        .conformal_metric
        .set_interior(4, 4, 4, spatial)
        .unwrap();
    fields
        .conformal_factor
        .set_interior(4, 4, 4, 2.0_f64.ln() / 4.0)
        .unwrap();
    let sample = GridMetricFieldAdapter::from_bssn(&fields, GridMetricInterpolation::NearestCell)
        .query(SpacetimeCoordinate::new(
            [0.0; 4],
            CoordinateChartKind::Cartesian,
        ))
        .unwrap();

    assert!((sample.covariant.components[0][0] - 2.9).abs() < 1.0e-12);
    assert!((sample.covariant.components[0][1] + 0.54).abs() < 1.0e-12);
    assert!((sample.covariant.components[0][2] + 1.42).abs() < 1.0e-12);
    assert!((sample.covariant.components[0][3] + 2.54).abs() < 1.0e-12);
    for mu in 0..4 {
        for nu in 0..4 {
            let product: f64 = (0..4)
                .map(|rho| {
                    sample.covariant.components[mu][rho] * sample.inverse.components[rho][nu]
                })
                .sum();
            let expected = if mu == nu { 1.0 } else { 0.0 };
            assert!(
                (product - expected).abs() < 1.0e-11,
                "inverse mismatch at ({mu}, {nu})"
            );
        }
    }
}

#[test]
fn adapter_rejects_nonpositive_lapse_and_singular_spatial_metrics() {
    assert!(matches!(
        query_mutated(|fields| fields.lapse.set_interior(4, 4, 4, 0.0).unwrap()),
        GridMetricAdapterError::NumericalFailure(_)
    ));
    for z_scale in [0.0, 1.0e-15] {
        assert_eq!(
            query_mutated(|fields| {
                fields
                    .conformal_metric
                    .set_interior(
                        4,
                        4,
                        4,
                        SymmetricSpatialTensor2::new([
                            [1.0, 0.0, 0.0],
                            [0.0, 1.0, 0.0],
                            [0.0, 0.0, z_scale],
                        ]),
                    )
                    .unwrap();
            }),
            GridMetricAdapterError::NumericalFailure(
                spacetime_physics::PhysicsError::SingularMetric
            ),
        );
    }
    let mut threshold = flat_fields();
    threshold
        .conformal_metric
        .set_interior(
            4,
            4,
            4,
            SymmetricSpatialTensor2::new([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0e-14]]),
        )
        .unwrap();
    assert!(
        GridMetricFieldAdapter::new(&threshold, GridMetricInterpolation::NearestCell)
            .query(SpacetimeCoordinate::new(
                [0.0; 4],
                CoordinateChartKind::Cartesian
            ))
            .is_ok()
    );
}

#[test]
fn varying_grid_lapse_produces_finite_difference_connection() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::new(0.5, 1.0, 1.0), [3, 1, 1]);
    let mut fields = BssnGridFields::flat_cartesian(grid, CoordinateTime::ZERO).unwrap();
    fields.lapse.set_interior(0, 0, 0, 1.0).unwrap();
    fields.lapse.set_interior(1, 0, 0, 2.0).unwrap();
    fields.lapse.set_interior(2, 0, 0, 3.0).unwrap();
    let sample = GridMetricFieldAdapter::from_bssn(&fields, GridMetricInterpolation::NearestCell)
        .query(SpacetimeCoordinate::new(
            [0.0, 0.75, 0.5, 0.5],
            CoordinateChartKind::Cartesian,
        ))
        .unwrap();

    assert!((sample.christoffel.components[0][0][1] - 1.0).abs() < 1.0e-12);
    assert!((sample.christoffel.components[1][0][0] - 4.0).abs() < 1.0e-12);
    let left = GridMetricFieldAdapter::from_bssn(&fields, GridMetricInterpolation::NearestCell)
        .query(SpacetimeCoordinate::new(
            [0.0, 0.25, 0.5, 0.5],
            CoordinateChartKind::Cartesian,
        ))
        .unwrap();
    let right = GridMetricFieldAdapter::from_bssn(&fields, GridMetricInterpolation::NearestCell)
        .query(SpacetimeCoordinate::new(
            [0.0, 1.25, 0.5, 0.5],
            CoordinateChartKind::Cartesian,
        ))
        .unwrap();
    assert!((left.christoffel.components[0][0][1] - 3.0).abs() < 1.0e-12);
    assert!((right.christoffel.components[0][0][1] - 5.0 / 9.0).abs() < 1.0e-12);
}
