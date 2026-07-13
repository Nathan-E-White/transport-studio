//! Canonical interface for deterministic Dynamical Spacetime Coupling steps.
//!
//! This first slice intentionally leaves numerical-method selection, equation-of-state
//! selection, radiation closure, AMR policy, packet plumbing, ghost widths, and work-grid
//! layouts behind the kernel seam. Later behavior-driven slices may promote validated
//! physical or numerical choices without exposing raw storage policy.

use crate::packet_deposition::{
    GeodesicPacketHistory, PacketDepositionAdapter, PacketDepositionReport,
};
use crate::{
    AlgebraicBssnGaugeEnforcer, BackreactionPolicy, BoundaryConditions3, BssnCellState,
    BssnGeometryStepper, BssnGridFields, ConservativeMatterCell, ConservativeMatterGrid,
    CoordinateTime, CoupledBssnMatterState, CoupledBssnMatterStepper, EvolutionGridField3,
    IdealGasEquationOfState, NoopMatterRadiationStepper, PhysicsError, StressEnergyTensor,
    SymmetricSpatialTensor2, TimeDuration, UniformGrid3, vec3,
};

const INTERNAL_GHOST_WIDTH: usize = 2;
const VACUUM_IDEAL_GAS_GAMMA: f64 = 5.0 / 3.0;
/// Maximum accepted L-infinity residual for the flat BSSN tracer bullet.
pub const FLAT_BSSN_CONSTRAINT_TOLERANCE: f64 = 1.0e-12;
/// Maximum accepted lapse or shift departure from flat gauge data.
pub const FLAT_GAUGE_TOLERANCE: f64 = 1.0e-12;

/// Staged BSSN gauge selected by ADR-0007.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum GaugePolicy {
    OnePlusLogGammaDriver,
}

/// Caller intent needed to construct the first flat-empty kernel state.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct KernelConfig {
    grid: UniformGrid3,
    initial_time: CoordinateTime,
    gauge_policy: GaugePolicy,
}

impl KernelConfig {
    pub const fn flat_empty(grid: UniformGrid3, initial_time: CoordinateTime) -> Self {
        Self {
            grid,
            initial_time,
            gauge_policy: GaugePolicy::OnePlusLogGammaDriver,
        }
    }
}

/// Canonical state categories observable without inspecting solver storage.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum KernelStateKind {
    FlatEmpty,
    NotFlatEmpty,
}

/// Owned state for a deterministic Dynamical Spacetime Coupling step.
#[derive(Debug, Clone, PartialEq)]
pub struct KernelState {
    inner: CoupledBssnMatterState<IdealGasEquationOfState>,
    packet_deposition: PacketDepositionEvidence,
}

impl KernelState {
    pub fn from_config(config: &KernelConfig) -> Result<Self, PhysicsError> {
        let geometry = BssnGridFields::flat_cartesian_with_ghosts(
            config.grid,
            config.initial_time,
            INTERNAL_GHOST_WIDTH,
            BoundaryConditions3::OUTFLOW,
        )?;
        let matter = ConservativeMatterGrid::new(
            config.grid,
            config.initial_time,
            INTERNAL_GHOST_WIDTH,
            BoundaryConditions3::OUTFLOW,
            IdealGasEquationOfState::new(VACUUM_IDEAL_GAS_GAMMA),
        )?;

        Ok(Self {
            inner: CoupledBssnMatterState::new(geometry, matter),
            packet_deposition: PacketDepositionEvidence::NOT_EVALUATED,
        })
    }

    pub const fn time(&self) -> CoordinateTime {
        self.inner.geometry.time
    }

    pub fn kind(&self) -> KernelStateKind {
        if self.is_flat_empty() {
            KernelStateKind::FlatEmpty
        } else {
            KernelStateKind::NotFlatEmpty
        }
    }

    pub const fn packet_deposition_evidence(&self) -> PacketDepositionEvidence {
        self.packet_deposition
    }

    pub fn deposit_packet_histories(
        &mut self,
        histories: &[GeodesicPacketHistory],
        policy: BackreactionPolicy,
    ) -> Result<PacketDepositionReport, PhysicsError> {
        let report = PacketDepositionAdapter.deposit(&mut self.inner.matter, histories, policy)?;
        self.packet_deposition.record(PacketDepositionEvidence {
            status: EvidenceStatus::Evaluated,
            deposited_packet_count: report.diagnostics.deposited_packet_count,
            passive_packet_count: report.diagnostics.passive_packet_count,
            rejected_packet_count: report.diagnostics.rejected_packet_count,
        });
        Ok(report)
    }

    fn is_flat_empty(&self) -> bool {
        if self.inner.geometry.grid != self.inner.matter.grid
            || self.inner.geometry.time != self.inner.matter.time
        {
            return false;
        }

        for index in 0..self.inner.geometry.lapse.interior_len() {
            let Ok(geometry) = self.inner.geometry.cell_state(index) else {
                return false;
            };
            let Ok(ijk) = self.inner.matter.density.interior_ijk_for_index(index) else {
                return false;
            };
            let Ok(matter) = self.inner.matter.cell_state(ijk[0], ijk[1], ijk[2]) else {
                return false;
            };
            let Ok(deposited) = self
                .inner
                .matter
                .radiation_particle_stress_energy
                .get_interior(ijk[0], ijk[1], ijk[2])
            else {
                return false;
            };

            if geometry.lapse != 1.0
                || geometry.shift != vec3::ZERO
                || !is_flat_bssn_spatial_geometry(&geometry)
                || matter != ConservativeMatterCell::VACUUM
                || *deposited != StressEnergyTensor::ZERO
            {
                return false;
            }
        }

        true
    }
}

/// Whether a diagnostic facet ran and produced trustworthy evidence.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum EvidenceStatus {
    Evaluated,
    NotEvaluated,
    Failed,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct StepEvidence {
    pub status: EvidenceStatus,
    pub start_time: CoordinateTime,
    pub end_time: CoordinateTime,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct BssnEvidence {
    pub status: EvidenceStatus,
    pub is_finite: bool,
    pub hamiltonian_linf: f64,
    pub momentum_linf: f64,
    pub determinant_linf: f64,
    pub trace_free_linf: f64,
    pub gauge: GaugeEvidence,
    pub algebraic_constraints: AlgebraicConstraintStatus,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum GaugeVariableStatus {
    FlatPreserved,
    DepartedFromFlat,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct GaugeEvidence {
    pub policy: GaugePolicy,
    pub lapse: GaugeVariableStatus,
    pub shift: GaugeVariableStatus,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum AlgebraicConstraintStatus {
    Satisfied,
    Violated,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct FacetEvidence {
    pub status: EvidenceStatus,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct PacketDepositionEvidence {
    pub status: EvidenceStatus,
    pub deposited_packet_count: usize,
    pub passive_packet_count: usize,
    pub rejected_packet_count: usize,
}

impl PacketDepositionEvidence {
    const NOT_EVALUATED: Self = Self {
        status: EvidenceStatus::NotEvaluated,
        deposited_packet_count: 0,
        passive_packet_count: 0,
        rejected_packet_count: 0,
    };

    fn record(&mut self, evidence: Self) {
        self.status = EvidenceStatus::Evaluated;
        self.deposited_packet_count += evidence.deposited_packet_count;
        self.passive_packet_count += evidence.passive_packet_count;
        self.rejected_packet_count += evidence.rejected_packet_count;
    }
}

impl FacetEvidence {
    const NOT_EVALUATED: Self = Self {
        status: EvidenceStatus::NotEvaluated,
    };
}

/// Compact evidence emitted by the canonical kernel interface.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct KernelDiagnostics {
    pub step: StepEvidence,
    pub bssn: BssnEvidence,
    pub grhd: FacetEvidence,
    pub radiation: FacetEvidence,
    pub packet_deposition: PacketDepositionEvidence,
    pub amr: FacetEvidence,
    pub verification: FacetEvidence,
}

#[derive(Debug, Clone, PartialEq)]
pub struct KernelStepResult {
    pub state: KernelState,
    pub diagnostics: KernelDiagnostics,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, thiserror::Error)]
pub enum KernelStepError {
    #[error("timestep must be finite and positive")]
    InvalidTimestep,
    #[error("kernel state does not match its configuration")]
    StateConfigMismatch,
    #[error(transparent)]
    Physics(PhysicsError),
}

/// Failed canonical step together with the unchanged, recoverable input state.
#[derive(Debug, Clone, PartialEq)]
pub struct KernelStepFailure {
    pub error: KernelStepError,
    pub state: Box<KernelState>,
}

/// The canonical no-op kernel skeleton. Numerical implementations remain internal.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct DynamicalSpacetimeKernel {
    config: KernelConfig,
}

impl DynamicalSpacetimeKernel {
    pub const fn new(config: KernelConfig) -> Self {
        Self { config }
    }

    pub fn step(
        &self,
        state: KernelState,
        dt: TimeDuration,
    ) -> Result<KernelStepResult, KernelStepFailure> {
        if !dt.seconds().is_finite() || dt.seconds() <= 0.0 {
            return Err(KernelStepFailure {
                error: KernelStepError::InvalidTimestep,
                state: Box::new(state),
            });
        }

        if state.inner.geometry.grid != self.config.grid
            || state.inner.geometry.time.seconds() < self.config.initial_time.seconds()
        {
            return Err(KernelStepFailure {
                error: KernelStepError::StateConfigMismatch,
                state: Box::new(state),
            });
        }

        let start_time = state.time();
        let mut next_state = state.clone();
        let diagnostics = match flat_bssn_stepper().step(&mut next_state.inner, &[], dt) {
            Ok(diagnostics) => diagnostics,
            Err(error) => {
                return Err(KernelStepFailure {
                    error: KernelStepError::Physics(error),
                    state: Box::new(state),
                });
            }
        };
        let constraints = diagnostics.constraints;
        let gauge = match gauge_evidence(self.config.gauge_policy, &next_state.inner.geometry) {
            Ok(gauge) => gauge,
            Err(error) => {
                return Err(KernelStepFailure {
                    error: KernelStepError::Physics(error),
                    state: Box::new(state),
                });
            }
        };
        let algebraic_constraints = if constraints.determinant_reduction.linf
            <= FLAT_BSSN_CONSTRAINT_TOLERANCE
            && constraints.trace_free_reduction.linf <= FLAT_BSSN_CONSTRAINT_TOLERANCE
        {
            AlgebraicConstraintStatus::Satisfied
        } else {
            AlgebraicConstraintStatus::Violated
        };

        let packet_deposition = next_state.packet_deposition;
        next_state.packet_deposition = PacketDepositionEvidence::NOT_EVALUATED;
        Ok(KernelStepResult {
            state: next_state,
            diagnostics: KernelDiagnostics {
                step: StepEvidence {
                    status: EvidenceStatus::Evaluated,
                    start_time,
                    end_time: start_time + dt,
                },
                bssn: BssnEvidence {
                    status: EvidenceStatus::Evaluated,
                    is_finite: constraints.finite_check.is_finite(),
                    hamiltonian_linf: constraints.adm.hamiltonian_reduction.linf,
                    momentum_linf: constraints.adm.momentum_reduction.linf,
                    determinant_linf: constraints.determinant_reduction.linf,
                    trace_free_linf: constraints.trace_free_reduction.linf,
                    gauge,
                    algebraic_constraints,
                },
                grhd: FacetEvidence::NOT_EVALUATED,
                radiation: FacetEvidence::NOT_EVALUATED,
                packet_deposition,
                amr: FacetEvidence::NOT_EVALUATED,
                verification: FacetEvidence::NOT_EVALUATED,
            },
        })
    }
}

fn gauge_evidence(
    policy: GaugePolicy,
    geometry: &BssnGridFields,
) -> Result<GaugeEvidence, PhysicsError> {
    let mut lapse = GaugeVariableStatus::FlatPreserved;
    let mut shift = GaugeVariableStatus::FlatPreserved;

    for index in 0..geometry.lapse.interior_len() {
        let cell = geometry.cell_state(index)?;
        if (cell.lapse - 1.0).abs() > FLAT_GAUGE_TOLERANCE {
            lapse = GaugeVariableStatus::DepartedFromFlat;
        }
        if cell.shift.norm() > FLAT_GAUGE_TOLERANCE {
            shift = GaugeVariableStatus::DepartedFromFlat;
        }
    }

    Ok(GaugeEvidence {
        policy,
        lapse,
        shift,
    })
}

/// First BSSN evolution backend: evaluate the flat-vacuum RHS, which is identically zero.
/// Unlike the kernel skeleton's generic no-op, this path validates the assumptions that make
/// that zero RHS physically meaningful before advancing the coupled step.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct FlatVacuumBssnGeometryStepper;

impl BssnGeometryStepper for FlatVacuumBssnGeometryStepper {
    fn evolve_geometry(
        &self,
        geometry: &mut BssnGridFields,
        stress_energy: &EvolutionGridField3<StressEnergyTensor>,
        dt: TimeDuration,
    ) -> Result<(), PhysicsError> {
        if !dt.seconds().is_finite() || geometry.grid != stress_energy.grid {
            return Err(PhysicsError::InvalidGrid);
        }
        for index in 0..stress_energy.interior_len() {
            let [i, j, k] = stress_energy.interior_ijk_for_index(index)?;
            if *stress_energy.get_interior(i, j, k)? != StressEnergyTensor::ZERO {
                return Err(PhysicsError::InvalidStep);
            }
        }
        for index in 0..geometry.lapse.interior_len() {
            let cell = geometry.cell_state(index)?;
            if !is_flat_bssn_spatial_geometry(&cell) {
                return Err(PhysicsError::InvalidStep);
            }
        }

        geometry.apply_boundary_conditions()
    }
}

fn is_flat_bssn_spatial_geometry(cell: &BssnCellState) -> bool {
    cell.conformal_metric == SymmetricSpatialTensor2::IDENTITY
        && cell.conformal_factor == 0.0
        && cell.trace_extrinsic_curvature == 0.0
        && cell.trace_free_curvature == SymmetricSpatialTensor2::ZERO
        && cell.connection_functions == vec3::ZERO
}

fn flat_bssn_stepper() -> CoupledBssnMatterStepper<
    FlatVacuumBssnGeometryStepper,
    NoopMatterRadiationStepper,
    AlgebraicBssnGaugeEnforcer,
> {
    CoupledBssnMatterStepper::new(
        FlatVacuumBssnGeometryStepper,
        NoopMatterRadiationStepper,
        AlgebraicBssnGaugeEnforcer,
        crate::ConstraintDiagnosticsOperator::SECOND_ORDER,
        1,
        BoundaryConditions3::OUTFLOW,
    )
}
