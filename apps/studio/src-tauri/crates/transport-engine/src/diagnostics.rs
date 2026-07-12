use crate::geometry::Vec3;

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
pub(crate) fn warning(code: &str, message: &str, entity_id: Option<String>) -> EngineDiagnostic {
    EngineDiagnostic {
        level: DiagnosticLevel::Warning,
        code: code.to_string(),
        message: message.to_string(),
        entity_id,
    }
}

pub(crate) fn info(code: &str, message: &str, entity_id: Option<String>) -> EngineDiagnostic {
    EngineDiagnostic {
        level: DiagnosticLevel::Info,
        code: code.to_string(),
        message: message.to_string(),
        entity_id,
    }
}

pub(crate) fn error(code: &str, message: &str, entity_id: Option<String>) -> EngineDiagnostic {
    EngineDiagnostic {
        level: DiagnosticLevel::Error,
        code: code.to_string(),
        message: message.to_string(),
        entity_id,
    }
}
