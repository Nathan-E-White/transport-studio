//! Native physics adapter boundary for the Studio host.
//!
//! The GR/spacetime primitives that used to live in this app module are
//! preserved in the `spacetime-physics` crate. The Monte Carlo runtime lives in
//! `transport-engine`. This module deliberately stays thin so the Tauri host is
//! an adapter instead of the physics implementation.

pub use spacetime_physics;
pub use transport_engine;

pub const NATIVE_BACKEND_ID: &str = transport_engine::NATIVE_PHOTON_BACKEND_ID;

pub fn native_backend_metadata() -> transport_engine::BackendMetadata {
    transport_engine::backend_metadata()
}

use serde::{Deserialize, Serialize};
use transport_engine::{
    DiagnosticLevel, EngineDiagnostic, GeometryEntity, ParticleEvent, ParticleEventType,
    ParticleKind, RunSettings, Source, Tally, TallyDelta, TallyKind, TrackSample, Transform3,
    TransportProblem, Vec3,
};

#[tauri::command]
pub fn run_photon_smoke(problem: TransportProblemDto) -> Result<NativePhotonSmokePayload, String> {
    let problem = TransportProblem::from(problem);
    let result = transport_engine::run_photon_smoke(&problem);

    Ok(NativePhotonSmokePayload {
        run_id: result.run_id,
        completed_histories: result.completed_histories,
        total_histories: result.total_histories,
        tracks: result.tracks.into_iter().map(TrackSampleDto::from).collect(),
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
    })
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
#[serde(tag = "kind", rename_all = "kebab-case", rename_all_fields = "camelCase")]
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
#[serde(tag = "kind", rename_all = "kebab-case", rename_all_fields = "camelCase")]
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
#[serde(tag = "kind", rename_all = "kebab-case", rename_all_fields = "camelCase")]
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

#[derive(Debug, Clone, Serialize)]
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrackSampleDto {
    history_id: String,
    events: Vec<ParticleEventDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ParticleEventDto {
    history_id: String,
    particle_id: String,
    #[serde(rename = "type")]
    event_type: &'static str,
    position: Vec3Dto,
    direction: Vec3Dto,
    energy_mev: f64,
    weight: f64,
    time: f64,
    material_id: Option<String>,
    entity_id: Option<String>,
    reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TallyDeltaDto {
    tally_id: String,
    scores: Vec<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendDiagnosticDto {
    level: &'static str,
    code: String,
    message: String,
    entity_id: Option<String>,
}

impl From<TransportProblemDto> for TransportProblem {
    fn from(problem: TransportProblemDto) -> Self {
        Self {
            id: problem.id,
            name: problem.name,
            geometry: problem.geometry.entities.into_iter().map(GeometryEntity::from).collect(),
            materials: problem.materials.into_iter().map(transport_engine::Material::from).collect(),
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
            GeometryEntityDto::Box { id, name, material_id, transform, size } => GeometryEntity::Box {
                id,
                name,
                material_id,
                transform: transform.into(),
                size: size.into(),
            },
            GeometryEntityDto::Sphere { id, name, material_id, transform, radius } => GeometryEntity::Sphere {
                id,
                name,
                material_id,
                transform: transform.into(),
                radius,
            },
            GeometryEntityDto::Cylinder { id, name, material_id, transform, radius, height } => GeometryEntity::Cylinder {
                id,
                name,
                material_id,
                transform: transform.into(),
                radius,
                height,
            },
            GeometryEntityDto::Mesh { id, name } => GeometryEntity::Unsupported { id, name, kind: "mesh".to_string() },
            GeometryEntityDto::VoxelRegion { id, name } => GeometryEntity::Unsupported { id, name, kind: "voxel-region".to_string() },
            GeometryEntityDto::ImplicitRegion { id, name } => GeometryEntity::Unsupported { id, name, kind: "implicit-region".to_string() },
            GeometryEntityDto::CsgRegion { id, name } => GeometryEntity::Unsupported { id, name, kind: "csg-region".to_string() },
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
            SourceDto::PointSource { id, name, particle, position, energy_mev, strength } => Source::Point {
                id,
                name,
                particle: particle.into(),
                position: position.into(),
                energy_mev,
                strength,
            },
            SourceDto::BeamSource { id, name, particle, position, direction, energy_mev, strength } => Source::Beam {
                id,
                name,
                particle: particle.into(),
                position: position.into(),
                direction: direction.into(),
                energy_mev,
                strength,
            },
            SourceDto::IsotropicSource { id, name, particle, position, energy_mev, strength } => Source::Isotropic {
                id,
                name,
                particle: particle.into(),
                position: position.into(),
                energy_mev,
                strength,
            },
            SourceDto::SurfaceSource { id, name } => Source::Unsupported { id, name, kind: "surface-source".to_string() },
            SourceDto::RegionSource { id, name } => Source::Unsupported { id, name, kind: "region-source".to_string() },
        }
    }
}

impl From<TallyDto> for Tally {
    fn from(tally: TallyDto) -> Self {
        match tally {
            TallyDto::CellFlux { id, name, particle, entity_id } => Tally {
                id,
                name,
                particle: particle.into(),
                kind: TallyKind::CellFlux,
                target_entity_id: Some(entity_id),
            },
            TallyDto::TrackLength { id, name, particle, entity_id }
            | TallyDto::PulseHeight { id, name, particle, entity_id } => Tally {
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
        Self { x: value.x, y: value.y, z: value.z }
    }
}

impl From<Vec3> for Vec3Dto {
    fn from(value: Vec3) -> Self {
        Self { x: value.x, y: value.y, z: value.z }
    }
}

impl From<TrackSample> for TrackSampleDto {
    fn from(sample: TrackSample) -> Self {
        Self {
            history_id: sample.history_id,
            events: sample.events.into_iter().map(ParticleEventDto::from).collect(),
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
            },
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
            },
            code: diagnostic.code,
            message: diagnostic.message,
            entity_id: diagnostic.entity_id,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_photon_smoke_accepts_canonical_fixture_json() {
        let problem: TransportProblemDto = serde_json::from_str(
            r##"{
                "id": "fixture-photon-shielding",
                "name": "Native Photon Smoke Fixture",
                "status": "compiled",
                "geometry": {
                    "entities": [
                        {
                            "id": "shield-box",
                            "kind": "box",
                            "name": "Shield Box",
                            "materialId": "mat-water",
                            "transform": {
                                "position": {"x": 0.0, "y": 0.0, "z": 0.0},
                                "rotation": {"x": 0.0, "y": 0.0, "z": 0.0}
                            },
                            "size": {"x": 2.0, "y": 4.0, "z": 4.0}
                        }
                    ],
                    "surfaces": [],
                    "regions": []
                },
                "materials": [
                    {
                        "id": "mat-water",
                        "name": "Water Shield",
                        "density": 1.0,
                        "nuclides": [
                            {"nuclide": "H1", "fraction": 2.0, "basis": "atom"},
                            {"nuclide": "O16", "fraction": 1.0, "basis": "atom"}
                        ],
                        "color": "#38bdf8"
                    }
                ],
                "sources": [
                    {
                        "id": "beam-1",
                        "kind": "beam-source",
                        "name": "Photon Beam",
                        "particle": "photon",
                        "position": {"x": -4.0, "y": 0.0, "z": 0.0},
                        "direction": {"x": 1.0, "y": 0.0, "z": 0.0},
                        "energyMeV": 1.0,
                        "strength": 1.0,
                        "enabled": true
                    }
                ],
                "tallies": [
                    {
                        "id": "shield-track-length",
                        "kind": "cell-flux",
                        "name": "Shield Track Length",
                        "particle": "photon",
                        "entityId": "shield-box"
                    }
                ],
                "settings": {
                    "histories": 16,
                    "seed": 1337
                },
                "metadata": {
                    "sourceSceneId": "fixture-photon-shielding",
                    "targetBackendId": "native-rust-photon-smoke",
                    "tags": ["mwe", "native-photon-smoke"]
                }
            }"##,
        )
        .expect("fixture JSON should match the Tauri DTO contract");

        let payload = run_photon_smoke(problem).expect("native smoke command should succeed");

        assert_eq!(payload.completed_histories, 16);
        assert_eq!(payload.total_histories, 16);
        assert!(!payload.tracks.is_empty());
        assert!(payload.warnings.iter().any(|warning| warning == "simple coefficient smoke kernel"));
        assert!(payload
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "physics_data.simple_coefficients"));
    }
}
