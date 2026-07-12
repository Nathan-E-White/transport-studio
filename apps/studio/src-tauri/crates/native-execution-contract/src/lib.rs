//! Runtime-neutral Native Execution Contract.
//!
//! The GR/spacetime primitives that used to live in this app module are
//! preserved in the `spacetime-physics` crate. The Monte Carlo runtime lives in
//! `transport-engine`. This module deliberately stays thin so the Tauri host is
//! an adapter instead of the physics implementation.

pub const NATIVE_EXECUTION_CONTRACT_VERSION: &str = "1.0.0";

use serde::{Deserialize, Serialize};
use transport_engine::{
    DiagnosticLevel, EngineDiagnostic, GeometryEntity, ParticleEvent, ParticleEventType,
    ParticleKind, RunSettings, Source, Tally, TallyDelta, TallyKind, TrackSample, Transform3,
    TransportProblem, Vec3,
};

pub fn execute_native_request(
    request: NativeExecutionRequest,
) -> Result<NativeExecutionSuccess, NativeExecutionFailure> {
    if request.contract_version != NATIVE_EXECUTION_CONTRACT_VERSION {
        return Err(NativeExecutionFailure {
            contract_version: NATIVE_EXECUTION_CONTRACT_VERSION.to_string(),
            code: "native.contract.version_mismatch".to_string(),
            message: format!(
                "Unsupported native execution contract version '{}'; expected '{}'.",
                request.contract_version, NATIVE_EXECUTION_CONTRACT_VERSION
            ),
        });
    }

    let problem_dto: TransportProblemDto =
        serde_json::from_value(request.problem).map_err(|error| NativeExecutionFailure {
            contract_version: NATIVE_EXECUTION_CONTRACT_VERSION.to_string(),
            code: "native.contract.invalid_request".to_string(),
            message: format!("Native execution request payload is invalid: {error}"),
        })?;
    let problem = TransportProblem::from(problem_dto);
    let result = transport_engine::run_photon_smoke(&problem);

    Ok(NativeExecutionSuccess {
        contract_version: NATIVE_EXECUTION_CONTRACT_VERSION.to_string(),
        payload: NativePhotonSmokePayload {
            run_id: result.run_id,
            completed_histories: result.completed_histories,
            total_histories: result.total_histories,
            tracks: result
                .tracks
                .into_iter()
                .map(TrackSampleDto::from)
                .collect(),
            tally_deltas: result
                .tally_deltas
                .into_iter()
                .map(TallyDeltaDto::from)
                .collect(),
            diagnostics: result
                .diagnostics
                .into_iter()
                .map(BackendDiagnosticDto::from)
                .collect(),
            warnings: result
                .provenance
                .used_simple_coefficients
                .then_some("simple coefficient smoke kernel".to_string())
                .into_iter()
                .collect(),
        },
    })
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeExecutionRequest {
    contract_version: String,
    problem: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeExecutionSuccess {
    contract_version: String,
    payload: NativePhotonSmokePayload,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeExecutionFailure {
    contract_version: String,
    code: String,
    message: String,
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
pub struct NativePhotonSmokePayload {
    run_id: String,
    tracks: Vec<TrackSampleDto>,
    tally_deltas: Vec<TallyDeltaDto>,
    diagnostics: Vec<BackendDiagnosticDto>,
    completed_histories: u64,
    total_histories: u64,
    warnings: Vec<String>,
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
    energy_mev: f64,
    weight: f64,
    time: f64,
    material_id: Option<String>,
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
pub struct BackendDiagnosticDto {
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
pub enum NativeBackendEventDto {
    Diagnostic {
        run_id: Option<String>,
        diagnostic: BackendDiagnosticDto,
    },
    RunFailed {
        run_id: Option<String>,
        diagnostic: BackendDiagnosticDto,
    },
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
    fn contract_consumes_the_shared_compatibility_fixture() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../../../fixtures/contracts/native-execution-v1.json"
        ))
        .expect("shared fixture should be valid JSON");
        let request: NativeExecutionRequest = serde_json::from_value(fixture["request"].clone())
            .expect("shared request should match the native adapter DTO");
        assert_eq!(request.contract_version, NATIVE_EXECUTION_CONTRACT_VERSION);
        assert_eq!(serde_json::to_value(&request).unwrap(), fixture["request"]);

        let success: NativeExecutionSuccess = serde_json::from_value(fixture["success"].clone())
            .expect("shared success should match the native adapter DTO");
        assert_eq!(serde_json::to_value(success).unwrap(), fixture["success"]);

        let events: Vec<NativeBackendEventDto> = serde_json::from_value(
            fixture["backendEvents"].clone(),
        )
        .expect("shared diagnostic and failure events should match the native adapter DTOs");
        assert_eq!(
            serde_json::to_value(events).unwrap(),
            fixture["backendEvents"]
        );
    }

    #[test]
    fn contract_rejects_version_mismatch_and_ignores_unknown_fields() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../../../fixtures/contracts/native-execution-v1.json"
        ))
        .expect("shared fixture should be valid JSON");
        let mut request = fixture["request"].clone();
        request["additiveFutureField"] = serde_json::json!(true);
        let compatible: NativeExecutionRequest = serde_json::from_value(request.clone())
            .expect("unknown fields are ignored by the v1 compatibility rule");
        assert!(execute_native_request(compatible).is_ok());

        request["contractVersion"] = serde_json::json!("0.0.0");
        let mismatch: NativeExecutionRequest = serde_json::from_value(request).unwrap();
        let failure = execute_native_request(mismatch).unwrap_err();
        assert_eq!(failure.code, fixture["failure"]["code"]);
        assert_eq!(failure.message, fixture["failure"]["message"]);
        assert_eq!(serde_json::to_value(failure).unwrap(), fixture["failure"]);

        assert!(
            serde_json::from_value::<Vec<NativeBackendEventDto>>(
                serde_json::json!([{"type": "futureEvent"}])
            )
            .is_err()
        );
    }

    #[test]
    fn contract_reports_invalid_problem_payloads_as_wire_failures() {
        let request = NativeExecutionRequest {
            contract_version: NATIVE_EXECUTION_CONTRACT_VERSION.to_string(),
            problem: serde_json::json!({"id": "missing-required-fields"}),
        };

        let failure = execute_native_request(request).unwrap_err();

        assert_eq!(failure.contract_version, NATIVE_EXECUTION_CONTRACT_VERSION);
        assert_eq!(failure.code, "native.contract.invalid_request");
        assert!(
            failure
                .message
                .starts_with("Native execution request payload is invalid:")
        );
    }
}
