//! Verification-only one-dimensional Valencia, gray-M1, and bounded IMEX shock tube.

use crate::kernel::EvidenceStatus;
use crate::radiation::{OrthonormalGrayRadiationMoments, close_gray_m1_moments};
use crate::verification::{
    FlatShockTubeCellEvidence, FlatShockTubeConvergenceEvidence, RadiativeShockTubeCellEvidence,
    RadiativeShockTubeEvidence, RadiativeShockTubeFixtureEvidence,
    RadiativeShockTubeResolutionEvidence,
};
use crate::{
    LocalRadiationMatterExchangeState, PrimitiveRecoveryDiagnostic, PrimitiveRecoveryPolicy,
    RadiationMatterExchangeConfig, RadiationTransportMode, TimeDuration, ValenciaConserved,
    ValenciaFlatFiniteVolumeConfig, ValenciaGeometry, ValenciaIdealGas, ValenciaPrimitive,
    primitive_to_conserved, radiation_matter_exchange_semi_implicit,
    valencia_flat_finite_volume_step_1d, vec3,
};

const DOMAIN_MIN: f64 = -0.5;
const DOMAIN_LENGTH: f64 = 1.0;
const FINAL_TIME: f64 = 0.1;
const COURANT_FACTOR: f64 = 0.4;
const ADIABATIC_INDEX: f64 = 1.4;
const RESOLUTIONS: [usize; 3] = [32, 64, 128];

#[derive(Debug, Copy, Clone)]
struct FixtureConfig {
    case_id: &'static str,
    interaction_rate: f64,
    equilibrium_energy: f64,
    left_radiation_energy: f64,
    right_radiation_energy: f64,
}

const FIXTURES: [FixtureConfig; 4] = [
    FixtureConfig {
        case_id: "hydrodynamic-limit",
        interaction_rate: 0.0,
        equilibrium_energy: 0.0,
        left_radiation_energy: 0.0,
        right_radiation_energy: 0.0,
    },
    FixtureConfig {
        case_id: "equilibrium",
        interaction_rate: 100.0,
        equilibrium_energy: 0.1,
        left_radiation_energy: 0.1,
        right_radiation_energy: 0.1,
    },
    FixtureConfig {
        case_id: "optically-thin",
        interaction_rate: 0.1,
        equilibrium_energy: 0.08,
        left_radiation_energy: 0.12,
        right_radiation_energy: 0.04,
    },
    FixtureConfig {
        case_id: "optically-thick",
        interaction_rate: 100.0,
        equilibrium_energy: 0.0,
        left_radiation_energy: 0.04,
        right_radiation_energy: 0.04,
    },
];

pub(crate) fn run_relativistic_radiative_shock_tube() -> Result<RadiativeShockTubeEvidence, String>
{
    let fixtures = FIXTURES
        .into_iter()
        .map(run_fixture)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(RadiativeShockTubeEvidence { fixtures })
}

fn run_fixture(config: FixtureConfig) -> Result<RadiativeShockTubeFixtureEvidence, String> {
    let runs = RESOLUTIONS
        .into_iter()
        .map(|resolution| run_resolution(config, resolution))
        .collect::<Result<Vec<_>, _>>()?;
    let density_convergence = FlatShockTubeConvergenceEvidence {
        coarse_to_medium_l1: restriction_l1(&runs[0].densities, &runs[1].densities),
        medium_to_fine_l1: restriction_l1(&runs[1].densities, &runs[2].densities),
        observed_order: 0.0,
    };
    let density_convergence = FlatShockTubeConvergenceEvidence {
        observed_order: (density_convergence.coarse_to_medium_l1
            / density_convergence.medium_to_fine_l1)
            .log2(),
        ..density_convergence
    };
    Ok(RadiativeShockTubeFixtureEvidence {
        case_id: config.case_id,
        status: EvidenceStatus::Evaluated,
        interaction_rate: config.interaction_rate,
        equilibrium_radiation_energy: config.equilibrium_energy,
        maximum_exchange: runs
            .iter()
            .map(|run| run.maximum_exchange)
            .fold(0.0, f64::max),
        resolutions: runs.iter().map(|run| run.summary).collect(),
        finest_profile: runs
            .last()
            .expect("resolution series is non-empty")
            .profile
            .clone(),
        density_convergence,
    })
}

struct ResolutionRun {
    summary: RadiativeShockTubeResolutionEvidence,
    densities: Vec<f64>,
    profile: Vec<RadiativeShockTubeCellEvidence>,
    maximum_exchange: f64,
}

fn run_resolution(config: FixtureConfig, cell_count: usize) -> Result<ResolutionRun, String> {
    let eos = ValenciaIdealGas {
        gamma: ADIABATIC_INDEX,
    };
    let cell_width = DOMAIN_LENGTH / cell_count as f64;
    let steps = (FINAL_TIME / (COURANT_FACTOR * cell_width)).round() as usize;
    let timestep = FINAL_TIME / steps as f64;
    let hydro_config = ValenciaFlatFiniteVolumeConfig {
        cell_width,
        timestep: TimeDuration::from_seconds(timestep),
        courant_factor: COURANT_FACTOR,
        recovery_policy: PrimitiveRecoveryPolicy::DEFAULT,
    };
    let mut matter = (0..cell_count)
        .map(|index| {
            primitive_to_conserved(
                matter_fixture(cell_center(index, cell_width)),
                eos,
                ValenciaGeometry::FLAT,
            )
            .map_err(|error| error.to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    let mut radiation = (0..cell_count)
        .map(|index| {
            let energy = if cell_center(index, cell_width) < 0.0 {
                config.left_radiation_energy
            } else {
                config.right_radiation_energy
            };
            OrthonormalGrayRadiationMoments::new(energy, vec3::ZERO)
        })
        .collect::<Vec<_>>();
    let initial_matter = matter.clone();
    let initial_radiation = radiation.clone();
    let mut recovery_attempts = 0;
    let mut recovery_iterations = 0;
    let mut failed_recoveries = 0;
    let mut bounded_exchange_backoffs = 0;
    let mut maximum_backoff_exponent = 0;
    let mut maximum_exchange = 0.0_f64;
    let mut final_primitives = Vec::new();
    let mut expected_energy_change = 0.0_f64;
    let mut expected_momentum_change = 0.0_f64;
    let mut expected_rest_mass_change = 0.0_f64;
    let mut maximum_reduced_flux = maximum_reduced_flux_in(&radiation)?;

    for _ in 0..steps {
        let hydro = valencia_flat_finite_volume_step_1d(&matter, eos, hydro_config)
            .map_err(|error| error.to_string())?;
        let radiation_transport = radiation_transport_step(&radiation, cell_width, timestep)?;
        expected_rest_mass_change -=
            timestep * (hydro.right_boundary_flux.rest_mass - hydro.left_boundary_flux.rest_mass);
        expected_energy_change -= timestep
            * ((hydro.right_boundary_flux.energy + radiation_transport.right_boundary_flux[0])
                - (hydro.left_boundary_flux.energy + radiation_transport.left_boundary_flux[0]));
        expected_momentum_change -= timestep
            * ((hydro.right_boundary_flux.momentum_x + radiation_transport.right_boundary_flux[1])
                - (hydro.left_boundary_flux.momentum_x
                    + radiation_transport.left_boundary_flux[1]));
        recovery_attempts += hydro.cells.len() * 2;
        recovery_iterations += hydro
            .cells
            .iter()
            .map(|cell| {
                cell.recovery_diagnostics.before_flux_iterations
                    + cell.recovery_diagnostics.after_update_iterations
            })
            .sum::<usize>();
        failed_recoveries += hydro
            .cells
            .iter()
            .flat_map(|cell| {
                [
                    &cell.recovery_diagnostics.before_flux,
                    &cell.recovery_diagnostics.after_update,
                ]
            })
            .filter(|diagnostics| diagnostics.iter().any(|&entry| is_failed_recovery(entry)))
            .count();
        matter = hydro.cells.iter().map(|cell| cell.conserved).collect();
        final_primitives = hydro.cells.iter().map(|cell| cell.primitive).collect();
        radiation = radiation_transport.cells;
        maximum_reduced_flux = maximum_reduced_flux.max(maximum_reduced_flux_in(&radiation)?);

        for index in 1..cell_count - 1 {
            let (next_matter, next_primitive, next_radiation, exchange, backoff_exponent) =
                bounded_exchange(
                    matter[index],
                    final_primitives[index],
                    radiation[index],
                    eos,
                    timestep,
                    config,
                )?;
            matter[index] = next_matter;
            final_primitives[index] = next_primitive;
            radiation[index] = next_radiation;
            maximum_exchange = maximum_exchange.max(exchange.abs());
            maximum_reduced_flux =
                maximum_reduced_flux.max(close(next_radiation)?.diagnostics.reduced_flux);
            if backoff_exponent > 0 {
                bounded_exchange_backoffs += 1;
            }
            maximum_backoff_exponent = maximum_backoff_exponent.max(backoff_exponent);
        }
    }

    let (rest_mass_change, energy_change, momentum_change) = total_conserved_change(
        &initial_matter,
        &initial_radiation,
        &matter,
        &radiation,
        cell_width,
    );
    let summary = RadiativeShockTubeResolutionEvidence {
        cell_count,
        steps,
        recovery_attempts,
        recovery_iterations,
        failed_recoveries,
        bounded_exchange_backoffs,
        maximum_backoff_exponent,
        maximum_reduced_flux,
        rest_mass_conservation_residual: rest_mass_change - expected_rest_mass_change,
        total_energy_conservation_residual: energy_change - expected_energy_change,
        total_momentum_conservation_residual: momentum_change - expected_momentum_change,
    };
    let profile = matter
        .iter()
        .zip(&final_primitives)
        .zip(&radiation)
        .enumerate()
        .map(|(index, ((conserved, primitive), moments))| {
            cell_evidence(index, cell_width, *conserved, *primitive, *moments)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let densities = final_primitives
        .iter()
        .map(|primitive| primitive.rest_mass_density)
        .collect();
    Ok(ResolutionRun {
        summary,
        densities,
        profile,
        maximum_exchange,
    })
}

struct RadiationTransportStep {
    cells: Vec<OrthonormalGrayRadiationMoments>,
    left_boundary_flux: [f64; 2],
    right_boundary_flux: [f64; 2],
}

fn radiation_transport_step(
    cells: &[OrthonormalGrayRadiationMoments],
    cell_width: f64,
    timestep: f64,
) -> Result<RadiationTransportStep, String> {
    let fluxes = cells
        .iter()
        .map(|&moments| {
            let closed = close(moments)?;
            Ok([moments.flux.x, closed.pressure.component(0, 0)])
        })
        .collect::<Result<Vec<_>, String>>()?;
    let mut face_fluxes = vec![[0.0; 2]; cells.len() + 1];
    for face in 1..cells.len() {
        let left = cells[face - 1];
        let right = cells[face];
        face_fluxes[face] = [
            0.5 * (fluxes[face - 1][0] + fluxes[face][0])
                - 0.5 * (right.energy_density - left.energy_density),
            0.5 * (fluxes[face - 1][1] + fluxes[face][1]) - 0.5 * (right.flux.x - left.flux.x),
        ];
    }
    let lambda = timestep / cell_width;
    let mut next = cells.to_vec();
    for index in 1..cells.len() - 1 {
        next[index] = OrthonormalGrayRadiationMoments::new(
            cells[index].energy_density
                - lambda * (face_fluxes[index + 1][0] - face_fluxes[index][0]),
            vec3::new(
                cells[index].flux.x - lambda * (face_fluxes[index + 1][1] - face_fluxes[index][1]),
                0.0,
                0.0,
            ),
        );
        close(next[index])?;
    }
    Ok(RadiationTransportStep {
        cells: next,
        left_boundary_flux: face_fluxes[1],
        right_boundary_flux: face_fluxes[cells.len() - 1],
    })
}

fn bounded_exchange(
    conserved: ValenciaConserved,
    primitive: ValenciaPrimitive,
    radiation: OrthonormalGrayRadiationMoments,
    eos: ValenciaIdealGas,
    timestep: f64,
    fixture: FixtureConfig,
) -> Result<
    (
        ValenciaConserved,
        ValenciaPrimitive,
        OrthonormalGrayRadiationMoments,
        f64,
        usize,
    ),
    String,
> {
    if fixture.interaction_rate == 0.0 {
        return Ok((conserved, primitive, radiation, 0.0, 0));
    }
    let proxy = radiation_matter_exchange_semi_implicit(
        LocalRadiationMatterExchangeState {
            matter: ValenciaPrimitive {
                velocity: vec3::ZERO,
                ..primitive
            },
            radiation: OrthonormalGrayRadiationMoments::new(radiation.energy_density, vec3::ZERO),
        },
        eos,
        RadiationMatterExchangeConfig {
            timestep: TimeDuration::from_seconds(timestep),
            interaction_rate: fixture.interaction_rate,
            equilibrium_radiation_energy_density: fixture.equilibrium_energy,
        },
    )
    .map_err(|failure| format!("IMEX exchange failed: {:?}", failure.diagnostics))?;
    let requested_exchange = proxy.diagnostics.exchanged_energy_density;
    if requested_exchange == 0.0 {
        return Ok((conserved, primitive, radiation, 0.0, 0));
    }
    for exponent in 0..=40 {
        let fraction = 0.5_f64.powi(exponent);
        let exchange = requested_exchange * fraction;
        let matter_energy = primitive.rest_mass_density * primitive.specific_internal_energy;
        let next_specific_energy = (matter_energy - exchange) / primitive.rest_mass_density;
        let next_primitive = ValenciaPrimitive {
            specific_internal_energy: next_specific_energy,
            pressure: eos_pressure(eos, primitive.rest_mass_density, next_specific_energy)?,
            ..primitive
        };
        let next_conserved = primitive_to_conserved(next_primitive, eos, ValenciaGeometry::FLAT)
            .map_err(|error| error.to_string())?;
        let energy_delta =
            next_conserved.energy_excluding_rest_mass - conserved.energy_excluding_rest_mass;
        let momentum_delta = next_conserved.momentum_density.x - conserved.momentum_density.x;
        let next_radiation = OrthonormalGrayRadiationMoments::new(
            radiation.energy_density - energy_delta,
            vec3::new(radiation.flux.x - momentum_delta, 0.0, 0.0),
        );
        if close(next_radiation).is_ok() {
            return Ok((
                next_conserved,
                next_primitive,
                next_radiation,
                exchange,
                exponent as usize,
            ));
        }
    }
    Err("bounded IMEX exchange could not preserve radiation realizability".to_string())
}

fn matter_fixture(position: f64) -> ValenciaPrimitive {
    let (density, pressure) = if position < 0.0 {
        (1.0, 1.0)
    } else {
        (0.125, 0.1)
    };
    ValenciaPrimitive {
        rest_mass_density: density,
        velocity: vec3::ZERO,
        specific_internal_energy: pressure / ((ADIABATIC_INDEX - 1.0) * density),
        pressure,
    }
}

fn cell_evidence(
    index: usize,
    cell_width: f64,
    conserved: ValenciaConserved,
    primitive: ValenciaPrimitive,
    radiation: OrthonormalGrayRadiationMoments,
) -> Result<RadiativeShockTubeCellEvidence, String> {
    let closed = close(radiation)?;
    let velocity = primitive.velocity.x;
    Ok(RadiativeShockTubeCellEvidence {
        matter: FlatShockTubeCellEvidence {
            position: cell_center(index, cell_width),
            density: primitive.rest_mass_density,
            pressure: primitive.pressure,
            velocity,
            lorentz_factor: 1.0 / (1.0 - velocity * velocity).sqrt(),
            conserved_rest_mass: conserved.densitized_rest_mass,
            conserved_momentum: conserved.momentum_density.x,
            conserved_energy: conserved.energy_excluding_rest_mass,
        },
        radiation_energy: radiation.energy_density,
        radiation_flux: radiation.flux.x,
        radiation_pressure: closed.pressure.component(0, 0),
        reduced_flux: closed.diagnostics.reduced_flux,
    })
}

fn total_conserved_change(
    initial_matter: &[ValenciaConserved],
    initial_radiation: &[OrthonormalGrayRadiationMoments],
    final_matter: &[ValenciaConserved],
    final_radiation: &[OrthonormalGrayRadiationMoments],
    cell_width: f64,
) -> (f64, f64, f64) {
    initial_matter
        .iter()
        .zip(initial_radiation)
        .zip(final_matter.iter().zip(final_radiation))
        .fold(
            (0.0, 0.0, 0.0),
            |total, ((matter0, radiation0), (matter1, radiation1))| {
                (
                    total.0
                        + (matter1.densitized_rest_mass - matter0.densitized_rest_mass)
                            * cell_width,
                    total.1
                        + (matter1.energy_excluding_rest_mass + radiation1.energy_density
                            - matter0.energy_excluding_rest_mass
                            - radiation0.energy_density)
                            * cell_width,
                    total.2
                        + (matter1.momentum_density.x + radiation1.flux.x
                            - matter0.momentum_density.x
                            - radiation0.flux.x)
                            * cell_width,
                )
            },
        )
}

fn maximum_reduced_flux_in(cells: &[OrthonormalGrayRadiationMoments]) -> Result<f64, String> {
    cells.iter().try_fold(0.0_f64, |maximum, &moments| {
        Ok(maximum.max(close(moments)?.diagnostics.reduced_flux))
    })
}

fn close(
    moments: OrthonormalGrayRadiationMoments,
) -> Result<crate::radiation::ClosedOrthonormalRadiationMoments, String> {
    close_gray_m1_moments(RadiationTransportMode::GrayM1, moments)
        .map_err(|error| error.to_string())
}

fn eos_pressure(eos: ValenciaIdealGas, density: f64, energy: f64) -> Result<f64, String> {
    use crate::ValenciaEquationOfState;
    eos.pressure(density, energy)
        .map_err(|error| error.to_string())
}

fn cell_center(index: usize, cell_width: f64) -> f64 {
    DOMAIN_MIN + (index as f64 + 0.5) * cell_width
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

fn is_failed_recovery(diagnostic: PrimitiveRecoveryDiagnostic) -> bool {
    matches!(
        diagnostic,
        PrimitiveRecoveryDiagnostic::AtmosphereApplied
            | PrimitiveRecoveryDiagnostic::InvalidConservedState
            | PrimitiveRecoveryDiagnostic::EquationOfStateOutOfBounds
    )
}

#[cfg(test)]
mod tests {
    use super::maximum_reduced_flux_in;
    use crate::{radiation::OrthonormalGrayRadiationMoments, vec3};

    #[test]
    fn radiative_shock_reduced_flux_summary_observes_the_supplied_state() {
        let moments = [
            OrthonormalGrayRadiationMoments::new(2.0, vec3::new(1.0, 0.0, 0.0)),
            OrthonormalGrayRadiationMoments::new(4.0, vec3::new(1.0, 0.0, 0.0)),
        ];

        assert_eq!(maximum_reduced_flux_in(&moments).unwrap(), 0.5);
    }
}
