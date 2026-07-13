//! Narrow bridge from transported geodesic packet histories to continuum stress-energy.

use std::collections::BTreeMap;

use crate::{
    BackreactionPolicy, ConservativeMatterGrid, CoordinateChartKind, EquationOfState, FourVec,
    GeodesicKind, PhysicsError, StressEnergyContribution, StressEnergyTensor,
    TransportGeodesicState,
};

// This is the exactly computed residual at the representable ratio below (about 1e-12),
// making the inclusive validation boundary deterministic.
const NULL_MOMENTUM_BOUNDARY_SPATIAL_RATIO: f64 = 0.999_999_999_999_5;
const NULL_MOMENTUM_RELATIVE_TOLERANCE: f64 =
    1.0 - NULL_MOMENTUM_BOUNDARY_SPATIAL_RATIO * NULL_MOMENTUM_BOUNDARY_SPATIAL_RATIO;

/// Future-directed null momentum expressed in the adapter's local orthonormal Cartesian frame.
///
/// This type prevents an arbitrary affine tangent, zero vector, massive momentum, or
/// past-directed momentum from crossing the stress-energy deposition boundary.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct LocalFutureNullMomentum(FourVec);

impl LocalFutureNullMomentum {
    pub fn try_new(momentum: FourVec) -> Result<Self, InvalidLocalFutureNullMomentum> {
        if has_non_finite_component(momentum) {
            return Err(InvalidLocalFutureNullMomentum::NonFinite);
        }
        if momentum.ct <= 0.0 {
            return Err(InvalidLocalFutureNullMomentum::NotFutureDirected);
        }

        let components = momentum.components();
        let max_abs = components
            .iter()
            .map(|component| component.abs())
            .fold(0.0_f64, f64::max);
        let normalized = FourVec::from_components(components.map(|component| component / max_abs));
        let residual = normalized.interval_squared().abs();
        if residual > NULL_MOMENTUM_RELATIVE_TOLERANCE {
            return Err(InvalidLocalFutureNullMomentum::NotNull);
        }

        Ok(Self(momentum))
    }

    pub const fn four_vec(self) -> FourVec {
        self.0
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, thiserror::Error)]
pub enum InvalidLocalFutureNullMomentum {
    #[error("local photon momentum must be finite")]
    NonFinite,
    #[error("local photon momentum must be future-directed")]
    NotFutureDirected,
    #[error("local photon momentum must be nonzero and null")]
    NotNull,
}

/// Fully normalized coefficient and validated physical momentum for one deposition estimator.
///
/// `tensor_weight` is the coefficient consumed by `StressEnergyContribution`. Callers must
/// include packet statistical weight, deposited fraction, and any path-length or quadrature
/// normalization. A sample carrying this type is an explicit deposition event, not merely a
/// point observed along the geodesic trajectory.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct PacketStressEnergyEstimator {
    pub physical_four_momentum: LocalFutureNullMomentum,
    pub tensor_weight: f64,
}

impl PacketStressEnergyEstimator {
    pub const fn new(physical_four_momentum: LocalFutureNullMomentum, tensor_weight: f64) -> Self {
        Self {
            physical_four_momentum,
            tensor_weight,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct GeodesicPacketSample {
    pub trajectory_state: TransportGeodesicState,
    pub estimator: PacketStressEnergyEstimator,
}

impl GeodesicPacketSample {
    pub const fn deposition_event(
        trajectory_state: TransportGeodesicState,
        estimator: PacketStressEnergyEstimator,
    ) -> Self {
        Self {
            trajectory_state,
            estimator,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct GeodesicPacketHistory {
    pub packet_id: u64,
    pub deposition_events: Vec<GeodesicPacketSample>,
}

impl GeodesicPacketHistory {
    pub const fn new(packet_id: u64, deposition_events: Vec<GeodesicPacketSample>) -> Self {
        Self {
            packet_id,
            deposition_events,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum PacketRejectionReason {
    EmptyHistory,
    InvalidEstimatorWeight,
    NonFiniteTangent,
    UnsupportedGeodesicKind { kind: GeodesicKind },
    UnsupportedCoordinateChart { chart: CoordinateChartKind },
    Deposition(PhysicsError),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum PacketDepositionOutcome {
    Passive,
    Deposited { contribution_count: usize },
    Rejected { reason: PacketRejectionReason },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct PacketDepositionDiagnostic {
    pub packet_id: u64,
    pub outcome: PacketDepositionOutcome,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PacketDepositionDiagnostics {
    pub deposited_packet_count: usize,
    pub passive_packet_count: usize,
    pub rejected_packet_count: usize,
    pub packets: Vec<PacketDepositionDiagnostic>,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct PacketDepositionReport {
    pub contributions: Vec<StressEnergyContribution>,
    pub diagnostics: PacketDepositionDiagnostics,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub struct PacketDepositionAdapter;

impl PacketDepositionAdapter {
    pub fn deposit<Eos: EquationOfState>(
        &self,
        matter: &mut ConservativeMatterGrid<Eos>,
        histories: &[GeodesicPacketHistory],
        policy: BackreactionPolicy,
    ) -> Result<PacketDepositionReport, PhysicsError> {
        let mut report = PacketDepositionReport::default();
        let mut pending_deltas = BTreeMap::<usize, StressEnergyTensor>::new();

        for history in histories {
            let outcome = match validate_history(history) {
                Err(reason) => rejected(&mut report, reason),
                Ok(()) if !policy.deposits_stress_energy() => {
                    report.diagnostics.passive_packet_count += 1;
                    PacketDepositionOutcome::Passive
                }
                Ok(()) => match prepare_deposition(matter, history) {
                    Ok(prepared) => {
                        for delta in &prepared.deltas {
                            pending_deltas
                                .entry(delta.index)
                                .and_modify(|current| *current += delta.tensor)
                                .or_insert(delta.tensor);
                        }
                        let contribution_count = prepared.contributions.len();
                        report.contributions.extend(prepared.contributions);
                        report.diagnostics.deposited_packet_count += 1;
                        PacketDepositionOutcome::Deposited { contribution_count }
                    }
                    Err(reason) => rejected(&mut report, reason),
                },
            };
            report.diagnostics.packets.push(PacketDepositionDiagnostic {
                packet_id: history.packet_id,
                outcome,
            });
        }

        commit_sparse_deltas(matter, pending_deltas)?;
        Ok(report)
    }
}

#[derive(Debug, Copy, Clone)]
struct PreparedDelta {
    index: usize,
    tensor: StressEnergyTensor,
}

struct PreparedPacket {
    contributions: Vec<StressEnergyContribution>,
    deltas: Vec<PreparedDelta>,
}

fn validate_history(history: &GeodesicPacketHistory) -> Result<(), PacketRejectionReason> {
    if history.deposition_events.is_empty() {
        return Err(PacketRejectionReason::EmptyHistory);
    }
    for event in &history.deposition_events {
        if event.trajectory_state.kind != GeodesicKind::Null {
            return Err(PacketRejectionReason::UnsupportedGeodesicKind {
                kind: event.trajectory_state.kind,
            });
        }
        if event.trajectory_state.x.chart != CoordinateChartKind::Cartesian {
            return Err(PacketRejectionReason::UnsupportedCoordinateChart {
                chart: event.trajectory_state.x.chart,
            });
        }
        if !event.estimator.tensor_weight.is_finite() || event.estimator.tensor_weight <= 0.0 {
            return Err(PacketRejectionReason::InvalidEstimatorWeight);
        }
        if has_non_finite_component(event.trajectory_state.tangent) {
            return Err(PacketRejectionReason::NonFiniteTangent);
        }
    }
    Ok(())
}

fn prepare_deposition<Eos: EquationOfState>(
    matter: &ConservativeMatterGrid<Eos>,
    history: &GeodesicPacketHistory,
) -> Result<PreparedPacket, PacketRejectionReason> {
    let mut contributions = Vec::with_capacity(history.deposition_events.len());
    let mut deltas = Vec::with_capacity(history.deposition_events.len());
    for event in &history.deposition_events {
        let contribution = StressEnergyContribution::new(
            event.trajectory_state.x,
            event.estimator.physical_four_momentum.four_vec(),
            event.estimator.tensor_weight,
        );
        let index = matter
            .grid
            .nearest_cell_index(contribution.position)
            .map_err(PacketRejectionReason::Deposition)?;
        let tensor = contribution
            .tensor_density(matter.grid.cell_volume())
            .map_err(PacketRejectionReason::Deposition)?;
        contributions.push(contribution);
        deltas.push(PreparedDelta { index, tensor });
    }
    Ok(PreparedPacket {
        contributions,
        deltas,
    })
}

fn rejected(
    report: &mut PacketDepositionReport,
    reason: PacketRejectionReason,
) -> PacketDepositionOutcome {
    report.diagnostics.rejected_packet_count += 1;
    PacketDepositionOutcome::Rejected { reason }
}

fn commit_sparse_deltas<Eos: EquationOfState>(
    matter: &mut ConservativeMatterGrid<Eos>,
    deltas: BTreeMap<usize, StressEnergyTensor>,
) -> Result<(), PhysicsError> {
    let mut updates = Vec::with_capacity(deltas.len());
    for (index, delta) in deltas {
        let ijk = matter.grid.ijk_for_index(index)?;
        let current = *matter
            .radiation_particle_stress_energy
            .get_interior(ijk[0], ijk[1], ijk[2])?;
        updates.push((ijk, current + delta));
    }
    for (ijk, tensor) in updates {
        matter
            .radiation_particle_stress_energy
            .set_interior(ijk[0], ijk[1], ijk[2], tensor)?;
    }
    Ok(())
}

fn has_non_finite_component(vector: FourVec) -> bool {
    vector
        .components()
        .iter()
        .any(|component| !component.is_finite())
}
