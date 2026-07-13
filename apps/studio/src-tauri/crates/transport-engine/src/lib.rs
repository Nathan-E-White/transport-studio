mod diagnostics;
mod geometry;
mod photon_smoke;
mod v1;

pub use diagnostics::*;
pub use geometry::*;
pub use photon_smoke::*;
pub use v1::*;

#[cfg(test)]
mod tests {
    use super::*;

    fn beam_problem(material: Material) -> TransportProblem {
        TransportProblem {
            id: "problem-1".to_string(),
            name: "Beam Smoke".to_string(),
            geometry: vec![GeometryEntity::Box {
                id: "box-1".to_string(),
                name: "Shield".to_string(),
                material_id: material.id.clone(),
                transform: Transform3 {
                    position: Vec3::ZERO,
                    rotation: Vec3::ZERO,
                },
                size: Vec3::new(2.0, 4.0, 4.0),
            }],
            materials: vec![material],
            sources: vec![Source::Beam {
                id: "src-1".to_string(),
                name: "Beam".to_string(),
                particle: ParticleKind::Photon,
                position: Vec3::new(-4.0, 0.0, 0.0),
                direction: Vec3::X,
                energy_mev: 1.0,
                strength: 1.0,
            }],
            tallies: vec![Tally {
                id: "tally-1".to_string(),
                name: "Flux".to_string(),
                particle: ParticleKind::Photon,
                kind: TallyKind::TrackLength,
                target_entity_id: Some("box-1".to_string()),
            }],
            settings: RunSettings {
                histories: 8,
                seed: 7,
                max_steps_per_history: 16,
                visible_history_budget: 8,
            },
        }
    }

    #[test]
    fn seeded_runs_are_deterministic() {
        let problem = beam_problem(Material {
            id: "mat-water".to_string(),
            name: "Water".to_string(),
            density: 1.0,
            coefficients: None,
        });

        assert_eq!(run_photon_smoke(&problem), run_photon_smoke(&problem));
    }

    #[test]
    fn v1_registry_keeps_runnable_and_gated_solvers_visible() {
        let registry = v1_solver_registry();

        assert_eq!(
            registry.iter().map(|solver| solver.id).collect::<Vec<_>>(),
            vec![
                "mock-fields",
                "gray-radiation-diffusion",
                "eulerian-hydro",
                "multigroup-radiation-diffusion",
                "discrete-ordinates",
                "implicit-monte-carlo",
                "lagrangian-hydro",
                "ale-hydro",
                "criticality-keff",
                "point-kinetics",
                "depletion",
                "relativistic-multiphysics",
            ]
        );
        assert_eq!(
            registry
                .iter()
                .find(|solver| solver.id == "criticality-keff")
                .expect("criticality solver")
                .status(),
            V1SolverStatus::Gated
        );
    }

    #[test]
    fn v1_registry_matches_shared_versioned_capability_contract() {
        let contract: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../../../fixtures/contracts/v1-solver-capabilities.json"
        ))
        .expect("valid shared solver capability contract");
        let registry = v1_solver_registry()
            .into_iter()
            .map(|solver| {
                serde_json::json!({
                    "id": solver.id,
                    "name": solver.name,
                    "status": match solver.status() {
                        V1SolverStatus::Runnable => "runnable",
                        V1SolverStatus::Gated => "gated",
                    },
                    "claimStatus": match solver.claim_status() {
                        V1ClaimStatus::Solved => "solved",
                        V1ClaimStatus::ValidatedOnly => "validated-only",
                        V1ClaimStatus::Substrate => "substrate",
                        V1ClaimStatus::Gated => "gated",
                        V1ClaimStatus::FutureTrack => "future-track",
                    },
                    "supportedFacets": solver.supported_facets,
                    "requiredInputs": solver.required_inputs,
                    "emittedOutputs": solver.emitted_outputs,
                })
            })
            .collect::<Vec<_>>();

        assert_eq!(contract["contractVersion"], "1.1.0");
        assert_eq!(contract["solvers"], serde_json::Value::Array(registry));
    }

    #[test]
    fn relativistic_multiphysics_is_substrate_and_cannot_prepare_a_run() {
        let capability = v1_solver_registry()
            .into_iter()
            .find(|solver| solver.id == "relativistic-multiphysics")
            .expect("relativistic multiphysics capability");

        assert_eq!(capability.state, V1CapabilityState::GatedSubstrate);
        assert_eq!(capability.status(), V1SolverStatus::Gated);
        assert_eq!(capability.claim_status(), V1ClaimStatus::Substrate);
        let diagnostic =
            prepare_v1_input_bundle("relativistic-multiphysics", "problem-1", "fingerprint-1")
                .expect_err("substrate must not produce a runnable bundle");
        assert_eq!(diagnostic.code, "solver.substrate");
        assert!(diagnostic.message.contains("kernel substrate"));
    }

    #[test]
    fn v1_gated_solvers_return_unsupported_diagnostic() {
        for solver in v1_solver_registry()
            .into_iter()
            .filter(|solver| solver.status() == V1SolverStatus::Gated)
        {
            let diagnostic = prepare_v1_input_bundle(solver.id, "problem-1", "fingerprint-1")
                .expect_err("gated solver");

            let expected_code = if solver.claim_status() == V1ClaimStatus::Substrate {
                "solver.substrate"
            } else {
                "solver.gated"
            };
            assert_eq!(diagnostic.code, expected_code, "{}", solver.id);
        }
    }

    #[test]
    fn v1_runnable_solvers_prepare_run_and_compare_results() {
        let bundle =
            prepare_v1_input_bundle("mock-fields", "problem-1", "fingerprint-1").expect("bundle");
        let first = run_v1_solver_bundle(&bundle);
        let second = run_v1_solver_bundle(&bundle);
        let comparison = compare_v1_results(&first, &second);

        assert!(comparison.same_problem);
        assert_close(comparison.max_abs_delta, 0.0);
        assert_eq!(first.fields[0].values, second.fields[0].values);
        assert_eq!(first.fields[0].values.len(), 8);
        assert!(
            first.fields[0]
                .values
                .iter()
                .all(|value| (0.0..=1.0).contains(value))
        );
        assert!(
            first.fields[0]
                .values
                .windows(2)
                .any(|pair| pair[0] != pair[1])
        );

        let gray = run_v1_solver_bundle(
            &prepare_v1_input_bundle(
                GRAY_RADIATION_DIFFUSION_SOLVER_ID,
                "problem-1",
                "fingerprint-1",
            )
            .expect("gray bundle"),
        );
        assert_eq!(gray.fields.len(), 1);
        assert_eq!(gray.fields[0].name, "radiation-energy");
        assert_eq!(
            gray.fields[0].values,
            vec![0.20, 0.16, 0.11, 0.07, 0.04, 0.02, 0.01, 0.0]
        );

        let hydro = run_v1_solver_bundle(
            &prepare_v1_input_bundle(EULERIAN_HYDRO_SOLVER_ID, "problem-1", "fingerprint-1")
                .expect("hydro bundle"),
        );
        assert_eq!(
            hydro
                .fields
                .iter()
                .map(|field| field.name.as_str())
                .collect::<Vec<_>>(),
            vec!["density", "pressure"]
        );
        assert_eq!(
            hydro.fields[0].values,
            vec![1.0, 0.95, 0.80, 0.45, 0.20, 0.125]
        );
        assert_eq!(
            hydro.fields[1].values,
            vec![1.0, 0.92, 0.72, 0.38, 0.16, 0.10]
        );
    }

    #[test]
    fn v1_result_comparison_reports_the_largest_field_delta() {
        let left = V1ResultDataset {
            solver_id: "mock-fields".into(),
            problem_id: "problem-1".into(),
            fingerprint: "fingerprint-1".into(),
            fields: vec![V1FieldDataset {
                name: "field".into(),
                values: vec![0.0, 4.0, -3.0],
            }],
            diagnostics: vec![],
        };
        let right = V1ResultDataset {
            fields: vec![V1FieldDataset {
                name: "field".into(),
                values: vec![1.0, 1.5, -4.0],
            }],
            ..left.clone()
        };

        assert_close(compare_v1_results(&left, &right).max_abs_delta, 2.5);
    }

    #[test]
    fn void_problem_escapes() {
        let result = run_photon_smoke(&beam_problem(Material {
            id: "mat-void".to_string(),
            name: "Void".to_string(),
            density: 0.0,
            coefficients: Some(SimplePhotonCoefficients {
                attenuation: 0.0,
                scatter_probability: 0.0,
                absorption_probability: 0.0,
            }),
        }));

        assert!(result.tracks.iter().all(|track| {
            track
                .events
                .last()
                .is_some_and(|event| event.event_type == ParticleEventType::Escape)
        }));
    }

    #[test]
    fn absorbing_material_produces_absorption_events() {
        let result = run_photon_smoke(&beam_problem(Material {
            id: "mat-absorber".to_string(),
            name: "Absorber".to_string(),
            density: 1.0,
            coefficients: Some(SimplePhotonCoefficients {
                attenuation: 100.0,
                scatter_probability: 0.0,
                absorption_probability: 1.0,
            }),
        }));

        assert!(result.tracks.iter().any(|track| {
            track
                .events
                .iter()
                .any(|event| event.event_type == ParticleEventType::Absorb)
        }));
    }

    #[test]
    fn unsupported_features_return_diagnostics() {
        let mut problem = beam_problem(Material {
            id: "mat-water".to_string(),
            name: "Water".to_string(),
            density: 1.0,
            coefficients: None,
        });
        problem.geometry.push(GeometryEntity::Unsupported {
            id: "mesh-1".to_string(),
            name: "Mesh".to_string(),
            kind: "mesh".to_string(),
        });
        problem.sources.push(Source::Unsupported {
            id: "src-surface".to_string(),
            name: "Surface Source".to_string(),
            kind: "surface-source".to_string(),
        });

        let result = run_photon_smoke(&problem);

        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "geometry.kind.unsupported")
        );
        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "source.kind.unsupported")
        );
    }

    #[test]
    fn missing_tables_emit_hybrid_warning() {
        let result = run_photon_smoke(&beam_problem(Material {
            id: "mat-water".to_string(),
            name: "Water".to_string(),
            density: 1.0,
            coefficients: None,
        }));

        assert!(result.provenance.used_simple_coefficients);
        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "physics_data.simple_coefficients")
        );
    }

    #[test]
    fn supported_analytic_geometry_shapes_emit_boundary_crossings() {
        for (entity, expected_id) in [
            (
                GeometryEntity::Box {
                    id: "box-1".to_string(),
                    name: "Box Shield".to_string(),
                    material_id: "mat-void".to_string(),
                    transform: centered_transform(),
                    size: Vec3::new(2.0, 4.0, 4.0),
                },
                "box-1",
            ),
            (
                GeometryEntity::Sphere {
                    id: "sphere-1".to_string(),
                    name: "Sphere Shield".to_string(),
                    material_id: "mat-void".to_string(),
                    transform: centered_transform(),
                    radius: 1.0,
                },
                "sphere-1",
            ),
            (
                GeometryEntity::Cylinder {
                    id: "cylinder-1".to_string(),
                    name: "Cylinder Shield".to_string(),
                    material_id: "mat-void".to_string(),
                    transform: centered_transform(),
                    radius: 1.0,
                    height: 4.0,
                },
                "cylinder-1",
            ),
        ] {
            let result = run_photon_smoke(&single_entity_problem(entity));

            let first_track = result.tracks.first().expect("sampled track");
            assert!(first_track.events.iter().any(|event| {
                event.event_type == ParticleEventType::BoundaryCrossing
                    && event.entity_id.as_deref() == Some(expected_id)
            }));
        }
    }

    #[test]
    fn track_length_tally_scores_supported_entity_path_lengths() {
        let result = run_photon_smoke(&beam_problem(Material {
            id: "mat-void".to_string(),
            name: "Void".to_string(),
            density: 0.0,
            coefficients: Some(SimplePhotonCoefficients {
                attenuation: 0.0,
                scatter_probability: 0.0,
                absorption_probability: 0.0,
            }),
        }));

        assert_eq!(result.tally_deltas.len(), 1);
        assert_eq!(result.tally_deltas[0].tally_id, "tally-1");
        assert_close(result.tally_deltas[0].scores[0], 16.0);
    }

    #[test]
    fn detector_tally_counts_each_matching_history_once() {
        let mut problem = beam_problem(Material {
            id: "mat-void".to_string(),
            name: "Void".to_string(),
            density: 0.0,
            coefficients: Some(SimplePhotonCoefficients {
                attenuation: 0.0,
                scatter_probability: 0.0,
                absorption_probability: 0.0,
            }),
        });
        problem.tallies = vec![Tally {
            id: "detector-1".to_string(),
            name: "Detector".to_string(),
            particle: ParticleKind::Photon,
            kind: TallyKind::DetectorCount,
            target_entity_id: Some("box-1".to_string()),
        }];

        let result = run_photon_smoke(&problem);

        assert_eq!(result.tally_deltas[0].tally_id, "detector-1");
        assert_close(result.tally_deltas[0].scores[0], 8.0);
    }

    fn single_entity_problem(entity: GeometryEntity) -> TransportProblem {
        TransportProblem {
            id: "problem-analytic".to_string(),
            name: "Analytic Geometry Smoke".to_string(),
            geometry: vec![entity],
            materials: vec![Material {
                id: "mat-void".to_string(),
                name: "Void".to_string(),
                density: 0.0,
                coefficients: Some(SimplePhotonCoefficients {
                    attenuation: 0.0,
                    scatter_probability: 0.0,
                    absorption_probability: 0.0,
                }),
            }],
            sources: vec![Source::Beam {
                id: "src-1".to_string(),
                name: "Beam".to_string(),
                particle: ParticleKind::Photon,
                position: Vec3::new(-4.0, 0.0, 0.0),
                direction: Vec3::X,
                energy_mev: 1.0,
                strength: 1.0,
            }],
            tallies: vec![],
            settings: RunSettings {
                histories: 1,
                seed: 11,
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
            (actual - expected).abs() < 1.0e-9,
            "expected {actual} to be within tolerance of {expected}"
        );
    }
}
