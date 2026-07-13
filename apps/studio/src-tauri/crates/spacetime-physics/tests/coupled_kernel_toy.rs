use approx::assert_abs_diff_eq;
use spacetime_physics::kernel::{
    AlgebraicConstraintStatus, DynamicalSpacetimeKernel, EvidenceStatus, GrhdEvidence,
    KernelConfig, KernelState, KernelStateKind, KernelStepError, RadiationKernelEvidence,
    StressEnergyAccountingEvidence,
};
use spacetime_physics::packet_deposition::{
    GeodesicPacketHistory, GeodesicPacketSample, LocalFutureNullMomentum,
    PacketStressEnergyEstimator,
};
use spacetime_physics::{
    BssnSourcePath, CoordinateChartKind, CoordinateTime, FourVec, SpacetimeCoordinate,
    TimeDuration, TransportGeodesicState, UniformGrid3, vec3,
};

#[test]
fn public_kernel_step_connects_grhd_m1_packets_and_sourced_geometry() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::new(2.0, 1.0, 1.0), [3, 1, 1]);
    let config = KernelConfig::coupled_toy(grid, CoordinateTime::ZERO);
    let baseline = DynamicalSpacetimeKernel::new(config)
        .step_with_packet_histories(
            KernelState::from_config(&config).unwrap(),
            &[],
            TimeDuration::from_seconds(0.1),
        )
        .unwrap();
    let packet = GeodesicPacketHistory::new(
        17,
        vec![GeodesicPacketSample::deposition_event(
            TransportGeodesicState::null(
                SpacetimeCoordinate::new([0.0, 0.5, 0.5, 0.5], CoordinateChartKind::Cartesian),
                FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
            ),
            PacketStressEnergyEstimator::new(
                LocalFutureNullMomentum::try_new(FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)))
                    .unwrap(),
                0.25,
            ),
        )],
    );

    let result = DynamicalSpacetimeKernel::new(config)
        .step_with_packet_histories(
            KernelState::from_config(&config).unwrap(),
            &[packet],
            TimeDuration::from_seconds(0.1),
        )
        .unwrap();

    assert_eq!(result.state.kind(), KernelStateKind::CoupledToy);
    assert_eq!(result.state.time(), CoordinateTime::from_seconds(0.1));
    assert_eq!(
        result.diagnostics.step.end_time,
        CoordinateTime::from_seconds(0.1)
    );
    assert!(result.state.coupled_cell(0).is_some());
    let GrhdEvidence::Evaluated { primitive_recovery } = &result.diagnostics.grhd else {
        panic!("GRHD evidence must be evaluated")
    };
    assert_eq!(primitive_recovery.len(), 3);
    assert!(
        primitive_recovery
            .iter()
            .all(|cell| !cell.before_flux.is_empty() && !cell.after_update.is_empty())
    );
    let RadiationKernelEvidence::Evaluated { closure, exchange } = &result.diagnostics.radiation
    else {
        panic!("radiation evidence must be evaluated")
    };
    assert_eq!(closure.len(), 3);
    assert_eq!(exchange.len(), 3);
    assert_eq!(
        result.diagnostics.packet_deposition.status,
        EvidenceStatus::Evaluated
    );
    assert_eq!(
        result.diagnostics.packet_deposition.deposited_packet_count,
        1
    );
    let StressEnergyAccountingEvidence::Evaluated {
        matter_energy,
        radiation_energy,
        packet_energy,
        total_energy,
        source_paths,
    } = &result.diagnostics.stress_energy
    else {
        panic!("stress-energy accounting must be evaluated")
    };
    assert_abs_diff_eq!(*matter_energy, 11.5, epsilon = 1.0e-12);
    assert_abs_diff_eq!(*radiation_energy, 3.5, epsilon = 1.0e-12);
    assert_abs_diff_eq!(*packet_energy, 0.25, epsilon = 1.0e-12);
    assert_abs_diff_eq!(*total_energy, 15.25, epsilon = 1.0e-12);
    assert_abs_diff_eq!(
        *total_energy,
        *matter_energy + *radiation_energy + *packet_energy,
        epsilon = 1.0e-12
    );
    assert_eq!(
        source_paths,
        &vec![
            BssnSourcePath::Combined,
            BssnSourcePath::Combined,
            BssnSourcePath::Combined,
        ]
    );
    assert!(result.diagnostics.bssn.is_finite);
    assert!(result.diagnostics.bssn.hamiltonian_linf > 0.0);
    let packet_density = 0.25 / grid.cell_volume();
    let base_k = 0.01 * 2.5 * 0.1;
    let packet_k = 0.01 * packet_density * 0.1;
    let expected_hamiltonian_delta =
        (2.0 / 3.0) * ((base_k + packet_k) * (base_k + packet_k) - base_k * base_k);
    assert_abs_diff_eq!(
        result.diagnostics.bssn.hamiltonian_linf - baseline.diagnostics.bssn.hamiltonian_linf,
        expected_hamiltonian_delta,
        epsilon = 1.0e-12
    );
    assert_eq!(
        result.diagnostics.bssn.algebraic_constraints,
        AlgebraicConstraintStatus::Satisfied
    );

    let second = DynamicalSpacetimeKernel::new(config)
        .step_with_packet_histories(result.state, &[], TimeDuration::from_seconds(0.1))
        .unwrap();
    assert_eq!(
        second.diagnostics.packet_deposition.deposited_packet_count,
        0
    );
    let StressEnergyAccountingEvidence::Evaluated { packet_energy, .. } =
        second.diagnostics.stress_energy
    else {
        panic!("second-step accounting must be evaluated")
    };
    assert_abs_diff_eq!(packet_energy, 0.0, epsilon = 1.0e-12);
}

#[test]
fn coupled_kernel_rejects_invalid_timestep_and_mismatched_state_without_advancing() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [3, 1, 1]);
    let coupled = KernelConfig::coupled_toy(grid, CoordinateTime::ZERO);
    for dt in [TimeDuration::ZERO, TimeDuration::from_seconds(f64::NAN)] {
        let state = KernelState::from_config(&coupled).unwrap();
        let failure = DynamicalSpacetimeKernel::new(coupled)
            .step_with_packet_histories(state, &[], dt)
            .unwrap_err();
        assert_eq!(failure.error, KernelStepError::InvalidTimestep);
        assert_eq!(failure.state.time(), CoordinateTime::ZERO);
    }

    let flat = KernelConfig::flat_empty(grid, CoordinateTime::ZERO);
    let flat_state = KernelState::from_config(&flat).unwrap();
    assert_eq!(
        DynamicalSpacetimeKernel::new(flat)
            .step_with_packet_histories(flat_state, &[], TimeDuration::from_seconds(0.1))
            .unwrap_err()
            .error,
        KernelStepError::StateConfigMismatch
    );

    let missing_coupled_state = KernelState::from_config(&flat).unwrap();
    assert_eq!(
        DynamicalSpacetimeKernel::new(coupled)
            .step_with_packet_histories(missing_coupled_state, &[], TimeDuration::from_seconds(0.1))
            .unwrap_err()
            .error,
        KernelStepError::StateConfigMismatch
    );

    let other_grid = UniformGrid3::new(vec3::ZERO, vec3::splat(2.0), [3, 1, 1]);
    let other_config = KernelConfig::coupled_toy(other_grid, CoordinateTime::ZERO);
    let state = KernelState::from_config(&coupled).unwrap();
    assert_eq!(
        DynamicalSpacetimeKernel::new(other_config)
            .step_with_packet_histories(state, &[], TimeDuration::from_seconds(0.1))
            .unwrap_err()
            .error,
        KernelStepError::StateConfigMismatch
    );

    let later_config = KernelConfig::coupled_toy(grid, CoordinateTime::from_seconds(1.0));
    let state = KernelState::from_config(&coupled).unwrap();
    assert_eq!(
        DynamicalSpacetimeKernel::new(later_config)
            .step_with_packet_histories(state, &[], TimeDuration::from_seconds(0.1))
            .unwrap_err()
            .error,
        KernelStepError::StateConfigMismatch
    );
}
