use approx::assert_abs_diff_eq;
use spacetime_physics::kernel::{
    DynamicalSpacetimeKernel, EvidenceStatus, KernelConfig, KernelState, KernelStateKind,
};
use spacetime_physics::packet_deposition::{
    GeodesicPacketHistory, GeodesicPacketSample, InvalidLocalFutureNullMomentum,
    LocalFutureNullMomentum, PacketDepositionAdapter, PacketDepositionOutcome,
    PacketRejectionReason, PacketStressEnergyEstimator,
};
use spacetime_physics::{
    BackreactionPolicy, BoundaryConditions3, ConservativeMatterGrid, CoordinateChartKind,
    CoordinateTime, FourVec, FourVelocity, GeodesicKind, IdealGasEquationOfState, PhysicsError,
    SpacetimeCoordinate, StressEnergyContribution, TimeDuration, TransportGeodesicState,
    UniformGrid3, vec3,
};

#[test]
fn passive_packet_histories_leave_matter_state_unchanged() {
    let mut matter = matter_grid();
    let original = matter.clone();

    let report = PacketDepositionAdapter::default()
        .deposit(
            &mut matter,
            &[photon_history(7, 0.25)],
            BackreactionPolicy::NONE,
        )
        .unwrap();

    assert_eq!(matter, original);
    assert!(report.contributions.is_empty());
    assert_eq!(report.diagnostics.deposited_packet_count, 0);
    assert_eq!(report.diagnostics.passive_packet_count, 1);
    assert_eq!(report.diagnostics.rejected_packet_count, 0);
}

#[test]
fn enabled_history_changes_total_stress_energy_only_through_the_adapter() {
    let mut matter = matter_grid();
    let original_density = matter.density.clone();
    let original_momentum = matter.momentum.clone();
    let original_energy = matter.total_energy_density.clone();

    let report = PacketDepositionAdapter::default()
        .deposit(
            &mut matter,
            &[photon_history(11, 0.25)],
            BackreactionPolicy::RAD_HYDRO,
        )
        .unwrap();

    assert_eq!(matter.density, original_density);
    assert_eq!(matter.momentum, original_momentum);
    assert_eq!(matter.total_energy_density, original_energy);
    assert_eq!(report.contributions.len(), 1);
    assert_eq!(
        report.contributions[0].four_momentum,
        FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
    );
    assert_eq!(report.diagnostics.deposited_packet_count, 1);
    assert_eq!(report.diagnostics.passive_packet_count, 0);
    assert_eq!(report.diagnostics.rejected_packet_count, 0);

    let total = matter.total_stress_energy_at_cell(0, 0, 0).unwrap();
    let contribution = report.contributions[0].tensor_density(1.0).unwrap();
    assert_abs_diff_eq!(total.components[0][0], 0.25, epsilon = 1.0e-12);
    assert_eq!(total, contribution);
}

#[test]
fn rejected_and_unsupported_packets_are_diagnosed_without_partial_deposition() {
    let mut matter = matter_grid();
    let original = matter.clone();
    let center = coordinate([0.0, 0.5, 0.5, 0.5], CoordinateChartKind::Cartesian);
    let valid_event = deposition_event(
        TransportGeodesicState::null(center, FourVec::new(4.0, vec3::new(4.0, 0.0, 0.0))),
        FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
        1.0,
    );
    let histories = vec![
        GeodesicPacketHistory::new(1, vec![]),
        GeodesicPacketHistory::new(
            2,
            vec![deposition_event(
                TransportGeodesicState::timelike(
                    center,
                    FourVelocity {
                        temporal: 1.0,
                        spatial: vec3::ZERO,
                    },
                ),
                FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
                1.0,
            )],
        ),
        photon_history(3, 0.0),
        GeodesicPacketHistory::new(
            4,
            vec![deposition_event(
                TransportGeodesicState::null(
                    coordinate([0.0, 0.5, 0.5, 0.5], CoordinateChartKind::Spherical),
                    FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
                ),
                FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
                1.0,
            )],
        ),
        GeodesicPacketHistory::new(
            5,
            vec![deposition_event(
                TransportGeodesicState::null(
                    center,
                    FourVec::new(f64::NAN, vec3::new(1.0, 0.0, 0.0)),
                ),
                FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
                1.0,
            )],
        ),
        GeodesicPacketHistory::new(
            6,
            vec![deposition_event(
                TransportGeodesicState::null(center, FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0))),
                FourVec::new(f64::MAX, vec3::new(f64::MAX, 0.0, 0.0)),
                1.0,
            )],
        ),
        GeodesicPacketHistory::new(
            7,
            vec![
                valid_event,
                deposition_event(
                    TransportGeodesicState::null(
                        coordinate([0.0, 2.0, 0.5, 0.5], CoordinateChartKind::Cartesian),
                        FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
                    ),
                    FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
                    1.0,
                ),
            ],
        ),
    ];

    let report = PacketDepositionAdapter::default()
        .deposit(&mut matter, &histories, BackreactionPolicy::RAD_HYDRO)
        .unwrap();

    assert_eq!(matter, original);
    assert!(report.contributions.is_empty());
    assert_eq!(report.diagnostics.deposited_packet_count, 0);
    assert_eq!(report.diagnostics.rejected_packet_count, 7);
    let outcomes = report
        .diagnostics
        .packets
        .iter()
        .map(|diagnostic| diagnostic.outcome)
        .collect::<Vec<_>>();
    assert_eq!(
        outcomes,
        vec![
            rejected(PacketRejectionReason::EmptyHistory),
            rejected(PacketRejectionReason::UnsupportedGeodesicKind {
                kind: GeodesicKind::Timelike,
            }),
            rejected(PacketRejectionReason::InvalidEstimatorWeight),
            rejected(PacketRejectionReason::UnsupportedCoordinateChart {
                chart: CoordinateChartKind::Spherical,
            }),
            rejected(PacketRejectionReason::NonFiniteTangent),
            rejected(PacketRejectionReason::Deposition(
                PhysicsError::NonFiniteValue,
            )),
            rejected(PacketRejectionReason::Deposition(
                PhysicsError::PointOutsideGrid,
            )),
        ],
    );
}

#[test]
fn physical_packet_momentum_must_be_finite_future_directed_and_null() {
    assert_eq!(
        LocalFutureNullMomentum::try_new(FourVec::new(f64::NAN, vec3::ZERO)),
        Err(InvalidLocalFutureNullMomentum::NonFinite),
    );
    assert_eq!(
        LocalFutureNullMomentum::try_new(FourVec::new(0.0, vec3::ZERO)),
        Err(InvalidLocalFutureNullMomentum::NotFutureDirected),
    );
    assert_eq!(
        LocalFutureNullMomentum::try_new(FourVec::new(-1.0, vec3::new(1.0, 0.0, 0.0))),
        Err(InvalidLocalFutureNullMomentum::NotFutureDirected),
    );
    assert_eq!(
        LocalFutureNullMomentum::try_new(FourVec::new(2.0, vec3::new(1.0, 0.0, 0.0))),
        Err(InvalidLocalFutureNullMomentum::NotNull),
    );
    assert_eq!(
        LocalFutureNullMomentum::try_new(FourVec::new(
            f64::MAX,
            vec3::new(f64::MAX / 2.0, 0.0, 0.0),
        )),
        Err(InvalidLocalFutureNullMomentum::NotNull),
    );
    assert!(
        LocalFutureNullMomentum::try_new(FourVec::new(f64::MAX, vec3::new(f64::MAX, 0.0, 0.0),))
            .is_ok()
    );
    let near_null = FourVec::new(3.0, vec3::new((9.0_f64 - 7.5e-12).sqrt(), 0.0, 0.0));
    assert!(LocalFutureNullMomentum::try_new(near_null).is_ok());
    // These exactly representable values put the normalized residual on the accepted boundary.
    let tolerance_boundary = FourVec::new(1.0, vec3::new(0.999_999_999_999_5, 0.0, 0.0));
    assert!(LocalFutureNullMomentum::try_new(tolerance_boundary).is_ok());
    let outside_tolerance = FourVec::new(3.0, vec3::new((9.0_f64 - 18.0e-12).sqrt(), 0.0, 0.0));
    assert_eq!(
        LocalFutureNullMomentum::try_new(outside_tolerance),
        Err(InvalidLocalFutureNullMomentum::NotNull),
    );
    assert_eq!(
        LocalFutureNullMomentum::try_new(FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)))
            .unwrap()
            .four_vec(),
        FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
    );
}

#[test]
fn stress_energy_density_rejects_non_finite_inputs_and_scales_by_cell_volume() {
    let position = coordinate([0.0, 0.5, 0.5, 0.5], CoordinateChartKind::Cartesian);
    let valid =
        StressEnergyContribution::new(position, FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)), 2.0);
    assert_abs_diff_eq!(
        valid.tensor_density(4.0).unwrap().components[0][0],
        0.5,
        epsilon = 1.0e-12,
    );
    assert_eq!(
        StressEnergyContribution::new(position, valid.four_momentum, f64::NAN).tensor_density(1.0),
        Err(PhysicsError::NonFiniteValue),
    );
    assert_eq!(
        valid.tensor_density(f64::NAN),
        Err(PhysicsError::NonFiniteValue),
    );
    assert_eq!(valid.tensor_density(0.0), Err(PhysicsError::NonFiniteValue),);
}

#[test]
fn canonical_kernel_state_records_packet_deposition_evidence() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 1, 1]);
    let config = KernelConfig::flat_empty(grid, CoordinateTime::ZERO);
    let mut passive = KernelState::from_config(&config).unwrap();

    passive
        .deposit_packet_histories(&[photon_history(21, 0.25)], BackreactionPolicy::NONE)
        .unwrap();
    passive
        .deposit_packet_histories(&[photon_history(23, 0.25)], BackreactionPolicy::NONE)
        .unwrap();
    passive
        .deposit_packet_histories(
            &[GeodesicPacketHistory::new(24, vec![])],
            BackreactionPolicy::NONE,
        )
        .unwrap();
    passive
        .deposit_packet_histories(
            &[GeodesicPacketHistory::new(25, vec![])],
            BackreactionPolicy::NONE,
        )
        .unwrap();
    assert_eq!(passive.kind(), KernelStateKind::FlatEmpty);
    assert_eq!(
        passive.packet_deposition_evidence(),
        spacetime_physics::kernel::PacketDepositionEvidence {
            status: EvidenceStatus::Evaluated,
            deposited_packet_count: 0,
            passive_packet_count: 2,
            rejected_packet_count: 2,
        },
    );
    let stepped = DynamicalSpacetimeKernel::new(config)
        .step(passive, TimeDuration::from_seconds(0.1))
        .unwrap();
    assert_eq!(
        stepped.diagnostics.packet_deposition,
        spacetime_physics::kernel::PacketDepositionEvidence {
            status: EvidenceStatus::Evaluated,
            deposited_packet_count: 0,
            passive_packet_count: 2,
            rejected_packet_count: 2,
        },
    );
    assert_eq!(
        stepped.state.packet_deposition_evidence().status,
        EvidenceStatus::NotEvaluated,
    );

    let mut active = KernelState::from_config(&config).unwrap();
    active
        .deposit_packet_histories(&[photon_history(22, 0.25)], BackreactionPolicy::RAD_HYDRO)
        .unwrap();
    assert_eq!(active.kind(), KernelStateKind::NotFlatEmpty);
    assert_eq!(
        active.packet_deposition_evidence().deposited_packet_count,
        1
    );
}

fn matter_grid() -> ConservativeMatterGrid<IdealGasEquationOfState> {
    ConservativeMatterGrid::new(
        UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 1, 1]),
        CoordinateTime::ZERO,
        2,
        BoundaryConditions3::OUTFLOW,
        IdealGasEquationOfState::new(5.0 / 3.0),
    )
    .unwrap()
}

fn photon_history(packet_id: u64, tensor_weight: f64) -> GeodesicPacketHistory {
    GeodesicPacketHistory::new(
        packet_id,
        vec![deposition_event(
            TransportGeodesicState::null(
                coordinate([0.0, 0.5, 0.5, 0.5], CoordinateChartKind::Cartesian),
                FourVec::new(4.0, vec3::new(4.0, 0.0, 0.0)),
            ),
            FourVec::new(1.0, vec3::new(1.0, 0.0, 0.0)),
            tensor_weight,
        )],
    )
}

fn deposition_event(
    trajectory_state: TransportGeodesicState,
    physical_four_momentum: FourVec,
    tensor_weight: f64,
) -> GeodesicPacketSample {
    GeodesicPacketSample::deposition_event(
        trajectory_state,
        PacketStressEnergyEstimator::new(
            LocalFutureNullMomentum::try_new(physical_four_momentum).unwrap(),
            tensor_weight,
        ),
    )
}

fn coordinate(components: [f64; 4], chart: CoordinateChartKind) -> SpacetimeCoordinate {
    SpacetimeCoordinate::new(components, chart)
}

fn rejected(reason: PacketRejectionReason) -> PacketDepositionOutcome {
    PacketDepositionOutcome::Rejected { reason }
}
