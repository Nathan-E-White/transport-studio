use crate::diagnostics::{
    EngineDiagnostic, ParticleEvent, ParticleEventType, RunProvenance, RunResult, TallyDelta,
    TrackSample, error, warning,
};
use crate::geometry::{GeometryEntity, Vec3, nearest_intersection};
pub const NATIVE_PHOTON_BACKEND_ID: &str = "native-rust-photon-smoke";
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
        let maybe_hit =
            nearest_intersection(&problem.geometry, history.position, history.direction);
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
