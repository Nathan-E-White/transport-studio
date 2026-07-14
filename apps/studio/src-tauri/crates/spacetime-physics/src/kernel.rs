//! Canonical interface for deterministic Dynamical Spacetime Coupling steps.
//!
//! This first slice intentionally leaves numerical-method selection, equation-of-state
//! selection, radiation closure, AMR policy, packet plumbing, ghost widths, and work-grid
//! layouts behind the kernel seam. Later behavior-driven slices may promote validated
//! physical or numerical choices without exposing raw storage policy.

use crate::packet_deposition::{
    GeodesicPacketHistory, PacketDepositionAdapter, PacketDepositionReport,
};
use crate::radiation::{
    OrthonormalGrayRadiationMoments, RadiationClosureEvidence, close_gray_m1_moments,
};
use crate::{
    AlgebraicBssnGaugeEnforcer, BackreactionPolicy, BoundaryConditions3, BssnCellState,
    BssnGeometryStepper, BssnGridFields, BssnSourcePath, ConservativeMatterCell,
    ConservativeMatterGrid, ConstraintDiagnosticsOperator, ControlledToyBssnSourceStepper,
    CoupledBssnMatterState, CoupledBssnMatterStepper, EvolutionGridField3, GaugeConditionEnforcer,
    IdealGasEquationOfState, LocalRadiationMatterExchangeState, NoopMatterRadiationStepper,
    PhysicsError, PrimitiveRecoveryPolicy, RadiationMatterExchangeConfig,
    RadiationMatterExchangeDiagnostics, RadiationTransportMode, StressEnergyTensor,
    SymmetricSpatialTensor2, ValenciaCellRecoveryDiagnostics, ValenciaEquationOfState,
    ValenciaFlatFiniteVolumeConfig, ValenciaIdealGas, ValenciaPrimitive,
    gray_m1_stress_energy_in_eulerian_orthonormal_frame, primitive_to_conserved,
    project_bssn_sources, radiation_matter_exchange_semi_implicit,
    valencia_flat_finite_volume_step_1d, valencia_stress_energy_in_eulerian_orthonormal_frame,
};

pub use crate::grid::UniformGrid3;
pub use crate::units::{CoordinateTime, TimeDuration};

pub mod vec3 {
    pub use crate::vec3::*;
}

const INTERNAL_GHOST_WIDTH: usize = 2;
const VACUUM_IDEAL_GAS_GAMMA: f64 = 5.0 / 3.0;
const COUPLED_TOY_GAMMA: f64 = 1.4;
const COUPLED_TOY_GEOMETRY_RESPONSE: f64 = 0.01;
const COUPLED_TOY_INTERACTION_RATE: f64 = 2.0;
const COUPLED_TOY_EQUILIBRIUM_RADIATION_ENERGY: f64 = 1.0;
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
    scenario: KernelScenario,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum KernelScenario {
    FlatEmpty,
    CoupledToy,
}

impl KernelConfig {
    pub const fn flat_empty(grid: UniformGrid3, initial_time: CoordinateTime) -> Self {
        Self {
            grid,
            initial_time,
            gauge_policy: GaugePolicy::OnePlusLogGammaDriver,
            scenario: KernelScenario::FlatEmpty,
        }
    }

    /// Controlled three-cell end-to-end coupling proof, not a production strong-field setup.
    pub const fn coupled_toy(grid: UniformGrid3, initial_time: CoordinateTime) -> Self {
        Self {
            grid,
            initial_time,
            gauge_policy: GaugePolicy::OnePlusLogGammaDriver,
            scenario: KernelScenario::CoupledToy,
        }
    }
}

/// Canonical state categories observable without inspecting solver storage.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum KernelStateKind {
    FlatEmpty,
    CoupledToy,
    NotFlatEmpty,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct CoupledKernelCellState {
    pub matter: ValenciaPrimitive,
    pub radiation: OrthonormalGrayRadiationMoments,
}

#[derive(Debug, Clone, PartialEq)]
struct CoupledToyState {
    cells: Vec<CoupledKernelCellState>,
}

/// Owned state for a deterministic Dynamical Spacetime Coupling step.
#[derive(Debug, Clone, PartialEq)]
pub struct KernelState {
    inner: CoupledBssnMatterState<IdealGasEquationOfState>,
    packet_deposition: PacketDepositionEvidence,
    coupled_toy: Option<CoupledToyState>,
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

        let coupled_toy = match config.scenario {
            KernelScenario::FlatEmpty => None,
            KernelScenario::CoupledToy => {
                if config.grid.dimensions != [3, 1, 1] {
                    return Err(PhysicsError::InvalidGrid);
                }
                let eos = ValenciaIdealGas {
                    gamma: COUPLED_TOY_GAMMA,
                };
                let matter = ValenciaPrimitive {
                    rest_mass_density: 1.0,
                    velocity: vec3::ZERO,
                    specific_internal_energy: 1.0,
                    pressure: eos.pressure(1.0, 1.0)?,
                };
                Some(CoupledToyState {
                    cells: vec![
                        CoupledKernelCellState {
                            matter,
                            radiation: OrthonormalGrayRadiationMoments::new(0.5, vec3::ZERO),
                        };
                        3
                    ],
                })
            }
        };

        Ok(Self {
            inner: CoupledBssnMatterState::new(geometry, matter),
            packet_deposition: PacketDepositionEvidence::NOT_EVALUATED,
            coupled_toy,
        })
    }

    pub const fn time(&self) -> CoordinateTime {
        self.inner.geometry.time
    }

    pub fn kind(&self) -> KernelStateKind {
        if self.coupled_toy.is_some() {
            return KernelStateKind::CoupledToy;
        }
        if self.is_flat_empty() {
            KernelStateKind::FlatEmpty
        } else {
            KernelStateKind::NotFlatEmpty
        }
    }

    pub fn coupled_cell(&self, index: usize) -> Option<CoupledKernelCellState> {
        self.coupled_toy
            .as_ref()
            .and_then(|state| state.cells.get(index).copied())
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
        if self.coupled_toy.is_some() {
            return false;
        }
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

#[derive(Debug, Clone, PartialEq)]
pub enum GrhdEvidence {
    NotEvaluated,
    Evaluated {
        primitive_recovery: Vec<ValenciaCellRecoveryDiagnostics>,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub enum RadiationKernelEvidence {
    NotEvaluated,
    Evaluated {
        closure: Vec<RadiationClosureEvidence>,
        exchange: Vec<RadiationMatterExchangeDiagnostics>,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub enum StressEnergyAccountingEvidence {
    NotEvaluated,
    Evaluated {
        matter_energy: f64,
        radiation_energy: f64,
        packet_energy: f64,
        total_energy: f64,
        source_paths: Vec<BssnSourcePath>,
    },
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
#[derive(Debug, Clone, PartialEq)]
pub struct KernelDiagnostics {
    pub step: StepEvidence,
    pub bssn: BssnEvidence,
    pub grhd: GrhdEvidence,
    pub radiation: RadiationKernelEvidence,
    pub packet_deposition: PacketDepositionEvidence,
    pub stress_energy: StressEnergyAccountingEvidence,
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
        if self.config.scenario == KernelScenario::CoupledToy {
            return self.step_with_packet_histories(state, &[], dt);
        }
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
                grhd: GrhdEvidence::NotEvaluated,
                radiation: RadiationKernelEvidence::NotEvaluated,
                packet_deposition,
                stress_energy: StressEnergyAccountingEvidence::NotEvaluated,
                amr: FacetEvidence::NOT_EVALUATED,
                verification: FacetEvidence::NOT_EVALUATED,
            },
        })
    }

    /// Run the controlled end-to-end Valencia/gray-M1/packet/BSSN tracer bullet.
    pub fn step_with_packet_histories(
        &self,
        state: KernelState,
        histories: &[GeodesicPacketHistory],
        dt: TimeDuration,
    ) -> Result<KernelStepResult, KernelStepFailure> {
        if !dt.seconds().is_finite() {
            return Err(kernel_failure(KernelStepError::InvalidTimestep, state));
        }
        if dt.seconds() <= 0.0 {
            return Err(kernel_failure(KernelStepError::InvalidTimestep, state));
        }
        if self.config.scenario != KernelScenario::CoupledToy {
            return Err(kernel_failure(KernelStepError::StateConfigMismatch, state));
        }
        if state.inner.geometry.grid != self.config.grid {
            return Err(kernel_failure(KernelStepError::StateConfigMismatch, state));
        }
        if state.inner.geometry.time.seconds() < self.config.initial_time.seconds() {
            return Err(kernel_failure(KernelStepError::StateConfigMismatch, state));
        }
        if state.coupled_toy.is_none() {
            return Err(kernel_failure(KernelStepError::StateConfigMismatch, state));
        }

        let start_time = state.time();
        let mut next_state = state.clone();
        next_state
            .inner
            .matter
            .radiation_particle_stress_energy
            .fill(StressEnergyTensor::ZERO);
        if let Err(error) = next_state
            .inner
            .matter
            .radiation_particle_stress_energy
            .apply_boundary_conditions()
        {
            return Err(kernel_failure(KernelStepError::Physics(error), state));
        }
        next_state.packet_deposition = PacketDepositionEvidence::NOT_EVALUATED;
        if let Err(error) =
            next_state.deposit_packet_histories(histories, BackreactionPolicy::RAD_HYDRO)
        {
            return Err(kernel_failure(KernelStepError::Physics(error), state));
        }
        let eos = ValenciaIdealGas {
            gamma: COUPLED_TOY_GAMMA,
        };
        let coupled = next_state
            .coupled_toy
            .as_mut()
            .expect("validated coupled state");
        let conserved = match coupled
            .cells
            .iter()
            .map(|cell| primitive_to_conserved(cell.matter, eos, crate::ValenciaGeometry::FLAT))
            .collect::<Result<Vec<_>, _>>()
        {
            Ok(conserved) => conserved,
            Err(error) => return Err(kernel_failure(KernelStepError::Physics(error), state)),
        };
        let grhd_step = match valencia_flat_finite_volume_step_1d(
            &conserved,
            eos,
            ValenciaFlatFiniteVolumeConfig {
                cell_width: self.config.grid.spacing.x,
                timestep: dt,
                courant_factor: 1.0,
                recovery_policy: PrimitiveRecoveryPolicy::DEFAULT,
            },
        ) {
            Ok(step) => step,
            Err(_) => {
                return Err(kernel_failure(
                    KernelStepError::Physics(PhysicsError::InvalidStep),
                    state,
                ));
            }
        };
        let primitive_recovery = grhd_step
            .cells
            .iter()
            .map(|cell| cell.recovery_diagnostics.clone())
            .collect::<Vec<_>>();
        for (cell, advanced) in coupled.cells.iter_mut().zip(grhd_step.cells) {
            cell.matter = advanced.primitive;
        }

        let mut closure = Vec::with_capacity(coupled.cells.len());
        let mut exchange = Vec::with_capacity(coupled.cells.len());
        for cell in &mut coupled.cells {
            let outcome = match radiation_matter_exchange_semi_implicit(
                LocalRadiationMatterExchangeState {
                    matter: cell.matter,
                    radiation: cell.radiation,
                },
                eos,
                RadiationMatterExchangeConfig {
                    timestep: dt,
                    interaction_rate: COUPLED_TOY_INTERACTION_RATE,
                    equilibrium_radiation_energy_density: COUPLED_TOY_EQUILIBRIUM_RADIATION_ENERGY,
                },
            ) {
                Ok(outcome) => outcome,
                Err(_failure) => {
                    return Err(kernel_failure(
                        KernelStepError::Physics(PhysicsError::InvalidStep),
                        state,
                    ));
                }
            };
            cell.matter = outcome.state.matter;
            cell.radiation = outcome.state.radiation;
            exchange.push(outcome.diagnostics);
            let closed = match close_gray_m1_moments(RadiationTransportMode::GrayM1, cell.radiation)
            {
                Ok(closed) => closed,
                Err(_) => {
                    return Err(kernel_failure(
                        KernelStepError::Physics(PhysicsError::InvalidStep),
                        state,
                    ));
                }
            };
            closure.push(closed.diagnostics);
        }

        let mut source_field = match EvolutionGridField3::cell_centered_with_ghosts(
            self.config.grid,
            INTERNAL_GHOST_WIDTH,
            BoundaryConditions3::OUTFLOW,
            StressEnergyTensor::ZERO,
        ) {
            Ok(field) => field,
            Err(error) => return Err(kernel_failure(KernelStepError::Physics(error), state)),
        };
        let cell_volume = self.config.grid.cell_volume();
        let mut matter_energy = 0.0;
        let mut radiation_energy = 0.0;
        let mut packet_energy = 0.0;
        let mut total_energy = 0.0;
        let mut source_paths = Vec::with_capacity(coupled.cells.len());
        for (index, cell) in coupled.cells.iter().enumerate() {
            let ijk = match self.config.grid.ijk_for_index(index) {
                Ok(ijk) => ijk,
                Err(error) => return Err(kernel_failure(KernelStepError::Physics(error), state)),
            };
            let matter =
                match valencia_stress_energy_in_eulerian_orthonormal_frame(cell.matter, eos) {
                    Ok(tensor) => tensor,
                    Err(error) => {
                        return Err(kernel_failure(KernelStepError::Physics(error), state));
                    }
                };
            let radiation =
                match gray_m1_stress_energy_in_eulerian_orthonormal_frame(cell.radiation) {
                    Ok(tensor) => tensor,
                    Err(error) => {
                        return Err(kernel_failure(KernelStepError::Physics(error), state));
                    }
                };
            let packet = match next_state
                .inner
                .matter
                .radiation_particle_stress_energy
                .get_interior(ijk[0], ijk[1], ijk[2])
            {
                Ok(tensor) => *tensor,
                Err(error) => return Err(kernel_failure(KernelStepError::Physics(error), state)),
            };
            let evidence = match project_bssn_sources(matter, radiation + packet) {
                Ok(evidence) => evidence,
                Err(error) => return Err(kernel_failure(KernelStepError::Physics(error), state)),
            };
            matter_energy += matter.components[0][0] * cell_volume;
            radiation_energy += radiation.components[0][0] * cell_volume;
            packet_energy += packet.components[0][0] * cell_volume;
            total_energy += evidence.total.energy_density * cell_volume;
            source_paths.push(evidence.path);
            if let Err(error) =
                source_field.set_interior(ijk[0], ijk[1], ijk[2], matter + radiation + packet)
            {
                return Err(kernel_failure(KernelStepError::Physics(error), state));
            }
        }
        if !matter_energy.is_finite() {
            return Err(kernel_failure(
                KernelStepError::Physics(PhysicsError::NonFiniteValue),
                state,
            ));
        }
        if !radiation_energy.is_finite() {
            return Err(kernel_failure(
                KernelStepError::Physics(PhysicsError::NonFiniteValue),
                state,
            ));
        }
        if !packet_energy.is_finite() {
            return Err(kernel_failure(
                KernelStepError::Physics(PhysicsError::NonFiniteValue),
                state,
            ));
        }
        if !total_energy.is_finite() {
            return Err(kernel_failure(
                KernelStepError::Physics(PhysicsError::NonFiniteValue),
                state,
            ));
        }
        if let Err(error) = (ControlledToyBssnSourceStepper {
            response_coefficient: COUPLED_TOY_GEOMETRY_RESPONSE,
        })
        .evolve_geometry(&mut next_state.inner.geometry, &source_field, dt)
        {
            return Err(kernel_failure(KernelStepError::Physics(error), state));
        }
        if let Err(error) = AlgebraicBssnGaugeEnforcer.enforce_gauge(&mut next_state.inner.geometry)
        {
            return Err(kernel_failure(KernelStepError::Physics(error), state));
        }
        next_state.inner.geometry.time = next_state.inner.geometry.time + dt;
        next_state.inner.matter.time = next_state.inner.geometry.time;
        let constraints = match ConstraintDiagnosticsOperator::SECOND_ORDER
            .bssn_constraints(&next_state.inner.geometry)
        {
            Ok(constraints) => constraints,
            Err(error) => return Err(kernel_failure(KernelStepError::Physics(error), state)),
        };
        let gauge = match gauge_evidence(self.config.gauge_policy, &next_state.inner.geometry) {
            Ok(gauge) => gauge,
            Err(error) => return Err(kernel_failure(KernelStepError::Physics(error), state)),
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
                bssn: bssn_evidence(constraints, gauge),
                grhd: GrhdEvidence::Evaluated { primitive_recovery },
                radiation: RadiationKernelEvidence::Evaluated { closure, exchange },
                packet_deposition,
                stress_energy: StressEnergyAccountingEvidence::Evaluated {
                    matter_energy,
                    radiation_energy,
                    packet_energy,
                    total_energy,
                    source_paths,
                },
                amr: FacetEvidence::NOT_EVALUATED,
                verification: FacetEvidence::NOT_EVALUATED,
            },
        })
    }
}

fn kernel_failure(error: KernelStepError, state: KernelState) -> KernelStepFailure {
    KernelStepFailure {
        error,
        state: Box::new(state),
    }
}

fn bssn_evidence(
    constraints: crate::BssnConstraintDiagnostics,
    gauge: GaugeEvidence,
) -> BssnEvidence {
    let algebraic_linf = constraints
        .determinant_reduction
        .linf
        .max(constraints.trace_free_reduction.linf);
    let algebraic_constraints = if algebraic_linf <= FLAT_BSSN_CONSTRAINT_TOLERANCE {
        AlgebraicConstraintStatus::Satisfied
    } else {
        AlgebraicConstraintStatus::Violated
    };
    BssnEvidence {
        status: EvidenceStatus::Evaluated,
        is_finite: constraints.finite_check.is_finite(),
        hamiltonian_linf: constraints.adm.hamiltonian_reduction.linf,
        momentum_linf: constraints.adm.momentum_reduction.linf,
        determinant_linf: constraints.determinant_reduction.linf,
        trace_free_linf: constraints.trace_free_reduction.linf,
        gauge,
        algebraic_constraints,
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
