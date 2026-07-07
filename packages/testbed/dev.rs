#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScenarioAdmissibility {
    Allowed(AllowedScenario),
    Restricted(RestrictedScenario),
    Prohibited(ProhibitedScenario),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AllowedScenario {
    pub explanation: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RestrictedScenario {
    pub reasons: Vec<RestrictedScenarioReason>,
    pub required_controls: Vec<RestrictedControl>,
    pub allowed_transformations: Vec<SafeTransformation>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProhibitedScenario {
    pub reasons: Vec<ProhibitedScenarioReason>,
    pub message: String,
}
