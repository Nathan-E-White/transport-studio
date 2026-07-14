//! Deterministic hydrodynamics-only shock-tube verification implementation.

use crate::verification::{
    FlatShockTubeCellEvidence, FlatShockTubeConvergenceEvidence, FlatShockTubeEvidence,
    FlatShockTubeFixture, FlatShockTubeLimitingCases, FlatShockTubeResolutionEvidence,
};
use crate::{
    primitive_to_conserved, valencia_flat_finite_volume_step_1d, vec3, PrimitiveRecoveryDiagnostic,
    PrimitiveRecoveryPolicy, TimeDuration, ValenciaConserved, ValenciaFlatFiniteVolumeConfig,
    ValenciaGeometry, ValenciaIdealGas, ValenciaPrimitive,
};

const DOMAIN_MIN: f64 = -0.5;
const DOMAIN_LENGTH: f64 = 1.0;
const FINAL_TIME: f64 = 0.1;
const COURANT_FACTOR: f64 = 0.4;
const ADIABATIC_INDEX: f64 = 1.4;
const RESOLUTIONS: [usize; 3] = [32, 64, 128];

const FIXTURE: FlatShockTubeFixture = FlatShockTubeFixture {
    left_density: 1.0,
    left_pressure: 1.0,
    left_velocity: 0.0,
    right_density: 0.125,
    right_pressure: 0.1,
    right_velocity: 0.0,
};

pub(crate) fn run_flat_relativistic_shock_tube() -> Result<FlatShockTubeEvidence, String> {
    let runs = RESOLUTIONS
        .into_iter()
        .map(run_resolution)
        .collect::<Result<Vec<_>, _>>()?;
    let convergence = FlatShockTubeConvergenceEvidence {
        coarse_to_medium_l1: restriction_l1(&runs[0].densities, &runs[1].densities),
        medium_to_fine_l1: restriction_l1(&runs[1].densities, &runs[2].densities),
        observed_order: 0.0,
    };
    let convergence = FlatShockTubeConvergenceEvidence {
        observed_order: (convergence.coarse_to_medium_l1 / convergence.medium_to_fine_l1).log2(),
        ..convergence
    };
    let resolutions = runs.iter().map(|run| run.summary).collect();
    let finest_profile = runs
        .last()
        .expect("resolution series is non-empty")
        .profile
        .clone();

    Ok(FlatShockTubeEvidence {
        fixture: FIXTURE,
        resolutions,
        finest_profile,
        convergence,
        limiting_cases: FlatShockTubeLimitingCases {
            maximum_radiation_energy: 0.0,
            maximum_opacity: 0.0,
        },
    })
}

struct ResolutionRun {
    summary: FlatShockTubeResolutionEvidence,
    densities: Vec<f64>,
    profile: Vec<FlatShockTubeCellEvidence>,
}

fn run_resolution(cell_count: usize) -> Result<ResolutionRun, String> {
    let eos = ValenciaIdealGas {
        gamma: ADIABATIC_INDEX,
    };
    let cell_width = DOMAIN_LENGTH / cell_count as f64;
    let steps = (FINAL_TIME / (COURANT_FACTOR * cell_width)).round() as usize;
    let timestep = FINAL_TIME / steps as f64;
    let config = ValenciaFlatFiniteVolumeConfig {
        cell_width,
        timestep: TimeDuration::from_seconds(timestep),
        courant_factor: COURANT_FACTOR,
        recovery_policy: PrimitiveRecoveryPolicy::DEFAULT,
    };
    let mut cells = (0..cell_count)
        .map(|index| {
            let position = cell_center(index, cell_width);
            let primitive = primitive_fixture(position);
            primitive_to_conserved(primitive, eos, ValenciaGeometry::FLAT)
                .map_err(|error| error.to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    let initial_cells = cells.clone();
    let mut recovery_attempts = 0;
    let mut recovery_iterations = 0;
    let mut corrected_recoveries = 0;
    let mut failed_recoveries = 0;
    let mut final_primitives = Vec::new();

    for _ in 0..steps {
        let step = valencia_flat_finite_volume_step_1d(&cells, eos, config)
            .map_err(|error| error.to_string())?;
        recovery_attempts += step.cells.len() * 2;
        recovery_iterations += step
            .cells
            .iter()
            .map(|cell| {
                cell.recovery_diagnostics.before_flux_iterations
                    + cell.recovery_diagnostics.after_update_iterations
            })
            .sum::<usize>();
        for cell in &step.cells {
            for diagnostics in [
                &cell.recovery_diagnostics.before_flux,
                &cell.recovery_diagnostics.after_update,
            ] {
                corrected_recoveries += usize::from(
                    diagnostics
                        .iter()
                        .any(|&diagnostic| is_corrective_recovery(diagnostic)),
                );
                failed_recoveries += usize::from(
                    diagnostics
                        .iter()
                        .any(|&diagnostic| is_failed_recovery(diagnostic)),
                );
            }
        }
        final_primitives = step.cells.iter().map(|cell| cell.primitive).collect();
        cells = step.cells.iter().map(|cell| cell.conserved).collect();
    }

    let conserved_deltas = conserved_deltas(&initial_cells, &cells, cell_width);
    let momentum_boundary_impulse = FINAL_TIME * (FIXTURE.left_pressure - FIXTURE.right_pressure);
    let summary = FlatShockTubeResolutionEvidence {
        cell_count,
        steps,
        recovery_attempts,
        recovery_iterations,
        corrected_recoveries,
        failed_recoveries,
        mass_conservation_residual: conserved_deltas.0,
        momentum_conservation_residual: conserved_deltas.1 - momentum_boundary_impulse,
        energy_conservation_residual: conserved_deltas.2,
    };
    let profile = cells
        .iter()
        .zip(&final_primitives)
        .enumerate()
        .map(|(index, (conserved, primitive))| {
            cell_evidence(index, cell_width, *conserved, *primitive)
        })
        .collect::<Vec<_>>();
    let densities = final_primitives
        .iter()
        .map(|primitive| primitive.rest_mass_density)
        .collect();

    Ok(ResolutionRun {
        summary,
        densities,
        profile,
    })
}

fn primitive_fixture(position: f64) -> ValenciaPrimitive {
    let (density, pressure, velocity) = if position < 0.0 {
        (
            FIXTURE.left_density,
            FIXTURE.left_pressure,
            FIXTURE.left_velocity,
        )
    } else {
        (
            FIXTURE.right_density,
            FIXTURE.right_pressure,
            FIXTURE.right_velocity,
        )
    };
    ValenciaPrimitive {
        rest_mass_density: density,
        velocity: vec3::new(velocity, 0.0, 0.0),
        specific_internal_energy: pressure / ((ADIABATIC_INDEX - 1.0) * density),
        pressure,
    }
}

fn cell_evidence(
    index: usize,
    cell_width: f64,
    conserved: ValenciaConserved,
    primitive: ValenciaPrimitive,
) -> FlatShockTubeCellEvidence {
    let velocity = primitive.velocity.x;
    FlatShockTubeCellEvidence {
        position: cell_center(index, cell_width),
        density: primitive.rest_mass_density,
        pressure: primitive.pressure,
        velocity,
        lorentz_factor: 1.0 / (1.0 - velocity * velocity).sqrt(),
        conserved_rest_mass: conserved.densitized_rest_mass,
        conserved_momentum: conserved.momentum_density.x,
        conserved_energy: conserved.energy_excluding_rest_mass,
    }
}

fn cell_center(index: usize, cell_width: f64) -> f64 {
    DOMAIN_MIN + (index as f64 + 0.5) * cell_width
}

fn conserved_deltas(
    initial: &[ValenciaConserved],
    final_state: &[ValenciaConserved],
    cell_width: f64,
) -> (f64, f64, f64) {
    initial
        .iter()
        .zip(final_state)
        .fold((0.0, 0.0, 0.0), |deltas, (initial, final_state)| {
            (
                deltas.0
                    + (final_state.densitized_rest_mass - initial.densitized_rest_mass)
                        * cell_width,
                deltas.1
                    + (final_state.momentum_density.x - initial.momentum_density.x) * cell_width,
                deltas.2
                    + (final_state.energy_excluding_rest_mass - initial.energy_excluding_rest_mass)
                        * cell_width,
            )
        })
}

fn restriction_l1(coarse: &[f64], fine: &[f64]) -> f64 {
    let cell_width = DOMAIN_LENGTH / coarse.len() as f64;
    coarse
        .iter()
        .zip(fine.chunks_exact(2))
        .map(|(&coarse_value, fine_pair)| {
            (coarse_value - 0.5 * (fine_pair[0] + fine_pair[1])).abs() * cell_width
        })
        .sum()
}

fn is_corrective_recovery(diagnostic: PrimitiveRecoveryDiagnostic) -> bool {
    !matches!(
        diagnostic,
        PrimitiveRecoveryDiagnostic::NewtonConverged
            | PrimitiveRecoveryDiagnostic::BisectionFallback
    )
}

fn is_failed_recovery(diagnostic: PrimitiveRecoveryDiagnostic) -> bool {
    matches!(
        diagnostic,
        PrimitiveRecoveryDiagnostic::AtmosphereApplied
            | PrimitiveRecoveryDiagnostic::InvalidConservedState
            | PrimitiveRecoveryDiagnostic::EquationOfStateOutOfBounds
    )
}
