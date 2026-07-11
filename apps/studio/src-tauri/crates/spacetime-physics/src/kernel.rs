//! Canonical interface for deterministic Dynamical Spacetime Coupling steps.
//!
//! This first slice intentionally leaves numerical-method selection, equation-of-state
//! selection, radiation closure, AMR policy, packet plumbing, ghost widths, and work-grid
//! layouts behind the kernel seam. Later behavior-driven slices may promote validated
//! physical or numerical choices without exposing raw storage policy.

use crate::{
    BoundaryConditions3, BssnGridFields, ConservativeMatterCell, ConservativeMatterGrid,
    CoordinateTime, CoupledBssnMatterState, CoupledBssnMatterStepper, IdealGasEquationOfState,
    PhysicsError, StressEnergyTensor, SymmetricSpatialTensor2, TimeDuration, UniformGrid3, vec3,
};

const INTERNAL_GHOST_WIDTH: usize = 2;
const VACUUM_IDEAL_GAS_GAMMA: f64 = 5.0 / 3.0;

/// Caller intent needed to construct the first flat-empty kernel state.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct KernelConfig {
    grid: UniformGrid3,
    initial_time: CoordinateTime,
}

impl KernelConfig {
    pub const fn flat_empty(grid: UniformGrid3, initial_time: CoordinateTime) -> Self {
        Self { grid, initial_time }
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
                || geometry.conformal_metric != SymmetricSpatialTensor2::IDENTITY
                || geometry.conformal_factor != 0.0
                || geometry.trace_extrinsic_curvature != 0.0
                || geometry.trace_free_curvature != SymmetricSpatialTensor2::ZERO
                || geometry.connection_functions != vec3::ZERO
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
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct FacetEvidence {
    pub status: EvidenceStatus,
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
    pub packet_deposition: FacetEvidence,
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
        let diagnostics =
            match CoupledBssnMatterStepper::noop().step(&mut next_state.inner, &[], dt) {
                Ok(diagnostics) => diagnostics,
                Err(error) => {
                    return Err(KernelStepFailure {
                        error: KernelStepError::Physics(error),
                        state: Box::new(state),
                    });
                }
            };
        let constraints = diagnostics.constraints;

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
                },
                grhd: FacetEvidence::NOT_EVALUATED,
                radiation: FacetEvidence::NOT_EVALUATED,
                packet_deposition: FacetEvidence::NOT_EVALUATED,
                amr: FacetEvidence::NOT_EVALUATED,
                verification: FacetEvidence::NOT_EVALUATED,
            },
        })
    }
}
