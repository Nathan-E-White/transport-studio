use transport_engine::{
    GeometryEntity, Material, ParticleEventType, ParticleKind, RunSettings,
    SimplePhotonCoefficients, Source, Tally, TallyKind, Transform3, TransportProblem,
    V1SolverStatus, Vec3, backend_metadata, compare_v1_results, prepare_v1_input_bundle,
    run_photon_smoke, run_v1_solver_bundle, v1_solver_registry,
};

#[test]
fn vector_math_remains_available_from_the_root_facade() {
    let vector = Vec3::new(3.0, 4.0, 0.0);

    assert_eq!(vector.dot(Vec3::X), 3.0);
    assert_eq!(vector.norm(), 5.0);
    let normalized = vector.normalized_or_x();
    assert_close(normalized.x, 0.6);
    assert_close(normalized.y, 0.8);
    assert_close(normalized.z, 0.0);
    assert_eq!(Vec3::ZERO.normalized_or_x(), Vec3::X);
}

#[test]
fn analytic_geometry_remains_observable_through_photon_results() {
    for (geometry, expected_id, expected_path_length) in [
        (
            GeometryEntity::Box {
                id: "box-1".into(),
                name: "Box".into(),
                material_id: "void".into(),
                transform: centered_transform(),
                size: Vec3::new(2.0, 4.0, 4.0),
            },
            "box-1",
            2.0,
        ),
        (
            GeometryEntity::Sphere {
                id: "sphere-1".into(),
                name: "Sphere".into(),
                material_id: "void".into(),
                transform: centered_transform(),
                radius: 1.0,
            },
            "sphere-1",
            2.0,
        ),
        (
            GeometryEntity::Cylinder {
                id: "cylinder-1".into(),
                name: "Cylinder".into(),
                material_id: "void".into(),
                transform: centered_transform(),
                radius: 1.0,
                height: 4.0,
            },
            "cylinder-1",
            2.0,
        ),
    ] {
        let result = run_photon_smoke(&photon_problem(geometry, expected_id));
        let events = &result.tracks[0].events;

        assert!(events.iter().any(|event| {
            event.event_type == ParticleEventType::BoundaryCrossing
                && event.entity_id.as_deref() == Some(expected_id)
        }));
        assert_eq!(result.tally_deltas[0].scores, vec![expected_path_length]);
    }
}

#[test]
fn v1_orchestration_and_results_remain_available_from_the_root_facade() {
    let registry = v1_solver_registry();
    assert_eq!(
        registry
            .iter()
            .find(|solver| solver.id == "criticality-keff")
            .expect("criticality capability")
            .status,
        V1SolverStatus::Gated
    );

    let bundle = prepare_v1_input_bundle("mock-fields", "problem-1", "fingerprint-1")
        .expect("runnable solver input");
    let first = run_v1_solver_bundle(&bundle);
    let cloned = first.clone();
    let second = run_v1_solver_bundle(&bundle);
    let comparison = compare_v1_results(&first, &second);

    assert_eq!(first, cloned);
    assert!(format!("{first:?}").contains("mock-fields"));
    assert_eq!(first.fields, second.fields);
    assert!(comparison.same_problem);
    assert_eq!(comparison.max_abs_delta, 0.0);
    assert!(comparison.diagnostics.is_empty());
}

#[test]
fn photon_metadata_and_results_remain_root_facade_types() {
    let metadata = backend_metadata();
    assert_eq!(metadata, metadata.clone());
    assert!(format!("{metadata:?}").contains("native-rust-photon-smoke"));

    let result = run_photon_smoke(&photon_problem(
        GeometryEntity::Sphere {
            id: "sphere-1".into(),
            name: "Sphere".into(),
            material_id: "void".into(),
            transform: centered_transform(),
            radius: 1.0,
        },
        "sphere-1",
    ));
    assert_eq!(result, result.clone());
    assert!(format!("{result:?}").contains("problem-1"));
}

fn photon_problem(geometry: GeometryEntity, entity_id: &str) -> TransportProblem {
    TransportProblem {
        id: "problem-1".into(),
        name: "Facade characterization".into(),
        geometry: vec![geometry],
        materials: vec![Material {
            id: "void".into(),
            name: "Void".into(),
            density: 0.0,
            coefficients: Some(SimplePhotonCoefficients {
                attenuation: 0.0,
                scatter_probability: 0.0,
                absorption_probability: 0.0,
            }),
        }],
        sources: vec![Source::Beam {
            id: "source-1".into(),
            name: "Beam".into(),
            particle: ParticleKind::Photon,
            position: Vec3::new(-4.0, 0.0, 0.0),
            direction: Vec3::X,
            energy_mev: 1.0,
            strength: 1.0,
        }],
        tallies: vec![Tally {
            id: "tally-1".into(),
            name: "Track length".into(),
            particle: ParticleKind::Photon,
            kind: TallyKind::TrackLength,
            target_entity_id: Some(entity_id.into()),
        }],
        settings: RunSettings {
            histories: 1,
            seed: 7,
            max_steps_per_history: 16,
            visible_history_budget: 1,
        },
    }
}

fn centered_transform() -> Transform3 {
    Transform3 {
        position: Vec3::ZERO,
        rotation: Vec3::ZERO,
    }
}

fn assert_close(actual: f64, expected: f64) {
    assert!(
        (actual - expected).abs() < 1.0e-12,
        "{actual} != {expected}"
    );
}
