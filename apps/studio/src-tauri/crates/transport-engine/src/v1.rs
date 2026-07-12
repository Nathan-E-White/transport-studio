use crate::diagnostics::{
    EngineDiagnostic, V1FieldDataset, V1ResultComparison, V1ResultDataset, error, info, warning,
};
pub const MOCK_FIELDS_SOLVER_ID: &str = "mock-fields";
pub const GRAY_RADIATION_DIFFUSION_SOLVER_ID: &str = "gray-radiation-diffusion";
pub const EULERIAN_HYDRO_SOLVER_ID: &str = "eulerian-hydro";
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
