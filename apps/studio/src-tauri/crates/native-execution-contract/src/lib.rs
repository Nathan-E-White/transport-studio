//! Runtime-neutral Native Execution Contract.
//!
//! The GR/spacetime primitives that used to live in this app module are
//! preserved in the `spacetime-physics` crate. The Monte Carlo runtime lives in
//! `transport-engine`. This module deliberately stays thin so the Tauri host is
//! an adapter instead of the physics implementation.

pub const NATIVE_EXECUTION_CONTRACT_VERSION: &str = "2.0.0";

use serde::{Deserialize, Serialize};
use transport_engine::{
    DiagnosticLevel, EngineDiagnostic, GeometryEntity, ParticleEvent, ParticleEventType,
    ParticleKind, RunSettings, Source, Tally, TallyDelta, TallyKind, TrackSample, Transform3,
    TransportProblem, Vec3,
};

pub fn execute_native_request(request: serde_json::Value) -> NativeExecutionResponse {
    let run_id = request
        .get("runSessionId")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("invalid-native-session")
        .to_string();
    let received_version = request
        .get("contractVersion")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("missing");
    if received_version != NATIVE_EXECUTION_CONTRACT_VERSION {
        return failure_response(
            run_id,
            "native.contract.version_mismatch",
            format!(
                "Unsupported native execution contract version '{}'; expected '{}'.",
                received_version, NATIVE_EXECUTION_CONTRACT_VERSION
            ),
        );
    }

    let request: NativeExecutionRequest = match serde_json::from_value(request) {
        Ok(request) => request,
        Err(error) => {
            return failure_response(
                run_id,
                "native.contract.invalid_request",
                format!("Native execution request envelope is invalid: {error}"),
            );
        }
    };
    let problem_dto: TransportProblemDto = match serde_json::from_value(request.problem) {
        Ok(problem) => problem,
        Err(error) => {
            return failure_response(
                request.run_session_id,
                "native.contract.invalid_request",
                format!("Native execution request payload is invalid: {error}"),
            );
        }
    };
    let run_id = request.run_session_id;
    let problem_id = problem_dto.id.clone();
    let seed = problem_dto.settings.seed;
    let problem = TransportProblem::from(problem_dto);
    let result = transport_engine::run_photon_smoke(&problem);

    let warnings: Vec<String> = result
        .provenance
        .used_simple_coefficients
        .then_some("simple coefficient smoke kernel".to_string())
        .into_iter()
        .collect();
    let diagnostics: Vec<BackendDiagnosticDto> = result
        .diagnostics
        .into_iter()
        .map(|diagnostic| {
            let mut diagnostic = BackendDiagnosticDto::from(diagnostic);
            diagnostic.problem_id = Some(problem_id.clone());
            diagnostic.run_id = Some(run_id.clone());
            diagnostic
        })
        .collect();
    let has_execution_error = diagnostics.iter().any(|diagnostic| diagnostic.level == "error");
    let tracks: Vec<TrackSampleDto> = result.tracks.into_iter().map(TrackSampleDto::from).collect();
    let tally_deltas: Vec<TallyDeltaDto> = result
        .tally_deltas
        .into_iter()
        .map(TallyDeltaDto::from)
        .collect();

    let mut events = vec![
        NativeExecutionEventDto::BackendMetadata {
            metadata: BackendMetadataDto::native_photon(),
        },
        NativeExecutionEventDto::ProblemAccepted {
            run_id: run_id.clone(),
            problem_id: problem_id.clone(),
            diagnostics: Vec::new(),
        },
        NativeExecutionEventDto::RunStarted {
            run_id: run_id.clone(),
            problem_id: problem_id.clone(),
            provenance: RunProvenanceDto {
                backend_id: transport_engine::NATIVE_PHOTON_BACKEND_ID.to_string(),
                backend_version: env!("CARGO_PKG_VERSION").to_string(),
                problem_id: problem_id.clone(),
                seed,
                data_policy: "hybrid-warning-mode".to_string(),
                warnings,
            },
        },
        NativeExecutionEventDto::RunProgress {
            run_id: run_id.clone(),
            completed_histories: result.completed_histories,
            total_histories: result.total_histories,
        },
        NativeExecutionEventDto::TrackSamples {
            run_id: run_id.clone(),
            samples: tracks.clone(),
        },
    ];
    events.extend(tally_deltas.iter().cloned().map(|delta| {
        NativeExecutionEventDto::TallyDelta {
            run_id: run_id.clone(),
            delta,
        }
    }));
    events.extend(diagnostics.iter().cloned().map(|diagnostic| {
        NativeExecutionEventDto::Diagnostic {
            run_id: run_id.clone(),
            diagnostic,
        }
    }));
    if has_execution_error {
        events.push(NativeExecutionEventDto::RunFailed {
            run_id: run_id.clone(),
            diagnostic: BackendDiagnosticDto::error(
                "native.execution.failed",
                "Native photon execution reported one or more error diagnostics.",
                Some(problem_id),
                run_id,
            ),
        });
    } else {
        events.push(NativeExecutionEventDto::RunCompleted {
            run_id,
            summary: RunSummaryDto {
                completed_histories: result.completed_histories,
                total_histories: result.total_histories,
                sampled_track_count: tracks.len(),
                tally_count: tally_deltas.len(),
                diagnostics,
            },
        });
    }

    NativeExecutionResponse {
        contract_version: NATIVE_EXECUTION_CONTRACT_VERSION.to_string(),
        events,
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeExecutionRequest {
    contract_version: String,
    run_session_id: String,
    problem: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeExecutionResponse {
    contract_version: String,
    events: Vec<NativeExecutionEventDto>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransportProblemDto {
    id: String,
    name: String,
    geometry: TransportGeometryDto,
    materials: Vec<MaterialDto>,
    sources: Vec<SourceDto>,
    tallies: Vec<TallyDto>,
    settings: RunSettingsDto,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransportGeometryDto {
    entities: Vec<GeometryEntityDto>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
enum GeometryEntityDto {
    Box {
        id: String,
        name: String,
        material_id: String,
        transform: Transform3Dto,
        size: Vec3Dto,
    },
    Sphere {
        id: String,
        name: String,
        material_id: String,
        transform: Transform3Dto,
        radius: f64,
    },
    Cylinder {
        id: String,
        name: String,
        material_id: String,
        transform: Transform3Dto,
        radius: f64,
        height: f64,
    },
    Mesh {
        id: String,
        name: String,
    },
    VoxelRegion {
        id: String,
        name: String,
    },
    ImplicitRegion {
        id: String,
        name: String,
    },
    CsgRegion {
        id: String,
        name: String,
    },
}

#[derive(Debug, Copy, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Transform3Dto {
    position: Vec3Dto,
    rotation: Vec3Dto,
}

#[derive(Debug, Copy, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Vec3Dto {
    x: f64,
    y: f64,
    z: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MaterialDto {
    id: String,
    name: String,
    density: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
enum SourceDto {
    PointSource {
        id: String,
        name: String,
        particle: ParticleKindDto,
        position: Vec3Dto,
        #[serde(alias = "energyMeV")]
        energy_mev: f64,
        strength: f64,
    },
    BeamSource {
        id: String,
        name: String,
        particle: ParticleKindDto,
        position: Vec3Dto,
        direction: Vec3Dto,
        #[serde(alias = "energyMeV")]
        energy_mev: f64,
        strength: f64,
    },
    IsotropicSource {
        id: String,
        name: String,
        particle: ParticleKindDto,
        position: Vec3Dto,
        #[serde(alias = "energyMeV")]
        energy_mev: f64,
        strength: f64,
    },
    SurfaceSource {
        id: String,
        name: String,
    },
    RegionSource {
        id: String,
        name: String,
    },
}

#[derive(Debug, Copy, Clone, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum ParticleKindDto {
    Photon,
    Neutron,
    Electron,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
enum TallyDto {
    CellFlux {
        id: String,
        name: String,
        particle: ParticleKindDto,
        entity_id: String,
    },
    TrackLength {
        id: String,
        name: String,
        particle: ParticleKindDto,
        entity_id: String,
    },
    SurfaceCurrent {
        id: String,
        name: String,
        particle: ParticleKindDto,
    },
    PulseHeight {
        id: String,
        name: String,
        particle: ParticleKindDto,
        entity_id: String,
    },
    SurfaceFlux {
        id: String,
        name: String,
        particle: ParticleKindDto,
    },
    RegionDose {
        id: String,
        name: String,
        particle: ParticleKindDto,
    },
}

#[derive(Debug, Copy, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunSettingsDto {
    histories: u64,
    seed: u64,
    max_steps_per_history: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrackSampleDto {
    history_id: String,
    events: Vec<ParticleEventDto>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ParticleEventDto {
    history_id: String,
    particle_id: String,
    #[serde(rename = "type")]
    event_type: String,
    position: Vec3Dto,
    direction: Vec3Dto,
    #[serde(rename = "energyMeV")]
    energy_mev: f64,
    weight: f64,
    time: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    material_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    entity_id: Option<String>,
    reason: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TallyDeltaDto {
    tally_id: String,
    scores: Vec<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendDiagnosticDto {
    level: String,
    code: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    problem_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    run_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum NativeExecutionEventDto {
    BackendMetadata {
        metadata: BackendMetadataDto,
    },
    ProblemAccepted {
        run_id: String,
        problem_id: String,
        diagnostics: Vec<BackendDiagnosticDto>,
    },
    RunStarted {
        run_id: String,
        problem_id: String,
        provenance: RunProvenanceDto,
    },
    RunProgress {
        run_id: String,
        completed_histories: u64,
        total_histories: u64,
    },
    TrackSamples {
        run_id: String,
        samples: Vec<TrackSampleDto>,
    },
    TallyDelta {
        run_id: String,
        delta: TallyDeltaDto,
    },
    Diagnostic {
        run_id: String,
        diagnostic: BackendDiagnosticDto,
    },
    RunCompleted {
        run_id: String,
        summary: RunSummaryDto,
    },
    RunFailed {
        run_id: String,
        diagnostic: BackendDiagnosticDto,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendMetadataDto {
    id: String,
    name: String,
    version: String,
    description: String,
    capabilities: BackendCapabilitiesDto,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendCapabilitiesDto {
    particles: Vec<String>,
    geometry: Vec<String>,
    sources: Vec<String>,
    tallies: Vec<String>,
    lifecycle: Vec<String>,
    data_policy: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunProvenanceDto {
    backend_id: String,
    backend_version: String,
    problem_id: String,
    seed: u64,
    data_policy: String,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunSummaryDto {
    completed_histories: u64,
    total_histories: u64,
    sampled_track_count: usize,
    tally_count: usize,
    diagnostics: Vec<BackendDiagnosticDto>,
}

impl BackendMetadataDto {
    fn native_photon() -> Self {
        Self {
            id: transport_engine::NATIVE_PHOTON_BACKEND_ID.to_string(),
            name: "Native Rust Photon Smoke Kernel".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            description: "Deterministic native photon MC smoke backend with hybrid warning-mode material data.".to_string(),
            capabilities: BackendCapabilitiesDto {
                particles: vec!["photon".to_string()],
                geometry: ["box", "sphere", "cylinder"].map(str::to_string).to_vec(),
                sources: ["point-source", "beam-source", "isotropic-source"]
                    .map(str::to_string)
                    .to_vec(),
                tallies: ["cell-flux", "track-length", "detector-hit"]
                    .map(str::to_string)
                    .to_vec(),
                lifecycle: ["submit", "start"].map(str::to_string).to_vec(),
                data_policy: "hybrid-warning-mode".to_string(),
            },
        }
    }
}

impl BackendDiagnosticDto {
    fn error(
        code: &str,
        message: impl Into<String>,
        problem_id: Option<String>,
        run_id: String,
    ) -> Self {
        Self {
            level: "error".to_string(),
            code: code.to_string(),
            message: message.into(),
            entity_id: None,
            problem_id,
            run_id: Some(run_id),
        }
    }
}

fn failure_response(run_id: String, code: &str, message: impl Into<String>) -> NativeExecutionResponse {
    NativeExecutionResponse {
        contract_version: NATIVE_EXECUTION_CONTRACT_VERSION.to_string(),
        events: vec![NativeExecutionEventDto::RunFailed {
            diagnostic: BackendDiagnosticDto::error(code, message, None, run_id.clone()),
            run_id,
        }],
    }
}

impl From<TransportProblemDto> for TransportProblem {
    fn from(problem: TransportProblemDto) -> Self {
        Self {
            id: problem.id,
            name: problem.name,
            geometry: problem
                .geometry
                .entities
                .into_iter()
                .map(GeometryEntity::from)
                .collect(),
            materials: problem
                .materials
                .into_iter()
                .map(transport_engine::Material::from)
                .collect(),
            sources: problem.sources.into_iter().map(Source::from).collect(),
            tallies: problem.tallies.into_iter().map(Tally::from).collect(),
            settings: RunSettings {
                histories: problem.settings.histories,
                seed: problem.settings.seed,
                max_steps_per_history: problem.settings.max_steps_per_history.unwrap_or(64),
                visible_history_budget: problem.settings.histories.min(128),
            },
        }
    }
}

impl From<GeometryEntityDto> for GeometryEntity {
    fn from(entity: GeometryEntityDto) -> Self {
        match entity {
            GeometryEntityDto::Box {
                id,
                name,
                material_id,
                transform,
                size,
            } => GeometryEntity::Box {
                id,
                name,
                material_id,
                transform: transform.into(),
                size: size.into(),
            },
            GeometryEntityDto::Sphere {
                id,
                name,
                material_id,
                transform,
                radius,
            } => GeometryEntity::Sphere {
                id,
                name,
                material_id,
                transform: transform.into(),
                radius,
            },
            GeometryEntityDto::Cylinder {
                id,
                name,
                material_id,
                transform,
                radius,
                height,
            } => GeometryEntity::Cylinder {
                id,
                name,
                material_id,
                transform: transform.into(),
                radius,
                height,
            },
            GeometryEntityDto::Mesh { id, name } => GeometryEntity::Unsupported {
                id,
                name,
                kind: "mesh".to_string(),
            },
            GeometryEntityDto::VoxelRegion { id, name } => GeometryEntity::Unsupported {
                id,
                name,
                kind: "voxel-region".to_string(),
            },
            GeometryEntityDto::ImplicitRegion { id, name } => GeometryEntity::Unsupported {
                id,
                name,
                kind: "implicit-region".to_string(),
            },
            GeometryEntityDto::CsgRegion { id, name } => GeometryEntity::Unsupported {
                id,
                name,
                kind: "csg-region".to_string(),
            },
        }
    }
}

impl From<MaterialDto> for transport_engine::Material {
    fn from(material: MaterialDto) -> Self {
        Self {
            id: material.id,
            name: material.name,
            density: material.density,
            coefficients: None,
        }
    }
}

impl From<SourceDto> for Source {
    fn from(source: SourceDto) -> Self {
        match source {
            SourceDto::PointSource {
                id,
                name,
                particle,
                position,
                energy_mev,
                strength,
            } => Source::Point {
                id,
                name,
                particle: particle.into(),
                position: position.into(),
                energy_mev,
                strength,
            },
            SourceDto::BeamSource {
                id,
                name,
                particle,
                position,
                direction,
                energy_mev,
                strength,
            } => Source::Beam {
                id,
                name,
                particle: particle.into(),
                position: position.into(),
                direction: direction.into(),
                energy_mev,
                strength,
            },
            SourceDto::IsotropicSource {
                id,
                name,
                particle,
                position,
                energy_mev,
                strength,
            } => Source::Isotropic {
                id,
                name,
                particle: particle.into(),
                position: position.into(),
                energy_mev,
                strength,
            },
            SourceDto::SurfaceSource { id, name } => Source::Unsupported {
                id,
                name,
                kind: "surface-source".to_string(),
            },
            SourceDto::RegionSource { id, name } => Source::Unsupported {
                id,
                name,
                kind: "region-source".to_string(),
            },
        }
    }
}

impl From<TallyDto> for Tally {
    fn from(tally: TallyDto) -> Self {
        match tally {
            TallyDto::CellFlux {
                id,
                name,
                particle,
                entity_id,
            } => Tally {
                id,
                name,
                particle: particle.into(),
                kind: TallyKind::CellFlux,
                target_entity_id: Some(entity_id),
            },
            TallyDto::TrackLength {
                id,
                name,
                particle,
                entity_id,
            }
            | TallyDto::PulseHeight {
                id,
                name,
                particle,
                entity_id,
            } => Tally {
                id,
                name,
                particle: particle.into(),
                kind: TallyKind::TrackLength,
                target_entity_id: Some(entity_id),
            },
            TallyDto::SurfaceCurrent { id, name, particle }
            | TallyDto::SurfaceFlux { id, name, particle }
            | TallyDto::RegionDose { id, name, particle } => Tally {
                id,
                name,
                particle: particle.into(),
                kind: TallyKind::Unsupported,
                target_entity_id: None,
            },
        }
    }
}

impl From<ParticleKindDto> for ParticleKind {
    fn from(particle: ParticleKindDto) -> Self {
        match particle {
            ParticleKindDto::Photon => ParticleKind::Photon,
            ParticleKindDto::Neutron => ParticleKind::Neutron,
            ParticleKindDto::Electron => ParticleKind::Electron,
        }
    }
}

impl From<Transform3Dto> for Transform3 {
    fn from(transform: Transform3Dto) -> Self {
        Self {
            position: transform.position.into(),
            rotation: transform.rotation.into(),
        }
    }
}

impl From<Vec3Dto> for Vec3 {
    fn from(value: Vec3Dto) -> Self {
        Self {
            x: value.x,
            y: value.y,
            z: value.z,
        }
    }
}

impl From<Vec3> for Vec3Dto {
    fn from(value: Vec3) -> Self {
        Self {
            x: value.x,
            y: value.y,
            z: value.z,
        }
    }
}

impl From<TrackSample> for TrackSampleDto {
    fn from(sample: TrackSample) -> Self {
        Self {
            history_id: sample.history_id,
            events: sample
                .events
                .into_iter()
                .map(ParticleEventDto::from)
                .collect(),
        }
    }
}

impl From<ParticleEvent> for ParticleEventDto {
    fn from(event: ParticleEvent) -> Self {
        Self {
            history_id: event.history_id,
            particle_id: event.particle_id,
            event_type: match event.event_type {
                ParticleEventType::Birth => "birth",
                ParticleEventType::Move => "move",
                ParticleEventType::BoundaryCrossing => "boundary-crossing",
                ParticleEventType::Scatter => "scatter",
                ParticleEventType::Absorb => "absorb",
                ParticleEventType::Escape => "escape",
                ParticleEventType::ErrorLost => "error-lost",
            }
            .to_string(),
            position: event.position.into(),
            direction: event.direction.into(),
            energy_mev: event.energy_mev,
            weight: event.weight,
            time: event.time,
            material_id: event.material_id,
            entity_id: event.entity_id,
            reason: event.reason,
        }
    }
}

impl From<TallyDelta> for TallyDeltaDto {
    fn from(delta: TallyDelta) -> Self {
        Self {
            tally_id: delta.tally_id,
            scores: delta.scores,
        }
    }
}

impl From<EngineDiagnostic> for BackendDiagnosticDto {
    fn from(diagnostic: EngineDiagnostic) -> Self {
        Self {
            level: match diagnostic.level {
                DiagnosticLevel::Info => "info",
                DiagnosticLevel::Warning => "warning",
                DiagnosticLevel::Error => "error",
            }
            .to_string(),
            code: diagnostic.code,
            message: diagnostic.message,
            entity_id: diagnostic.entity_id,
            problem_id: None,
            run_id: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contract_consumes_the_v2_conformance_corpus() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../../../fixtures/contracts/native-execution-v2.json"
        ))
        .expect("shared fixture should be valid JSON");
        let request: NativeExecutionRequest = serde_json::from_value(fixture["request"].clone())
            .expect("shared request should match the native adapter DTO");
        assert_eq!(request.contract_version, NATIVE_EXECUTION_CONTRACT_VERSION);
        assert_eq!(request.run_session_id, "fixture-session");
        assert_eq!(serde_json::to_value(&request).unwrap(), fixture["request"]);

        let events: Vec<NativeExecutionEventDto> =
            serde_json::from_value(fixture["eventExamples"].clone())
                .expect("every v2 event kind should match the Rust DTOs");
        assert_eq!(serde_json::to_value(events).unwrap(), fixture["eventExamples"]);
    }

    #[test]
    fn valid_request_returns_ordered_events_with_the_caller_session_id() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../../../fixtures/contracts/native-execution-v2.json"
        ))
        .expect("shared fixture should be valid JSON");
        let mut request = fixture["request"].clone();
        request["additiveFutureField"] = serde_json::json!(true);
        let response = execute_native_request(request);
        let serialized = serde_json::to_value(&response).unwrap();
        assert_eq!(serialized["contractVersion"], "2.0.0");
        let events = serialized["events"].as_array().expect("events array");
        assert_eq!(events[0]["type"], "backendMetadata");
        assert_eq!(events[1]["type"], "problemAccepted");
        assert_eq!(events[2]["type"], "runStarted");
        assert_eq!(events[3]["type"], "runProgress");
        assert_eq!(events[4]["type"], "trackSamples");
        assert_eq!(events.last().unwrap()["type"], "runCompleted");
        assert!(events.iter().skip(1).all(|event| event["runId"] == "fixture-session"));
    }

    #[test]
    fn contract_rejects_v1_and_invalid_payloads_as_run_failed_events() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../../../fixtures/contracts/native-execution-v2.json"
        ))
        .expect("shared fixture should be valid JSON");

        let mismatch = execute_native_request(fixture["versionMismatchRequest"].clone());
        let mismatch = serde_json::to_value(mismatch).unwrap();
        assert_eq!(mismatch["events"][0]["type"], "runFailed");
        assert_eq!(
            mismatch["events"][0]["diagnostic"]["code"],
            "native.contract.version_mismatch"
        );
        assert_eq!(mismatch["events"][0]["runId"], "fixture-session");

        let invalid = execute_native_request(fixture["invalidRequest"].clone());
        let invalid = serde_json::to_value(invalid).unwrap();
        assert_eq!(invalid["events"][0]["type"], "runFailed");
        assert_eq!(
            invalid["events"][0]["diagnostic"]["code"],
            "native.contract.invalid_request"
        );

        assert!(
            serde_json::from_value::<Vec<NativeExecutionEventDto>>(
                serde_json::json!([{"type": "futureEvent"}])
            )
            .is_err()
        );
    }

    #[test]
    fn engine_error_diagnostics_terminate_as_run_failed() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../../../fixtures/contracts/native-execution-v2.json"
        ))
        .expect("shared fixture should be valid JSON");
        let mut request = fixture["request"].clone();
        request["problem"]["sources"] = serde_json::json!([]);

        let response = serde_json::to_value(execute_native_request(request)).unwrap();
        let events = response["events"].as_array().expect("events");

        assert!(events.iter().any(|event| {
            event["type"] == "diagnostic"
                && event["diagnostic"]["code"] == "problem.sources.empty"
        }));
        assert_eq!(events.last().unwrap()["type"], "runFailed");
        assert_eq!(events.last().unwrap()["runId"], "fixture-session");
    }
}
