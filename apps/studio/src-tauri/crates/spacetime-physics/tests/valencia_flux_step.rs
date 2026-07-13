use approx::assert_abs_diff_eq;
use spacetime_physics::{
    PrimitiveRecoveryDiagnostic, PrimitiveRecoveryPolicy, TimeDuration, ValenciaConserved,
    ValenciaFiniteVolumeError, ValenciaFlatFiniteVolumeConfig, ValenciaGeometry, ValenciaIdealGas,
    ValenciaPrimitive, primitive_to_conserved, valencia_flat_finite_volume_step_1d, vec3,
};

#[test]
fn flat_valencia_shock_step_moves_mass_and_momentum_across_the_interface() {
    let eos = ValenciaIdealGas { gamma: 1.4 };
    let left = conserved(eos, 1.0, 0.0, 1.0);
    let right = conserved(eos, 0.125, 0.0, 0.1);
    let initial = vec![left, left, left, right, right, right];

    let result = valencia_flat_finite_volume_step_1d(
        &initial,
        eos,
        ValenciaFlatFiniteVolumeConfig {
            cell_width: 1.0,
            timestep: TimeDuration::from_seconds(0.1),
            courant_factor: 0.5,
            recovery_policy: PrimitiveRecoveryPolicy::DEFAULT,
        },
    )
    .unwrap();

    assert_eq!(result.cells.len(), initial.len());
    assert_eq!(result.cells[0].conserved, left);
    assert_eq!(result.cells[5].conserved, right);
    assert!(result.cells[2].conserved.densitized_rest_mass < left.densitized_rest_mass);
    assert!(result.cells[3].conserved.densitized_rest_mass > right.densitized_rest_mass);
    assert!(result.cells[2].conserved.momentum_density.x > 0.0);
    assert!(result.cells[3].conserved.momentum_density.x > 0.0);
    assert!(result.cells.iter().all(|cell| {
        cell.primitive.rest_mass_density.is_finite()
            && cell.primitive.rest_mass_density > 0.0
            && cell.primitive.pressure.is_finite()
            && cell.primitive.pressure >= 0.0
    }));
}

#[test]
fn extreme_finite_state_outside_recovery_range_is_rejected_explicitly() {
    let eos = ValenciaIdealGas { gamma: 1.4 };
    let velocity = 0.99_f64.sqrt();
    let state = conserved(eos, 7.0e305, velocity, 2.8e305);
    let initial = vec![state; 3];

    assert_eq!(
        valencia_flat_finite_volume_step_1d(
            &initial,
            eos,
            ValenciaFlatFiniteVolumeConfig {
                cell_width: 1.0,
                timestep: TimeDuration::from_seconds(0.1),
                courant_factor: 0.5,
                recovery_policy: PrimitiveRecoveryPolicy::DEFAULT,
            },
        ),
        Err(ValenciaFiniteVolumeError::InputOutsideNumericalRange { index: 0 })
    );
}

#[test]
fn asymmetric_worked_example_matches_the_flat_rusanov_update() {
    let eos = ValenciaIdealGas { gamma: 1.4 };
    let initial = vec![
        conserved(eos, 0.9, -0.2, 0.4),
        conserved(eos, 1.1, 0.1, 0.7),
        conserved(eos, 0.7, 0.25, 0.3),
        conserved(eos, 1.3, -0.15, 0.8),
        conserved(eos, 0.6, 0.05, 0.2),
    ];
    let result = valencia_flat_finite_volume_step_1d(
        &initial,
        eos,
        ValenciaFlatFiniteVolumeConfig {
            cell_width: 0.5,
            timestep: TimeDuration::from_seconds(0.08),
            courant_factor: 0.5,
            recovery_policy: PrimitiveRecoveryPolicy::DEFAULT,
        },
    )
    .unwrap();

    // Independently worked piecewise-constant, unit-signal-speed Rusanov values.
    let expected = [
        [
            1.030_820_108_603_831_3,
            0.306_545_454_545_454_57,
            1.602_634_436_850_714_4,
        ],
        [
            0.825_540_088_794_276_9,
            0.357_673_202_614_379,
            1.071_897_819_702_455,
        ],
        [
            1.222_449_070_761_744_6,
            -0.468_872_000_974_302_8,
            1.874_538_872_241_544,
        ],
    ];
    for (cell, expected) in result.cells[1..4].iter().zip(expected) {
        assert_abs_diff_eq!(
            cell.conserved.densitized_rest_mass,
            expected[0],
            epsilon = 1.0e-12
        );
        assert_abs_diff_eq!(
            cell.conserved.momentum_density.x,
            expected[1],
            epsilon = 1.0e-12
        );
        assert_abs_diff_eq!(
            cell.conserved.energy_excluding_rest_mass,
            expected[2],
            epsilon = 1.0e-12
        );
        assert_abs_diff_eq!(cell.conserved.momentum_density.y, 0.0, epsilon = 1.0e-12);
        assert_abs_diff_eq!(cell.conserved.momentum_density.z, 0.0, epsilon = 1.0e-12);
    }
}

#[test]
fn flat_step_rejects_invalid_grid_and_cfl_configuration() {
    let eos = ValenciaIdealGas { gamma: 1.4 };
    let cell = conserved(eos, 1.0, 0.0, 0.5);
    let valid_cells = vec![cell; 3];
    let valid = ValenciaFlatFiniteVolumeConfig {
        cell_width: 1.0,
        timestep: TimeDuration::from_seconds(0.5),
        courant_factor: 0.5,
        recovery_policy: PrimitiveRecoveryPolicy::DEFAULT,
    };

    assert!(valencia_flat_finite_volume_step_1d(&valid_cells, eos, valid).is_ok());
    assert!(
        valencia_flat_finite_volume_step_1d(
            &valid_cells,
            eos,
            ValenciaFlatFiniteVolumeConfig {
                courant_factor: 1.0,
                ..valid
            },
        )
        .is_ok()
    );
    assert!(
        valencia_flat_finite_volume_step_1d(
            &valid_cells,
            eos,
            ValenciaFlatFiniteVolumeConfig {
                cell_width: 2.0,
                timestep: TimeDuration::from_seconds(1.0),
                courant_factor: 0.75,
                ..valid
            },
        )
        .is_ok()
    );
    assert_eq!(
        valencia_flat_finite_volume_step_1d(&valid_cells[..2], eos, valid),
        Err(ValenciaFiniteVolumeError::TooFewCells)
    );
    for invalid in [
        ValenciaFlatFiniteVolumeConfig {
            cell_width: 0.0,
            ..valid
        },
        ValenciaFlatFiniteVolumeConfig {
            cell_width: -1.0,
            ..valid
        },
        ValenciaFlatFiniteVolumeConfig {
            cell_width: f64::NAN,
            ..valid
        },
    ] {
        assert_eq!(
            valencia_flat_finite_volume_step_1d(&valid_cells, eos, invalid),
            Err(ValenciaFiniteVolumeError::InvalidCellWidth)
        );
    }
    for invalid in [0.0, -0.1, f64::NAN] {
        assert_eq!(
            valencia_flat_finite_volume_step_1d(
                &valid_cells,
                eos,
                ValenciaFlatFiniteVolumeConfig {
                    timestep: TimeDuration::from_seconds(invalid),
                    ..valid
                },
            ),
            Err(ValenciaFiniteVolumeError::InvalidTimestep)
        );
    }
    for invalid in [0.0, -0.1, f64::NAN, 1.1] {
        assert_eq!(
            valencia_flat_finite_volume_step_1d(
                &valid_cells,
                eos,
                ValenciaFlatFiniteVolumeConfig {
                    courant_factor: invalid,
                    ..valid
                },
            ),
            Err(ValenciaFiniteVolumeError::InvalidCourantFactor)
        );
    }
    assert_eq!(
        valencia_flat_finite_volume_step_1d(
            &valid_cells,
            eos,
            ValenciaFlatFiniteVolumeConfig {
                timestep: TimeDuration::from_seconds(0.6),
                ..valid
            },
        ),
        Err(ValenciaFiniteVolumeError::CflViolation)
    );
}

#[test]
fn fixed_boundary_cells_reject_recovery_projection() {
    let eos = ValenciaIdealGas { gamma: 1.4 };
    let valid = conserved(eos, 1.0, 0.0, 0.5);
    let mut initial = vec![valid; 3];
    initial[0].densitized_rest_mass = f64::NAN;
    assert_eq!(
        valencia_flat_finite_volume_step_1d(
            &initial,
            eos,
            ValenciaFlatFiniteVolumeConfig {
                cell_width: 1.0,
                timestep: TimeDuration::from_seconds(0.1),
                courant_factor: 0.5,
                recovery_policy: PrimitiveRecoveryPolicy::DEFAULT,
            },
        ),
        Err(ValenciaFiniteVolumeError::InvalidBoundaryState { index: 0 })
    );
    initial[0] = valid;
    initial[2].densitized_rest_mass = f64::NAN;
    assert_eq!(
        valencia_flat_finite_volume_step_1d(
            &initial,
            eos,
            ValenciaFlatFiniteVolumeConfig {
                cell_width: 1.0,
                timestep: TimeDuration::from_seconds(0.1),
                courant_factor: 0.5,
                recovery_policy: PrimitiveRecoveryPolicy::DEFAULT,
            },
        ),
        Err(ValenciaFiniteVolumeError::InvalidBoundaryState { index: 2 })
    );
}

#[test]
fn primitive_recovery_corrections_remain_visible_on_the_affected_cell() {
    let eos = ValenciaIdealGas { gamma: 1.4 };
    let valid = conserved(eos, 1.0, 0.1, 0.5);
    let mut initial = vec![valid; 5];
    initial[2] = ValenciaConserved {
        densitized_rest_mass: f64::NAN,
        ..valid
    };

    let result = valencia_flat_finite_volume_step_1d(
        &initial,
        eos,
        ValenciaFlatFiniteVolumeConfig {
            cell_width: 1.0,
            timestep: TimeDuration::from_seconds(0.05),
            courant_factor: 0.5,
            recovery_policy: PrimitiveRecoveryPolicy::DEFAULT,
        },
    )
    .unwrap();

    assert!(
        result.cells[2]
            .recovery_diagnostics
            .before_flux
            .contains(&PrimitiveRecoveryDiagnostic::InvalidConservedState)
    );
    assert!(
        result.cells[2]
            .recovery_diagnostics
            .before_flux
            .contains(&PrimitiveRecoveryDiagnostic::AtmosphereApplied)
    );
    assert!(result.cells[2].conserved.densitized_rest_mass.is_finite());
    assert!(result.cells[2].primitive.rest_mass_density.is_finite());
}

fn conserved(
    eos: ValenciaIdealGas,
    rest_mass_density: f64,
    velocity_x: f64,
    pressure: f64,
) -> spacetime_physics::ValenciaConserved {
    let specific_internal_energy = pressure / ((eos.gamma - 1.0) * rest_mass_density);
    primitive_to_conserved(
        ValenciaPrimitive {
            rest_mass_density,
            velocity: vec3::new(velocity_x, 0.0, 0.0),
            specific_internal_energy,
            pressure,
        },
        eos,
        ValenciaGeometry::FLAT,
    )
    .unwrap()
}
