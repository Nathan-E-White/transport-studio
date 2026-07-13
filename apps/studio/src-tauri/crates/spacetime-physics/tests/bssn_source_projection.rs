use approx::assert_abs_diff_eq;
use spacetime_physics::radiation::OrthonormalGrayRadiationMoments;
use spacetime_physics::{
    AlgebraicBssnGaugeEnforcer, BoundaryConditions3, BssnGeometryStepper, BssnGridFields,
    BssnSourcePath, ConservativeMatterCell, ConservativeMatterGrid, ConstraintDiagnosticsOperator,
    ControlledToyBssnSourceStepper, CoordinateChartKind, CoordinateTime, CoupledBssnMatterState,
    CoupledBssnMatterStepper, EvolutionGridField3, FourVec, IdealGasEquationOfState,
    NoopMatterRadiationStepper, SpacetimeCoordinate, StressEnergyContribution, StressEnergyTensor,
    TimeDuration, UniformGrid3, ValenciaIdealGas, ValenciaPrimitive, project_bssn_sources,
    project_valencia_gray_m1_bssn_sources, vec3,
};

#[test]
fn projection_distinguishes_vacuum_matter_radiation_and_combined_sources() {
    let matter = StressEnergyTensor::new([
        [2.0, 0.5, 0.0, 0.0],
        [0.5, 0.1, 0.0, 0.0],
        [0.0, 0.0, 0.2, 0.0],
        [0.0, 0.0, 0.0, 0.3],
    ]);
    let radiation = StressEnergyTensor::new([
        [3.0, 0.0, 1.0, 0.0],
        [0.0, 0.4, 0.0, 0.0],
        [1.0, 0.0, 0.5, 0.0],
        [0.0, 0.0, 0.0, 0.6],
    ]);

    assert_eq!(
        project_bssn_sources(StressEnergyTensor::ZERO, StressEnergyTensor::ZERO)
            .unwrap()
            .path,
        BssnSourcePath::Vacuum
    );
    assert_eq!(
        project_bssn_sources(matter, StressEnergyTensor::ZERO)
            .unwrap()
            .path,
        BssnSourcePath::Matter
    );
    assert_eq!(
        project_bssn_sources(StressEnergyTensor::ZERO, radiation)
            .unwrap()
            .path,
        BssnSourcePath::Radiation
    );
    let combined = project_bssn_sources(matter, radiation).unwrap();
    assert_eq!(combined.path, BssnSourcePath::Combined);
    assert_abs_diff_eq!(combined.total.energy_density, 5.0);
    assert_eq!(combined.total.momentum_density, vec3::new(0.5, 1.0, 0.0));
    assert_abs_diff_eq!(combined.matter.spatial_stress_trace, 0.6);
    assert_abs_diff_eq!(combined.radiation.spatial_stress_trace, 1.5);
    assert_abs_diff_eq!(combined.total.spatial_stress_trace, 2.1, epsilon = 1.0e-12);
}

#[test]
fn asymmetric_stress_energy_is_rejected_at_the_projection_boundary() {
    for (mu, nu) in [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)] {
        let mut components = [[0.0; 4]; 4];
        components[mu][nu] = 0.5;
        components[nu][mu] = 0.4;
        assert!(
            project_bssn_sources(
                StressEnergyTensor::new(components),
                StressEnergyTensor::ZERO
            )
            .is_err(),
            "pair ({mu}, {nu})"
        );
    }

    let mut small_roundoff = [[0.0; 4]; 4];
    small_roundoff[0][1] = 0.5e-12;
    assert!(
        project_bssn_sources(
            StressEnergyTensor::new(small_roundoff),
            StressEnergyTensor::ZERO
        )
        .is_ok()
    );
    let mut exact_tolerance = [[0.0; 4]; 4];
    exact_tolerance[0][1] = 1.0e-12 / (1.0 - 1.0e-12);
    assert!(
        project_bssn_sources(
            StressEnergyTensor::new(exact_tolerance),
            StressEnergyTensor::ZERO
        )
        .is_ok()
    );
    let mut large_roundoff = [[0.0; 4]; 4];
    large_roundoff[0][1] = 1.0e12;
    large_roundoff[1][0] = 1.0e12 - 0.5;
    assert!(
        project_bssn_sources(
            StressEnergyTensor::new(large_roundoff),
            StressEnergyTensor::ZERO
        )
        .is_ok()
    );
}

#[test]
fn extreme_finite_symmetric_sources_never_produce_nonfinite_projections() {
    let mut extreme_momentum = [[0.0; 4]; 4];
    extreme_momentum[0][1] = f64::MAX;
    extreme_momentum[1][0] = f64::MAX;
    let projection = project_bssn_sources(
        StressEnergyTensor::new(extreme_momentum),
        StressEnergyTensor::ZERO,
    )
    .unwrap();
    assert_eq!(projection.matter.momentum_density.x, f64::MAX);

    let overflowing_trace = StressEnergyTensor::new([
        [0.0, 0.0, 0.0, 0.0],
        [0.0, f64::MAX, 0.0, 0.0],
        [0.0, 0.0, f64::MAX, 0.0],
        [0.0, 0.0, 0.0, f64::MAX],
    ]);
    assert!(project_bssn_sources(overflowing_trace, StressEnergyTensor::ZERO).is_err());

    let extreme_energy =
        StressEnergyTensor::new([[f64::MAX, 0.0, 0.0, 0.0], [0.0; 4], [0.0; 4], [0.0; 4]]);
    assert!(project_bssn_sources(extreme_energy, extreme_energy).is_err());
}

#[test]
fn canonical_valencia_and_gray_m1_states_source_the_toy_geometry_path() {
    let eos = ValenciaIdealGas { gamma: 1.4 };
    let matter = ValenciaPrimitive {
        rest_mass_density: 1.0,
        velocity: vec3::new(0.6, 0.0, 0.0),
        specific_internal_energy: 1.0,
        pressure: 0.4,
    };
    let radiation = OrthonormalGrayRadiationMoments::new(3.0, vec3::ZERO);
    let (total_tensor, evidence) =
        project_valencia_gray_m1_bssn_sources(matter, eos, radiation).unwrap();

    assert_eq!(evidence.path, BssnSourcePath::Combined);
    assert_abs_diff_eq!(evidence.matter.energy_density, 3.35, epsilon = 1.0e-12);
    assert_abs_diff_eq!(evidence.matter.momentum_density.x, 2.25, epsilon = 1.0e-12);
    assert_abs_diff_eq!(
        evidence.matter.spatial_stress.components[0][0],
        1.75,
        epsilon = 1.0e-12
    );
    assert_abs_diff_eq!(evidence.radiation.energy_density, 3.0, epsilon = 1.0e-12);
    assert_abs_diff_eq!(evidence.total.energy_density, 6.35, epsilon = 1.0e-12);
    assert_abs_diff_eq!(evidence.total.spatial_stress_trace, 5.55, epsilon = 1.0e-12);

    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 1, 1]);
    let mut geometry = BssnGridFields::flat_cartesian_with_ghosts(
        grid,
        CoordinateTime::ZERO,
        1,
        BoundaryConditions3::OUTFLOW,
    )
    .unwrap();
    let mut stress = EvolutionGridField3::cell_centered_with_ghosts(
        grid,
        1,
        BoundaryConditions3::OUTFLOW,
        StressEnergyTensor::ZERO,
    )
    .unwrap();
    stress.set_interior(0, 0, 0, total_tensor).unwrap();
    ControlledToyBssnSourceStepper {
        response_coefficient: 2.0,
    }
    .evolve_geometry(&mut geometry, &stress, TimeDuration::from_seconds(0.25))
    .unwrap();
    assert_abs_diff_eq!(
        *geometry
            .trace_extrinsic_curvature
            .get_interior(0, 0, 0)
            .unwrap(),
        3.175,
        epsilon = 1.0e-12
    );
}

#[test]
fn controlled_total_source_changes_geometry_and_preserves_constraint_residuals() {
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
        ControlledToyBssnSourceStepper {
            response_coefficient: 1.0,
        },
        NoopMatterRadiationStepper,
        AlgebraicBssnGaugeEnforcer,
        ConstraintDiagnosticsOperator::SECOND_ORDER,
        2,
        BoundaryConditions3::OUTFLOW,
    );
    let radiation = StressEnergyContribution::new(
        SpacetimeCoordinate::new([0.0, 0.5, 0.5, 0.5], CoordinateChartKind::Cartesian),
        FourVec::new(2.0, vec3::ZERO),
        0.5,
    );

    let diagnostics = stepper
        .step(&mut state, &[radiation], TimeDuration::from_seconds(0.1))
        .unwrap();

    let source = diagnostics.bssn_sources.get_interior(0, 0, 0).unwrap();
    assert_eq!(source.path, BssnSourcePath::Combined);
    assert_abs_diff_eq!(source.matter.energy_density, 3.0);
    assert_abs_diff_eq!(source.radiation.energy_density, 2.0);
    assert_abs_diff_eq!(source.total.energy_density, 5.0);
    assert_abs_diff_eq!(
        *state
            .geometry
            .trace_extrinsic_curvature
            .get_interior(0, 0, 0)
            .unwrap(),
        0.5
    );
    assert_abs_diff_eq!(state.geometry.time.seconds(), 0.1);
    assert_abs_diff_eq!(state.matter.time.seconds(), 0.1);
    assert_abs_diff_eq!(
        diagnostics.constraints.adm.hamiltonian_reduction.linf,
        1.0 / 6.0,
        epsilon = 1.0e-12
    );
    assert!(diagnostics.constraints.finite_check.is_finite());
}

#[test]
fn controlled_source_step_rejects_invalid_configuration_and_grid() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 1, 1]);
    let mut geometry = BssnGridFields::flat_cartesian_with_ghosts(
        grid,
        CoordinateTime::ZERO,
        1,
        BoundaryConditions3::OUTFLOW,
    )
    .unwrap();
    let stress = EvolutionGridField3::cell_centered_with_ghosts(
        grid,
        1,
        BoundaryConditions3::OUTFLOW,
        StressEnergyTensor::ZERO,
    )
    .unwrap();
    assert!(
        ControlledToyBssnSourceStepper {
            response_coefficient: f64::NAN,
        }
        .evolve_geometry(&mut geometry, &stress, TimeDuration::from_seconds(0.1))
        .is_err()
    );
    assert!(
        ControlledToyBssnSourceStepper {
            response_coefficient: 1.0,
        }
        .evolve_geometry(&mut geometry, &stress, TimeDuration::from_seconds(f64::NAN))
        .is_err()
    );

    let other_grid = UniformGrid3::new(vec3::ZERO, vec3::splat(2.0), [1, 1, 1]);
    let mismatched = EvolutionGridField3::cell_centered_with_ghosts(
        other_grid,
        1,
        BoundaryConditions3::OUTFLOW,
        StressEnergyTensor::ZERO,
    )
    .unwrap();
    assert!(
        ControlledToyBssnSourceStepper {
            response_coefficient: 1.0,
        }
        .evolve_geometry(&mut geometry, &mismatched, TimeDuration::from_seconds(0.1))
        .is_err()
    );
}

#[test]
fn controlled_source_step_is_atomic_when_a_later_cell_is_invalid() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [2, 1, 1]);
    let mut geometry = BssnGridFields::flat_cartesian_with_ghosts(
        grid,
        CoordinateTime::ZERO,
        1,
        BoundaryConditions3::OUTFLOW,
    )
    .unwrap();
    let before = geometry.clone();
    let mut stress = EvolutionGridField3::cell_centered_with_ghosts(
        grid,
        1,
        BoundaryConditions3::OUTFLOW,
        StressEnergyTensor::ZERO,
    )
    .unwrap();
    stress
        .set_interior(
            0,
            0,
            0,
            StressEnergyTensor::new([[1.0, 0.0, 0.0, 0.0], [0.0; 4], [0.0; 4], [0.0; 4]]),
        )
        .unwrap();
    stress
        .set_interior(
            1,
            0,
            0,
            StressEnergyTensor::new([[f64::NAN, 0.0, 0.0, 0.0], [0.0; 4], [0.0; 4], [0.0; 4]]),
        )
        .unwrap();

    assert!(
        ControlledToyBssnSourceStepper {
            response_coefficient: 1.0,
        }
        .evolve_geometry(&mut geometry, &stress, TimeDuration::from_seconds(0.1))
        .is_err()
    );
    assert_eq!(geometry, before);
}
