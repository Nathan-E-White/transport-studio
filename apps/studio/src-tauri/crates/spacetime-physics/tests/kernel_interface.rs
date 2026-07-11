use spacetime_physics::kernel::{
    DynamicalSpacetimeKernel, EvidenceStatus, KernelConfig, KernelState, KernelStateKind,
    KernelStepError,
};
use spacetime_physics::{CoordinateTime, TimeDuration, UniformGrid3, vec3};

#[test]
fn flat_empty_dynamical_spacetime_state_advances_through_the_canonical_kernel_seam() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 1, 1]);
    let config = KernelConfig::flat_empty(grid, CoordinateTime::ZERO);
    let state = KernelState::from_config(&config).expect("flat-empty state should be valid");

    let result = DynamicalSpacetimeKernel::new(config)
        .step(state, TimeDuration::from_seconds(0.25))
        .expect("flat-empty no-op step should succeed");

    assert_eq!(result.state.time(), CoordinateTime::from_seconds(0.25));
    assert_eq!(result.state.kind(), KernelStateKind::FlatEmpty);
    assert_eq!(result.diagnostics.step.status, EvidenceStatus::Evaluated);
    assert_eq!(result.diagnostics.bssn.status, EvidenceStatus::Evaluated);
    assert!(result.diagnostics.bssn.is_finite);
    assert_eq!(result.diagnostics.bssn.hamiltonian_linf, 0.0);
    assert_eq!(result.diagnostics.bssn.momentum_linf, 0.0);
    assert_eq!(result.diagnostics.bssn.determinant_linf, 0.0);
    assert_eq!(result.diagnostics.bssn.trace_free_linf, 0.0);
    assert_eq!(result.diagnostics.grhd.status, EvidenceStatus::NotEvaluated);
    assert_eq!(
        result.diagnostics.radiation.status,
        EvidenceStatus::NotEvaluated
    );
    assert_eq!(
        result.diagnostics.packet_deposition.status,
        EvidenceStatus::NotEvaluated
    );
    assert_eq!(result.diagnostics.amr.status, EvidenceStatus::NotEvaluated);
    assert_eq!(
        result.diagnostics.verification.status,
        EvidenceStatus::NotEvaluated
    );
}

#[test]
fn zero_timestep_returns_the_recoverable_prior_kernel_state() {
    let grid = UniformGrid3::new(vec3::ZERO, vec3::splat(1.0), [1, 1, 1]);
    let config = KernelConfig::flat_empty(grid, CoordinateTime::ZERO);
    let state = KernelState::from_config(&config).expect("flat-empty state should be valid");

    let failure = DynamicalSpacetimeKernel::new(config)
        .step(state, TimeDuration::ZERO)
        .expect_err("zero timestep must not advance the kernel");

    assert_eq!(failure.error, KernelStepError::InvalidTimestep);
    assert_eq!(failure.state.time(), CoordinateTime::ZERO);
    assert_eq!(failure.state.kind(), KernelStateKind::FlatEmpty);
}
