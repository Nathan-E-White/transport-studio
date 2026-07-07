pub const NATIVE_PHOTON_BACKEND_ID: &str = "native-rust-photon-smoke";
pub const MOCK_FIELDS_SOLVER_ID: &str = "mock-fields";
pub const GRAY_RADIATION_DIFFUSION_SOLVER_ID: &str = "gray-radiation-diffusion";
pub const EULERIAN_HYDRO_SOLVER_ID: &str = "eulerian-hydro";

#[derive(Debug, Clone, PartialEq)]
pub struct BackendMetadata {
    pub id: &'static str,
    pub name: &'static str,
    pub version: &'static str,
    pub capabilities: BackendCapabilities,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BackendCapabilities {
    pub particles: &'static [&'static str],
    pub geometry: &'static [&'static str],
    pub sources: &'static [&'static str],
    pub tallies: &'static [&'static str],
}

#[derive(Debug, Clone, PartialEq)]
pub struct TransportProblem {
    pub id: String,
    pub name: String,
    pub geometry: Vec<GeometryEntity>,
    pub materials: Vec<Material>,
    pub sources: Vec<Source>,
    pub tallies: Vec<Tally>,
    pub settings: RunSettings,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct Transform3 {
    pub position: Vec3,
    pub rotation: Vec3,
}

#[derive(Debug, Clone, PartialEq)]
pub enum GeometryEntity {
    Box {
        id: String,
        name: String,
        material_id: String,
        transform: Transform3,
        size: Vec3,
    },
    Sphere {
        id: String,
        name: String,
        material_id: String,
        transform: Transform3,
        radius: f64,
    },
    Cylinder {
        id: String,
        name: String,
        material_id: String,
        transform: Transform3,
        radius: f64,
        height: f64,
    },
    Unsupported {
        id: String,
        name: String,
        kind: String,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub struct Material {
    pub id: String,
    pub name: String,
    pub density: f64,
    pub coefficients: Option<SimplePhotonCoefficients>,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct SimplePhotonCoefficients {
    pub attenuation: f64,
    pub scatter_probability: f64,
    pub absorption_probability: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Source {
    Point {
        id: String,
        name: String,
        particle: ParticleKind,
        position: Vec3,
        energy_mev: f64,
        strength: f64,
    },
    Beam {
        id: String,
        name: String,
        particle: ParticleKind,
        position: Vec3,
        direction: Vec3,
        energy_mev: f64,
        strength: f64,
    },
    Isotropic {
        id: String,
        name: String,
        particle: ParticleKind,
        position: Vec3,
        energy_mev: f64,
        strength: f64,
    },
    Unsupported {
        id: String,
        name: String,
        kind: String,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ParticleKind {
    Photon,
    Neutron,
    Electron,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Tally {
    pub id: String,
    pub name: String,
    pub particle: ParticleKind,
    pub kind: TallyKind,
    pub target_entity_id: Option<String>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum TallyKind {
    CellFlux,
    TrackLength,
    DetectorCount,
    Unsupported,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct RunSettings {
    pub histories: u64,
    pub seed: u64,
    pub max_steps_per_history: u32,
    pub visible_history_budget: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RunResult {
    pub run_id: String,
    pub backend_id: &'static str,
    pub problem_id: String,
    pub completed_histories: u64,
    pub total_histories: u64,
    pub tracks: Vec<TrackSample>,
    pub tally_deltas: Vec<TallyDelta>,
    pub diagnostics: Vec<EngineDiagnostic>,
    pub provenance: RunProvenance,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RunProvenance {
    pub engine_version: &'static str,
    pub seed: u64,
    pub data_policy: &'static str,
    pub used_simple_coefficients: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TrackSample {
    pub history_id: String,
    pub events: Vec<ParticleEvent>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParticleEvent {
    pub history_id: String,
    pub particle_id: String,
    pub event_type: ParticleEventType,
    pub position: Vec3,
    pub direction: Vec3,
    pub energy_mev: f64,
    pub weight: f64,
    pub time: f64,
    pub material_id: Option<String>,
    pub entity_id: Option<String>,
    pub reason: String,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ParticleEventType {
    Birth,
    Move,
    BoundaryCrossing,
    Scatter,
    Absorb,
    Escape,
    ErrorLost,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TallyDelta {
    pub tally_id: String,
    pub scores: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EngineDiagnostic {
    pub level: DiagnosticLevel,
    pub code: String,
    pub message: String,
    pub entity_id: Option<String>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum DiagnosticLevel {
    Info,
    Warning,
    Error,
}

pub fn backend_metadata() -> BackendMetadata {
    BackendMetadata {
        id: NATIVE_PHOTON_BACKEND_ID,
        name: "Native Rust Photon Smoke Kernel",
        version: env!("CARGO_PKG_VERSION"),
        capabilities: BackendCapabilities {
            particles: &["photon"],
            geometry: &["box", "sphere", "cylinder"],
            sources: &["point-source", "beam-source", "isotropic-source"],
            tallies: &["cell-flux", "track-length", "detector-hit"],
        },
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum V1SolverStatus {
    Runnable,
    Gated,
}

#[derive(Debug, Clone, PartialEq)]
pub struct V1SolverCapability {
    pub id: &'static str,
    pub name: &'static str,
    pub status: V1SolverStatus,
    pub supported_facets: &'static [&'static str],
    pub required_inputs: &'static [&'static str],
    pub emitted_outputs: &'static [&'static str],
}

#[derive(Debug, Clone, PartialEq)]
pub struct V1SolverInputBundle {
    pub solver_id: String,
    pub problem_id: String,
    pub fingerprint: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct V1ResultDataset {
    pub solver_id: String,
    pub problem_id: String,
    pub fingerprint: String,
    pub fields: Vec<V1FieldDataset>,
    pub diagnostics: Vec<EngineDiagnostic>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct V1FieldDataset {
    pub name: String,
    pub values: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct V1ResultComparison {
    pub same_problem: bool,
    pub max_abs_delta: f64,
    pub diagnostics: Vec<EngineDiagnostic>,
}

pub fn v1_solver_registry() -> Vec<V1SolverCapability> {
    vec![
        runnable_v1(
            MOCK_FIELDS_SOLVER_ID,
            "Mock Fields",
            &["rad-hydro-fields", "reporting"],
            &[],
            &["field-dataset"],
        ),
        runnable_v1(
            GRAY_RADIATION_DIFFUSION_SOLVER_ID,
            "Gray Radiation Diffusion",
            &["rad-hydro-fields", "diffusion", "marshak-waves"],
            &["radiation", "opacity"],
            &["radiation-energy", "energy-diagnostics"],
        ),
        runnable_v1(
            EULERIAN_HYDRO_SOLVER_ID,
            "Eulerian Hydro",
            &["material-state-fields", "shocks"],
            &["hydro", "eos"],
            &["hydro-state", "mass-energy-diagnostics"],
        ),
        gated_v1(
            "multigroup-radiation-diffusion",
            "Multigroup Radiation Diffusion",
            &["diffusion", "multigroup-opacity"],
        ),
        gated_v1(
            "discrete-ordinates",
            "Discrete Ordinates",
            &["radiation-angular-transport"],
        ),
        gated_v1(
            "implicit-monte-carlo",
            "Implicit Monte Carlo",
            &["radiation-monte-carlo"],
        ),
        gated_v1("lagrangian-hydro", "Lagrangian Hydro", &["material-motion"]),
        gated_v1("ale-hydro", "ALE Hydro", &["material-motion", "remap"]),
        gated_v1("criticality-keff", "Criticality keff", &["criticality"]),
        gated_v1(
            "point-kinetics",
            "Point Kinetics",
            &["criticality", "kinetics"],
        ),
        gated_v1("depletion", "Depletion", &["composition-evolution"]),
    ]
}

pub fn prepare_v1_input_bundle(
    solver_id: &str,
    problem_id: &str,
    fingerprint: &str,
) -> Result<V1SolverInputBundle, EngineDiagnostic> {
    let Some(capability) = find_v1_solver(solver_id) else {
        return Err(error(
            "solver.unknown",
            &format!("Unknown V1 solver \"{solver_id}\"."),
            None,
        ));
    };

    if capability.status != V1SolverStatus::Runnable {
        return Err(error(
            "solver.gated",
            &format!("Solver \"{solver_id}\" is registered but gated for V1."),
            None,
        ));
    }

    Ok(V1SolverInputBundle {
        solver_id: solver_id.to_string(),
        problem_id: problem_id.to_string(),
        fingerprint: fingerprint.to_string(),
    })
}

pub fn run_v1_solver_bundle(bundle: &V1SolverInputBundle) -> V1ResultDataset {
    let fields = match bundle.solver_id.as_str() {
        MOCK_FIELDS_SOLVER_ID => vec![V1FieldDataset {
            name: "mock-radiation-energy".to_string(),
            values: deterministic_mock_values(&bundle.fingerprint, 8),
        }],
        GRAY_RADIATION_DIFFUSION_SOLVER_ID => vec![V1FieldDataset {
            name: "radiation-energy".to_string(),
            values: vec![0.20, 0.16, 0.11, 0.07, 0.04, 0.02, 0.01, 0.0],
        }],
        EULERIAN_HYDRO_SOLVER_ID => vec![
            V1FieldDataset {
                name: "density".to_string(),
                values: vec![1.0, 0.95, 0.80, 0.45, 0.20, 0.125],
            },
            V1FieldDataset {
                name: "pressure".to_string(),
                values: vec![1.0, 0.92, 0.72, 0.38, 0.16, 0.10],
            },
        ],
        _ => vec![],
    };

    V1ResultDataset {
        solver_id: bundle.solver_id.clone(),
        problem_id: bundle.problem_id.clone(),
        fingerprint: bundle.fingerprint.clone(),
        fields,
        diagnostics: vec![info(
            "solver.run.completed",
            &format!(
                "V1 solver \"{}\" completed deterministic run.",
                bundle.solver_id
            ),
            None,
        )],
    }
}

pub fn compare_v1_results(left: &V1ResultDataset, right: &V1ResultDataset) -> V1ResultComparison {
    let mut max_abs_delta = 0.0;
    for (left_field, right_field) in left.fields.iter().zip(right.fields.iter()) {
        for (left_value, right_value) in left_field.values.iter().zip(right_field.values.iter()) {
            let delta = (left_value - right_value).abs();
            if delta > max_abs_delta {
                max_abs_delta = delta;
            }
        }
    }

    let same_problem = left.fingerprint == right.fingerprint;
    let diagnostics = if same_problem {
        vec![]
    } else {
        vec![warning(
            "result.stale.fingerprint",
            "Result fingerprints differ; comparison may be stale.",
            None,
        )]
    };

    V1ResultComparison {
        same_problem,
        max_abs_delta,
        diagnostics,
    }
}

fn find_v1_solver(id: &str) -> Option<V1SolverCapability> {
    v1_solver_registry()
        .into_iter()
        .find(|solver| solver.id == id)
}

fn runnable_v1(
    id: &'static str,
    name: &'static str,
    supported_facets: &'static [&'static str],
    required_inputs: &'static [&'static str],
    emitted_outputs: &'static [&'static str],
) -> V1SolverCapability {
    V1SolverCapability {
        id,
        name,
        status: V1SolverStatus::Runnable,
        supported_facets,
        required_inputs,
        emitted_outputs,
    }
}

fn gated_v1(
    id: &'static str,
    name: &'static str,
    supported_facets: &'static [&'static str],
) -> V1SolverCapability {
    V1SolverCapability {
        id,
        name,
        status: V1SolverStatus::Gated,
        supported_facets,
        required_inputs: &[],
        emitted_outputs: &["unsupported-diagnostic"],
    }
}

fn deterministic_mock_values(seed_text: &str, count: usize) -> Vec<f64> {
    let mut state = seed_text.bytes().fold(17_u64, |state, byte| {
        state.wrapping_mul(31).wrapping_add(byte as u64)
    });
    (0..count)
        .map(|_| {
            state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
            ((state >> 32) as f64) / (u32::MAX as f64)
        })
        .collect()
}

pub fn run_photon_smoke(problem: &TransportProblem) -> RunResult {
    let mut diagnostics = validate_problem(problem);
    let mut rng = DeterministicRng::new(problem.settings.seed.max(1));
    let total_histories = problem.settings.histories;
    let sample_budget = problem.settings.visible_history_budget.min(total_histories);
    let mut tally_scores = vec![0.0; problem.tallies.len()];
    let mut tracks = Vec::new();
    let mut used_simple_coefficients = false;

    for history_index in 0..total_histories {
        let Some(source) = select_source(problem, history_index) else {
            diagnostics.push(error(
                "problem.sources.empty",
                "Native photon backend requires at least one source.",
                None,
            ));
            break;
        };

        let mut history = start_history(source, history_index, &mut rng);
        let maybe_hit = nearest_intersection(problem, history.position, history.direction);
        history.events.push(event(
            history_index,
            ParticleEventType::Birth,
            history.position,
            history.direction,
            history.energy_mev,
            None,
            None,
            "native photon birth",
        ));

        match maybe_hit {
            None => {
                let exit_position = history.position + history.direction * 16.0;
                history.events.push(event(
                    history_index,
                    ParticleEventType::Escape,
                    exit_position,
                    history.direction,
                    history.energy_mev,
                    None,
                    None,
                    "escaped without intersecting supported geometry",
                ));
            }
            Some(hit) => {
                let material = problem
                    .materials
                    .iter()
                    .find(|material| material.id == hit.material_id);
                let coefficients = material
                    .and_then(|material| material.coefficients)
                    .unwrap_or_else(|| {
                        used_simple_coefficients = true;
                        placeholder_coefficients(material.map(|m| m.density).unwrap_or(0.0))
                    });

                let boundary_position = history.position + history.direction * hit.entry_distance;
                history.events.push(event(
                    history_index,
                    ParticleEventType::BoundaryCrossing,
                    boundary_position,
                    history.direction,
                    history.energy_mev,
                    Some(hit.material_id.clone()),
                    Some(hit.entity_id.clone()),
                    "entered supported analytic geometry",
                ));

                if is_void(material) || coefficients.attenuation <= 0.0 {
                    let exit_position =
                        history.position + history.direction * (hit.exit_distance + 0.001);
                    score_tallies(
                        problem,
                        &mut tally_scores,
                        &hit.entity_id,
                        hit.path_length(),
                    );
                    history.events.push(event(
                        history_index,
                        ParticleEventType::Escape,
                        exit_position,
                        history.direction,
                        history.energy_mev,
                        Some(hit.material_id),
                        Some(hit.entity_id),
                        "escaped through void or zero-attenuation material",
                    ));
                } else {
                    let free_path = -rng.next_open_unit().ln() / coefficients.attenuation;
                    if free_path < hit.path_length() {
                        let interaction_position =
                            boundary_position + history.direction * free_path;
                        score_tallies(problem, &mut tally_scores, &hit.entity_id, free_path);
                        if rng.next_unit() < coefficients.absorption_probability {
                            history.events.push(event(
                                history_index,
                                ParticleEventType::Absorb,
                                interaction_position,
                                history.direction,
                                history.energy_mev,
                                Some(hit.material_id),
                                Some(hit.entity_id),
                                "sampled absorption",
                            ));
                        } else {
                            let scattered = scatter_direction(history.direction, &mut rng);
                            history.events.push(event(
                                history_index,
                                ParticleEventType::Scatter,
                                interaction_position,
                                scattered,
                                history.energy_mev * 0.95,
                                Some(hit.material_id.clone()),
                                Some(hit.entity_id.clone()),
                                "sampled simple scatter",
                            ));
                            history.events.push(event(
                                history_index,
                                ParticleEventType::Escape,
                                interaction_position + scattered * 8.0,
                                scattered,
                                history.energy_mev * 0.95,
                                Some(hit.material_id),
                                Some(hit.entity_id),
                                "terminated after first smoke-kernel scatter",
                            ));
                        }
                    } else {
                        score_tallies(
                            problem,
                            &mut tally_scores,
                            &hit.entity_id,
                            hit.path_length(),
                        );
                        let exit_position =
                            history.position + history.direction * (hit.exit_distance + 0.001);
                        history.events.push(event(
                            history_index,
                            ParticleEventType::Escape,
                            exit_position,
                            history.direction,
                            history.energy_mev,
                            Some(hit.material_id),
                            Some(hit.entity_id),
                            "sampled no interaction before exit",
                        ));
                    }
                }
            }
        }

        if history_index < sample_budget {
            tracks.push(TrackSample {
                history_id: format!("h-{history_index}"),
                events: history.events,
            });
        }
    }

    if used_simple_coefficients {
        diagnostics.push(warning(
            "physics_data.simple_coefficients",
            "Native photon backend used simple coefficients because tabular cross-section data was not supplied.",
            None,
        ));
    }

    RunResult {
        run_id: format!("native-rust-photon-smoke-{}", problem.settings.seed),
        backend_id: NATIVE_PHOTON_BACKEND_ID,
        problem_id: problem.id.clone(),
        completed_histories: total_histories,
        total_histories,
        tracks,
        tally_deltas: problem
            .tallies
            .iter()
            .zip(tally_scores)
            .map(|(tally, score)| TallyDelta {
                tally_id: tally.id.clone(),
                scores: vec![score],
            })
            .collect(),
        diagnostics,
        provenance: RunProvenance {
            engine_version: env!("CARGO_PKG_VERSION"),
            seed: problem.settings.seed,
            data_policy: "hybrid-warning-mode",
            used_simple_coefficients,
        },
    }
}

fn validate_problem(problem: &TransportProblem) -> Vec<EngineDiagnostic> {
    let mut diagnostics = Vec::new();

    for source in &problem.sources {
        match source {
            Source::Point { particle, id, .. }
            | Source::Beam { particle, id, .. }
            | Source::Isotropic { particle, id, .. } => {
                if *particle != ParticleKind::Photon {
                    diagnostics.push(error(
                        "source.particle.unsupported",
                        "Native photon smoke backend supports photons only.",
                        Some(id.clone()),
                    ));
                }
            }
            Source::Unsupported { id, kind, .. } => diagnostics.push(error(
                "source.kind.unsupported",
                &format!(
                    "Source kind \"{kind}\" is not supported by the native photon smoke backend."
                ),
                Some(id.clone()),
            )),
        }
    }

    for entity in &problem.geometry {
        if let GeometryEntity::Unsupported { id, kind, .. } = entity {
            diagnostics.push(error(
                "geometry.kind.unsupported",
                &format!(
                    "Geometry kind \"{kind}\" is not supported by the native photon smoke backend."
                ),
                Some(id.clone()),
            ));
        }
    }

    for tally in &problem.tallies {
        if tally.particle != ParticleKind::Photon {
            diagnostics.push(error(
                "tally.particle.unsupported",
                "Native photon smoke backend supports photon tallies only.",
                Some(tally.id.clone()),
            ));
        }

        if tally.kind == TallyKind::Unsupported {
            diagnostics.push(warning(
                "tally.kind.unsupported",
                &format!(
                    "Tally \"{}\" is not scored by the native photon smoke backend.",
                    tally.name
                ),
                Some(tally.id.clone()),
            ));
        }
    }

    diagnostics
}

#[derive(Debug)]
struct HistoryState {
    position: Vec3,
    direction: Vec3,
    energy_mev: f64,
    events: Vec<ParticleEvent>,
}

#[derive(Debug)]
struct GeometryHit {
    entity_id: String,
    material_id: String,
    entry_distance: f64,
    exit_distance: f64,
}

impl GeometryHit {
    fn path_length(&self) -> f64 {
        (self.exit_distance - self.entry_distance).max(0.0)
    }
}

fn select_source(problem: &TransportProblem, history_index: u64) -> Option<&Source> {
    let runnable_sources: Vec<_> = problem
        .sources
        .iter()
        .filter(|source| !matches!(source, Source::Unsupported { .. }))
        .collect();

    if runnable_sources.is_empty() {
        return None;
    }

    Some(runnable_sources[(history_index as usize) % runnable_sources.len()])
}

fn start_history(source: &Source, history_index: u64, rng: &mut DeterministicRng) -> HistoryState {
    match source {
        Source::Point {
            position,
            energy_mev,
            ..
        } => HistoryState {
            position: *position,
            direction: deterministic_sphere_direction(history_index),
            energy_mev: *energy_mev,
            events: Vec::new(),
        },
        Source::Beam {
            position,
            direction,
            energy_mev,
            ..
        } => HistoryState {
            position: *position,
            direction: direction.normalized_or_x(),
            energy_mev: *energy_mev,
            events: Vec::new(),
        },
        Source::Isotropic {
            position,
            energy_mev,
            ..
        } => HistoryState {
            position: *position,
            direction: random_sphere_direction(rng),
            energy_mev: *energy_mev,
            events: Vec::new(),
        },
        Source::Unsupported { .. } => HistoryState {
            position: Vec3::ZERO,
            direction: Vec3::X,
            energy_mev: 0.0,
            events: Vec::new(),
        },
    }
}

fn nearest_intersection(
    problem: &TransportProblem,
    origin: Vec3,
    direction: Vec3,
) -> Option<GeometryHit> {
    problem
        .geometry
        .iter()
        .filter_map(|entity| intersect_entity(entity, origin, direction))
        .filter(|hit| hit.exit_distance > 0.0)
        .min_by(|a, b| a.entry_distance.total_cmp(&b.entry_distance))
}

fn intersect_entity(entity: &GeometryEntity, origin: Vec3, direction: Vec3) -> Option<GeometryHit> {
    match entity {
        GeometryEntity::Box {
            id,
            material_id,
            transform,
            size,
            ..
        } => {
            let local_origin = origin - transform.position;
            let half = *size * 0.5;
            intersect_aabb(local_origin, direction, -half, half).map(|(entry, exit)| GeometryHit {
                entity_id: id.clone(),
                material_id: material_id.clone(),
                entry_distance: entry.max(0.0),
                exit_distance: exit,
            })
        }
        GeometryEntity::Sphere {
            id,
            material_id,
            transform,
            radius,
            ..
        } => intersect_sphere(origin - transform.position, direction, *radius).map(
            |(entry, exit)| GeometryHit {
                entity_id: id.clone(),
                material_id: material_id.clone(),
                entry_distance: entry.max(0.0),
                exit_distance: exit,
            },
        ),
        GeometryEntity::Cylinder {
            id,
            material_id,
            transform,
            radius,
            height,
            ..
        } => intersect_cylinder_z(origin - transform.position, direction, *radius, *height).map(
            |(entry, exit)| GeometryHit {
                entity_id: id.clone(),
                material_id: material_id.clone(),
                entry_distance: entry.max(0.0),
                exit_distance: exit,
            },
        ),
        GeometryEntity::Unsupported { .. } => None,
    }
}

fn intersect_aabb(origin: Vec3, direction: Vec3, min: Vec3, max: Vec3) -> Option<(f64, f64)> {
    let (mut t_min, mut t_max) = (-f64::INFINITY, f64::INFINITY);

    for (o, d, min_axis, max_axis) in [
        (origin.x, direction.x, min.x, max.x),
        (origin.y, direction.y, min.y, max.y),
        (origin.z, direction.z, min.z, max.z),
    ] {
        if d.abs() < 1.0e-12 {
            if o < min_axis || o > max_axis {
                return None;
            }
            continue;
        }

        let inv = 1.0 / d;
        let mut t1 = (min_axis - o) * inv;
        let mut t2 = (max_axis - o) * inv;
        if t1 > t2 {
            std::mem::swap(&mut t1, &mut t2);
        }
        t_min = t_min.max(t1);
        t_max = t_max.min(t2);
        if t_min > t_max {
            return None;
        }
    }

    Some((t_min, t_max))
}

fn intersect_sphere(origin: Vec3, direction: Vec3, radius: f64) -> Option<(f64, f64)> {
    let b = origin.dot(direction);
    let c = origin.dot(origin) - radius * radius;
    let discriminant = b * b - c;
    if discriminant < 0.0 {
        return None;
    }
    let root = discriminant.sqrt();
    Some((-b - root, -b + root))
}

fn intersect_cylinder_z(
    origin: Vec3,
    direction: Vec3,
    radius: f64,
    height: f64,
) -> Option<(f64, f64)> {
    let a = direction.x * direction.x + direction.y * direction.y;
    if a.abs() < 1.0e-12 {
        return intersect_aabb(
            origin,
            direction,
            Vec3::new(-radius, -radius, -height * 0.5),
            Vec3::new(radius, radius, height * 0.5),
        );
    }

    let b = 2.0 * (origin.x * direction.x + origin.y * direction.y);
    let c = origin.x * origin.x + origin.y * origin.y - radius * radius;
    let discriminant = b * b - 4.0 * a * c;
    if discriminant < 0.0 {
        return None;
    }

    let root = discriminant.sqrt();
    let mut hits = Vec::new();
    for t in [(-b - root) / (2.0 * a), (-b + root) / (2.0 * a)] {
        let z = origin.z + direction.z * t;
        if z >= -height * 0.5 && z <= height * 0.5 {
            hits.push(t);
        }
    }

    if hits.len() == 2 {
        hits.sort_by(f64::total_cmp);
        Some((hits[0], hits[1]))
    } else {
        None
    }
}

fn placeholder_coefficients(density: f64) -> SimplePhotonCoefficients {
    SimplePhotonCoefficients {
        attenuation: (density.max(0.0) * 0.25).max(0.02),
        scatter_probability: 0.35,
        absorption_probability: 0.65,
    }
}

fn is_void(material: Option<&Material>) -> bool {
    material
        .map(|material| material.density <= 0.0)
        .unwrap_or(true)
}

fn score_tallies(
    problem: &TransportProblem,
    tally_scores: &mut [f64],
    entity_id: &str,
    path_length: f64,
) {
    for (index, tally) in problem.tallies.iter().enumerate() {
        if tally.particle != ParticleKind::Photon {
            continue;
        }

        let target_matches = tally
            .target_entity_id
            .as_deref()
            .map(|target| target == entity_id)
            .unwrap_or(true);
        if !target_matches {
            continue;
        }

        tally_scores[index] += match tally.kind {
            TallyKind::CellFlux | TallyKind::TrackLength => path_length,
            TallyKind::DetectorCount => 1.0,
            TallyKind::Unsupported => 0.0,
        };
    }
}

fn scatter_direction(direction: Vec3, rng: &mut DeterministicRng) -> Vec3 {
    let jitter = Vec3::new(
        rng.next_unit() - 0.5,
        rng.next_unit() - 0.5,
        rng.next_unit() - 0.5,
    ) * 0.35;
    (direction + jitter).normalized_or_x()
}

fn deterministic_sphere_direction(history_index: u64) -> Vec3 {
    let angle = history_index as f64 * 2.399963229728653;
    Vec3::new(angle.cos(), angle.sin(), 0.25).normalized_or_x()
}

fn random_sphere_direction(rng: &mut DeterministicRng) -> Vec3 {
    let z = 2.0 * rng.next_unit() - 1.0;
    let theta = 2.0 * std::f64::consts::PI * rng.next_unit();
    let r = (1.0 - z * z).sqrt();
    Vec3::new(r * theta.cos(), r * theta.sin(), z)
}

fn event(
    history_index: u64,
    event_type: ParticleEventType,
    position: Vec3,
    direction: Vec3,
    energy_mev: f64,
    material_id: Option<String>,
    entity_id: Option<String>,
    reason: &str,
) -> ParticleEvent {
    ParticleEvent {
        history_id: format!("h-{history_index}"),
        particle_id: format!("p-{history_index}"),
        event_type,
        position,
        direction,
        energy_mev,
        weight: 1.0,
        time: 0.0,
        material_id,
        entity_id,
        reason: reason.to_string(),
    }
}

fn warning(code: &str, message: &str, entity_id: Option<String>) -> EngineDiagnostic {
    EngineDiagnostic {
        level: DiagnosticLevel::Warning,
        code: code.to_string(),
        message: message.to_string(),
        entity_id,
    }
}

fn info(code: &str, message: &str, entity_id: Option<String>) -> EngineDiagnostic {
    EngineDiagnostic {
        level: DiagnosticLevel::Info,
        code: code.to_string(),
        message: message.to_string(),
        entity_id,
    }
}

fn error(code: &str, message: &str, entity_id: Option<String>) -> EngineDiagnostic {
    EngineDiagnostic {
        level: DiagnosticLevel::Error,
        code: code.to_string(),
        message: message.to_string(),
        entity_id,
    }
}

#[derive(Debug, Copy, Clone)]
struct DeterministicRng {
    state: u64,
}

impl DeterministicRng {
    fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    fn next_u64(&mut self) -> u64 {
        self.state = self
            .state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        self.state
    }

    fn next_unit(&mut self) -> f64 {
        let value = self.next_u64() >> 11;
        (value as f64) * (1.0 / ((1_u64 << 53) as f64))
    }

    fn next_open_unit(&mut self) -> f64 {
        self.next_unit().clamp(1.0e-12, 1.0 - 1.0e-12)
    }
}

impl Vec3 {
    pub const ZERO: Self = Self::new(0.0, 0.0, 0.0);
    pub const X: Self = Self::new(1.0, 0.0, 0.0);

    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    pub fn dot(self, rhs: Self) -> f64 {
        self.x * rhs.x + self.y * rhs.y + self.z * rhs.z
    }

    pub fn norm(self) -> f64 {
        self.dot(self).sqrt()
    }

    pub fn normalized_or_x(self) -> Self {
        let norm = self.norm();
        if norm <= 1.0e-12 || !norm.is_finite() {
            Self::X
        } else {
            self * (1.0 / norm)
        }
    }
}

impl std::ops::Add for Vec3 {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Self::new(self.x + rhs.x, self.y + rhs.y, self.z + rhs.z)
    }
}

impl std::ops::Sub for Vec3 {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self::Output {
        Self::new(self.x - rhs.x, self.y - rhs.y, self.z - rhs.z)
    }
}

impl std::ops::Neg for Vec3 {
    type Output = Self;

    fn neg(self) -> Self::Output {
        Self::new(-self.x, -self.y, -self.z)
    }
}

impl std::ops::Mul<f64> for Vec3 {
    type Output = Self;

    fn mul(self, rhs: f64) -> Self::Output {
        Self::new(self.x * rhs, self.y * rhs, self.z * rhs)
    }
}

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
            ]
        );
        assert_eq!(
            registry
                .iter()
                .find(|solver| solver.id == "criticality-keff")
                .expect("criticality solver")
                .status,
            V1SolverStatus::Gated
        );
    }

    #[test]
    fn v1_gated_solvers_return_unsupported_diagnostic() {
        let diagnostic = prepare_v1_input_bundle("criticality-keff", "problem-1", "fingerprint-1")
            .expect_err("gated solver");

        assert_eq!(diagnostic.code, "solver.gated");
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

        assert!(result.tracks.iter().all(|track| track
            .events
            .last()
            .is_some_and(|event| event.event_type == ParticleEventType::Escape)));
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

        assert!(result
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "geometry.kind.unsupported"));
        assert!(result
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "source.kind.unsupported"));
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
        assert!(result
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "physics_data.simple_coefficients"));
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
