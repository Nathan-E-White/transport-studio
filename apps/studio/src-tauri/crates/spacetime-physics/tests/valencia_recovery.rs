use spacetime_physics::expert::{
    PrimitiveRecoveryDiagnostic, PrimitiveRecoveryError, PrimitiveRecoveryPolicy,
    SymmetricSpatialTensor2, ValenciaConserved, ValenciaEquationOfState, ValenciaGeometry,
    ValenciaIdealGas, ValenciaPolytrope, ValenciaPrimitive, primitive_to_conserved,
    recover_primitives, vec3,
};

fn assert_roundtrip<E: ValenciaEquationOfState>(eos: E, energy: f64) {
    let primitive = ValenciaPrimitive {
        rest_mass_density: 1.2,
        velocity: vec3::new(0.15, -0.05, 0.02),
        specific_internal_energy: energy,
        pressure: eos.pressure(1.2, energy).unwrap(),
    };
    let conserved = primitive_to_conserved(primitive, eos, ValenciaGeometry::FLAT).unwrap();
    let recovered = recover_primitives(
        conserved,
        eos,
        ValenciaGeometry::FLAT,
        PrimitiveRecoveryPolicy::DEFAULT,
    )
    .unwrap();
    assert!((recovered.primitive.rest_mass_density - primitive.rest_mass_density).abs() < 1e-7);
    assert!((recovered.primitive.velocity.x - primitive.velocity.x).abs() < 1e-7);
    assert!((recovered.primitive.velocity.y - primitive.velocity.y).abs() < 1e-7);
    assert!((recovered.primitive.velocity.z - primitive.velocity.z).abs() < 1e-7);
    assert!(
        (recovered.primitive.specific_internal_energy - primitive.specific_internal_energy).abs()
            < 1e-7
    );
    assert!((recovered.primitive.pressure - primitive.pressure).abs() < 1e-7);
    let reconstructed =
        primitive_to_conserved(recovered.primitive, eos, ValenciaGeometry::FLAT).unwrap();
    assert!((reconstructed.densitized_rest_mass - conserved.densitized_rest_mass).abs() < 1e-8);
    assert!((reconstructed.momentum_density.x - conserved.momentum_density.x).abs() < 1e-8);
    assert!((reconstructed.momentum_density.y - conserved.momentum_density.y).abs() < 1e-8);
    assert!((reconstructed.momentum_density.z - conserved.momentum_density.z).abs() < 1e-8);
    assert!(
        (reconstructed.energy_excluding_rest_mass - conserved.energy_excluding_rest_mass).abs()
            < 1e-8
    );
}

#[test]
fn ideal_gas_roundtrips_primitive_conserved_primitive() {
    assert_roundtrip(ValenciaIdealGas { gamma: 5.0 / 3.0 }, 0.4);
}

#[test]
fn polytropic_roundtrips_primitive_conserved_primitive() {
    assert_roundtrip(
        ValenciaPolytrope {
            constant: 0.2,
            gamma: 2.0,
        },
        0.2,
    );
}

#[test]
fn polytropic_eos_rejects_non_finite_density() {
    assert!(
        ValenciaPolytrope {
            constant: 0.2,
            gamma: 2.0,
        }
        .pressure(f64::NAN, 0.0)
        .is_err()
    );
}

#[test]
fn curved_spatial_metric_roundtrips_and_densitizes_state() {
    let metric = SymmetricSpatialTensor2::new([[2.0, 0.3, 0.1], [0.3, 1.5, 0.2], [0.1, 0.2, 1.2]]);
    let geometry = ValenciaGeometry::from_spatial_metric(metric).unwrap();
    let eos = ValenciaIdealGas { gamma: 1.4 };
    let primitive = ValenciaPrimitive {
        rest_mass_density: 0.9,
        velocity: vec3::new(0.1, -0.05, 0.02),
        specific_internal_energy: 0.3,
        pressure: eos.pressure(0.9, 0.3).unwrap(),
    };
    let flat = primitive_to_conserved(primitive, eos, ValenciaGeometry::FLAT).unwrap();
    let curved = primitive_to_conserved(primitive, eos, geometry).unwrap();
    let sqrt_gamma = metric.determinant().sqrt();
    let covariant_velocity = vec3::new(0.187, -0.041, 0.024);
    let v2 = primitive.velocity.dot(covariant_velocity);
    let lorentz = 1.0 / (1.0 - v2).sqrt();
    let enthalpy =
        1.0 + primitive.specific_internal_energy + primitive.pressure / primitive.rest_mass_density;
    let q = primitive.rest_mass_density * enthalpy * lorentz * lorentz;
    let d = primitive.rest_mass_density * lorentz;
    assert!((geometry.volume_factor() - sqrt_gamma).abs() < 1e-12);
    assert_eq!(geometry.spatial_metric(), metric);
    assert!((curved.densitized_rest_mass - sqrt_gamma * d).abs() < 1e-12);
    assert!((curved.momentum_density.x - sqrt_gamma * q * covariant_velocity.x).abs() < 1e-12);
    assert!((curved.momentum_density.y - sqrt_gamma * q * covariant_velocity.y).abs() < 1e-12);
    assert!((curved.momentum_density.z - sqrt_gamma * q * covariant_velocity.z).abs() < 1e-12);
    assert!(curved.densitized_rest_mass > flat.densitized_rest_mass);

    let recovered =
        recover_primitives(curved, eos, geometry, PrimitiveRecoveryPolicy::DEFAULT).unwrap();
    assert!((recovered.primitive.rest_mass_density - primitive.rest_mass_density).abs() < 1e-7);
    assert!((recovered.primitive.velocity.x - primitive.velocity.x).abs() < 1e-7);
    assert!((recovered.primitive.velocity.y - primitive.velocity.y).abs() < 1e-7);
    assert!((recovered.primitive.velocity.z - primitive.velocity.z).abs() < 1e-7);
}

#[test]
fn invalid_conserved_state_applies_atmosphere_with_diagnostics() {
    let valid = ValenciaConserved {
        densitized_rest_mass: 1.0,
        momentum_density: vec3::ZERO,
        energy_excluding_rest_mass: 0.1,
    };
    for invalid in [
        ValenciaConserved {
            densitized_rest_mass: 0.0,
            ..valid
        },
        ValenciaConserved {
            densitized_rest_mass: f64::NAN,
            ..valid
        },
        ValenciaConserved {
            energy_excluding_rest_mass: f64::NAN,
            ..valid
        },
        ValenciaConserved {
            momentum_density: vec3::new(f64::NAN, 0.0, 0.0),
            ..valid
        },
        ValenciaConserved {
            momentum_density: vec3::new(0.0, f64::NAN, 0.0),
            ..valid
        },
        ValenciaConserved {
            momentum_density: vec3::new(0.0, 0.0, f64::NAN),
            ..valid
        },
    ] {
        let outcome = recover_primitives(
            invalid,
            ValenciaIdealGas { gamma: 1.4 },
            ValenciaGeometry::FLAT,
            PrimitiveRecoveryPolicy::DEFAULT,
        )
        .unwrap();
        assert_eq!(outcome.primitive.velocity, vec3::ZERO);
        assert!(
            outcome
                .diagnostics
                .contains(&PrimitiveRecoveryDiagnostic::InvalidConservedState)
        );
        assert_eq!(
            outcome
                .diagnostics
                .iter()
                .filter(|diagnostic| {
                    **diagnostic == PrimitiveRecoveryDiagnostic::AtmosphereApplied
                })
                .count(),
            1
        );
    }
}

#[test]
fn bounded_fallback_recovers_when_newton_budget_is_exhausted() {
    let eos = ValenciaIdealGas { gamma: 1.4 };
    let primitive = ValenciaPrimitive {
        rest_mass_density: 0.8,
        velocity: vec3::new(0.3, 0.1, 0.0),
        specific_internal_energy: 0.6,
        pressure: eos.pressure(0.8, 0.6).unwrap(),
    };
    let conserved = primitive_to_conserved(primitive, eos, ValenciaGeometry::FLAT).unwrap();
    let outcome = recover_primitives(
        conserved,
        eos,
        ValenciaGeometry::FLAT,
        PrimitiveRecoveryPolicy {
            max_iterations: 1,
            tolerance: 1e-12,
            ..PrimitiveRecoveryPolicy::DEFAULT
        },
    )
    .unwrap();
    assert!(
        outcome
            .diagnostics
            .contains(&PrimitiveRecoveryDiagnostic::BisectionFallback)
    );
    assert!(
        !outcome
            .diagnostics
            .contains(&PrimitiveRecoveryDiagnostic::AtmosphereApplied)
    );
    assert!((outcome.primitive.rest_mass_density - primitive.rest_mass_density).abs() < 1e-7);
}

#[test]
fn primitive_conversion_rejects_each_invalid_domain_condition() {
    let eos = ValenciaIdealGas { gamma: 1.4 };
    let valid = ValenciaPrimitive {
        rest_mass_density: 1.0,
        velocity: vec3::ZERO,
        specific_internal_energy: 0.1,
        pressure: 0.04,
    };
    for invalid in [
        ValenciaPrimitive {
            rest_mass_density: 0.0,
            ..valid
        },
        ValenciaPrimitive {
            rest_mass_density: f64::NAN,
            ..valid
        },
        ValenciaPrimitive {
            velocity: vec3::new(1.0, 0.0, 0.0),
            ..valid
        },
        ValenciaPrimitive {
            velocity: vec3::new(f64::NAN, 0.0, 0.0),
            ..valid
        },
        ValenciaPrimitive {
            specific_internal_energy: -0.1,
            ..valid
        },
        ValenciaPrimitive {
            specific_internal_energy: f64::NAN,
            ..valid
        },
        ValenciaPrimitive {
            pressure: f64::NAN,
            ..valid
        },
        ValenciaPrimitive {
            pressure: valid.pressure * 2.0,
            ..valid
        },
    ] {
        assert!(primitive_to_conserved(invalid, eos, ValenciaGeometry::FLAT).is_err());
    }
}

#[test]
fn invalid_policy_and_metric_are_configuration_errors() {
    let conserved = ValenciaConserved {
        densitized_rest_mass: 1.0,
        momentum_density: vec3::ZERO,
        energy_excluding_rest_mass: 0.1,
    };
    let eos = ValenciaIdealGas { gamma: 1.4 };
    for invalid_policy in [
        PrimitiveRecoveryPolicy {
            density_floor: 0.0,
            ..PrimitiveRecoveryPolicy::DEFAULT
        },
        PrimitiveRecoveryPolicy {
            density_floor: f64::NAN,
            ..PrimitiveRecoveryPolicy::DEFAULT
        },
        PrimitiveRecoveryPolicy {
            pressure_floor: -1.0,
            ..PrimitiveRecoveryPolicy::DEFAULT
        },
        PrimitiveRecoveryPolicy {
            pressure_floor: f64::NAN,
            ..PrimitiveRecoveryPolicy::DEFAULT
        },
        PrimitiveRecoveryPolicy {
            atmosphere_density: 0.0,
            ..PrimitiveRecoveryPolicy::DEFAULT
        },
        PrimitiveRecoveryPolicy {
            atmosphere_density: f64::NAN,
            ..PrimitiveRecoveryPolicy::DEFAULT
        },
        PrimitiveRecoveryPolicy {
            lorentz_factor_cap: 1.0,
            ..PrimitiveRecoveryPolicy::DEFAULT
        },
        PrimitiveRecoveryPolicy {
            lorentz_factor_cap: f64::NAN,
            ..PrimitiveRecoveryPolicy::DEFAULT
        },
        PrimitiveRecoveryPolicy {
            tolerance: 0.0,
            ..PrimitiveRecoveryPolicy::DEFAULT
        },
        PrimitiveRecoveryPolicy {
            tolerance: f64::NAN,
            ..PrimitiveRecoveryPolicy::DEFAULT
        },
        PrimitiveRecoveryPolicy {
            max_iterations: 0,
            ..PrimitiveRecoveryPolicy::DEFAULT
        },
    ] {
        assert_eq!(
            recover_primitives(conserved, eos, ValenciaGeometry::FLAT, invalid_policy,),
            Err(PrimitiveRecoveryError::InvalidPolicy)
        );
    }

    assert!(
        ValenciaGeometry::from_spatial_metric(SymmetricSpatialTensor2::diagonal(1.0, 1.0, -1.0,))
            .is_err()
    );
}

#[derive(Copy, Clone)]
struct RejectingEquationOfState;

impl ValenciaEquationOfState for RejectingEquationOfState {
    fn pressure(
        &self,
        _density: f64,
        _specific_internal_energy: f64,
    ) -> Result<f64, spacetime_physics::expert::PhysicsError> {
        Err(spacetime_physics::expert::PhysicsError::InvalidStep)
    }
}

#[test]
fn failed_fallback_preserves_diagnostics_before_applying_atmosphere() {
    let outcome = recover_primitives(
        ValenciaConserved {
            densitized_rest_mass: 1.0,
            momentum_density: vec3::ZERO,
            energy_excluding_rest_mass: 0.1,
        },
        RejectingEquationOfState,
        ValenciaGeometry::FLAT,
        PrimitiveRecoveryPolicy::DEFAULT,
    )
    .unwrap();
    assert_eq!(
        outcome.diagnostics,
        vec![
            PrimitiveRecoveryDiagnostic::EquationOfStateOutOfBounds,
            PrimitiveRecoveryDiagnostic::BisectionFallback,
            PrimitiveRecoveryDiagnostic::AtmosphereApplied,
        ]
    );
}

#[test]
fn recovery_reports_density_pressure_and_lorentz_safeguards() {
    let eos = ValenciaIdealGas { gamma: 1.4 };
    let low_density = recover_primitives(
        ValenciaConserved {
            densitized_rest_mass: 1e-15,
            momentum_density: vec3::ZERO,
            energy_excluding_rest_mass: 1e-12,
        },
        eos,
        ValenciaGeometry::FLAT,
        PrimitiveRecoveryPolicy::DEFAULT,
    )
    .unwrap();
    assert!(
        low_density
            .diagnostics
            .contains(&PrimitiveRecoveryDiagnostic::DensityFloorApplied)
    );

    let cold = recover_primitives(
        ValenciaConserved {
            densitized_rest_mass: 1.0,
            momentum_density: vec3::ZERO,
            energy_excluding_rest_mass: 0.0,
        },
        ValenciaPolytrope {
            constant: 0.0,
            gamma: 2.0,
        },
        ValenciaGeometry::FLAT,
        PrimitiveRecoveryPolicy {
            pressure_floor: 1e-4,
            ..PrimitiveRecoveryPolicy::DEFAULT
        },
    )
    .unwrap();
    assert!(
        cold.diagnostics
            .contains(&PrimitiveRecoveryDiagnostic::EquationOfStateOutOfBounds)
    );
    assert!(
        cold.diagnostics
            .contains(&PrimitiveRecoveryDiagnostic::AtmosphereApplied)
    );
    assert!(
        !cold
            .diagnostics
            .contains(&PrimitiveRecoveryDiagnostic::PressureFloorApplied)
    );
    assert!(
        primitive_to_conserved(
            cold.primitive,
            ValenciaPolytrope {
                constant: 0.0,
                gamma: 2.0,
            },
            ValenciaGeometry::FLAT,
        )
        .is_ok()
    );

    let fast = primitive_to_conserved(
        ValenciaPrimitive {
            rest_mass_density: 1.0,
            velocity: vec3::new(0.95, 0.0, 0.0),
            specific_internal_energy: 0.2,
            pressure: eos.pressure(1.0, 0.2).unwrap(),
        },
        eos,
        ValenciaGeometry::FLAT,
    )
    .unwrap();
    let capped = recover_primitives(
        fast,
        eos,
        ValenciaGeometry::FLAT,
        PrimitiveRecoveryPolicy {
            lorentz_factor_cap: 2.0,
            ..PrimitiveRecoveryPolicy::DEFAULT
        },
    )
    .unwrap();
    assert!(
        capped
            .diagnostics
            .contains(&PrimitiveRecoveryDiagnostic::LorentzFactorCapped)
    );
    assert!(capped.primitive.velocity.norm_squared() <= 0.75 + 1e-12);
}
