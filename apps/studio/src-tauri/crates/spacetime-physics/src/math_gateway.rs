#![allow(clippy::suspicious_arithmetic_impl, clippy::suspicious_op_assign_impl)]

use numerica::create_hyperdual_single_derivative;
use numerica::domains::float::{Constructible, Real};
use sha2::{Digest, Sha256};
use std::path::Path;
use std::process::Command;
use std::sync::Mutex;

const EXPRESSION: &str = "x^3+2*x";
const EVALUATION_POINT: f64 = 2.0;
const FINITE_DIFFERENCE_STEP: f64 = 1.0e-5;
const RESULT_MARKER: &str = "transport-studio-math-v1";
const VALENCIA_RESULT_MARKER: &str = "transport-studio-valencia-v1";

static SYMBOLICA_PROCESS_LOCK: Mutex<()> = Mutex::new(());

create_hyperdual_single_derivative!(FirstDerivativeDual, 1);
create_hyperdual_single_derivative!(ValenciaDual, 3);

pub(crate) struct DerivativeGatewayResult {
    pub symbolic_derivative: f64,
    pub hyperdual_derivative: f64,
    pub finite_difference_derivative: f64,
    pub maximum_value_disagreement: f64,
    pub expression_sha256: String,
    pub symbolica_license: SymbolicaLicenseState,
}

pub(crate) struct ValenciaGatewayResult {
    pub primitive_to_conserved: JacobianGatewayEvidence,
    pub flux: JacobianGatewayEvidence,
    pub symbolica_license: SymbolicaLicenseState,
}

pub(crate) struct JacobianGatewayEvidence {
    pub maximum_disagreement: f64,
    pub value_disagreement: f64,
    pub condition_number: Option<f64>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum SymbolicaLicenseState {
    Licensed,
    RestrictedMissing,
    RestrictedRejected,
}

impl SymbolicaLicenseState {
    pub(crate) const fn provenance_value(self) -> &'static str {
        match self {
            Self::Licensed => "licensed",
            Self::RestrictedMissing => "restricted-missing",
            Self::RestrictedRejected => "restricted-rejected",
        }
    }

    pub(crate) const fn diagnostic_codes(self) -> &'static [&'static str] {
        match self {
            Self::Licensed => &[],
            Self::RestrictedMissing => &[
                "verification.math.symbolica.license-missing",
                "verification.math.symbolica.license-restricted",
            ],
            Self::RestrictedRejected => &[
                "verification.math.symbolica.license-rejected",
                "verification.math.symbolica.license-restricted",
            ],
        }
    }
}

pub(crate) fn crosscheck_derivative(worker_path: &Path) -> Result<DerivativeGatewayResult, String> {
    let symbolic = evaluate_symbolic_derivative(worker_path)?;
    let numeric_values = [-1.0, 0.0, 2.0].map(evaluate_expression);
    let maximum_value_disagreement = symbolic
        .values
        .into_iter()
        .zip(numeric_values)
        .map(|(symbolic, numeric)| (symbolic - numeric).abs())
        .fold(0.0, f64::max);

    Ok(DerivativeGatewayResult {
        symbolic_derivative: symbolic.derivative,
        hyperdual_derivative: evaluate_hyperdual_derivative(),
        finite_difference_derivative: evaluate_centered_finite_difference(),
        maximum_value_disagreement,
        expression_sha256: format!("{:x}", Sha256::digest(EXPRESSION.as_bytes())),
        symbolica_license: symbolic.license_state,
    })
}

pub(crate) fn crosscheck_valencia_jacobians<F>(
    worker_path: &Path,
    state: [f64; 3],
    production_maps: F,
) -> Result<ValenciaGatewayResult, String>
where
    F: Fn([f64; 3]) -> Result<[f64; 6], String>,
{
    let symbolic = evaluate_symbolic_valencia(worker_path, state)?;
    let (hyperdual_values, hyperdual_jacobian) = evaluate_valencia_hyperdual(state);
    let production_values = production_maps(state)?;
    let finite_difference_jacobian = evaluate_valencia_finite_difference(state, &production_maps)?;

    let primitive_to_conserved_maximum_disagreement = maximum_jacobian_disagreement(
        &symbolic.jacobian[..3],
        &hyperdual_jacobian[..3],
        &finite_difference_jacobian[..3],
    );
    let flux_maximum_disagreement = maximum_jacobian_disagreement(
        &symbolic.jacobian[3..],
        &hyperdual_jacobian[3..],
        &finite_difference_jacobian[3..],
    );
    let primitive_to_conserved_value_disagreement = maximum_value_disagreement(
        &symbolic.values[..3],
        &hyperdual_values[..3],
        &production_values[..3],
    );
    let flux_value_disagreement = maximum_value_disagreement(
        &symbolic.values[3..],
        &hyperdual_values[3..],
        &production_values[3..],
    );

    Ok(ValenciaGatewayResult {
        primitive_to_conserved: JacobianGatewayEvidence {
            maximum_disagreement: primitive_to_conserved_maximum_disagreement,
            value_disagreement: primitive_to_conserved_value_disagreement,
            condition_number: condition_number(&hyperdual_jacobian[..3]),
        },
        flux: JacobianGatewayEvidence {
            maximum_disagreement: flux_maximum_disagreement,
            value_disagreement: flux_value_disagreement,
            condition_number: condition_number(&hyperdual_jacobian[3..]),
        },
        symbolica_license: symbolic.license_state,
    })
}

struct SymbolicDerivative {
    derivative: f64,
    values: [f64; 3],
    license_state: SymbolicaLicenseState,
}

struct SymbolicValencia {
    values: [f64; 6],
    jacobian: [[f64; 3]; 6],
    license_state: SymbolicaLicenseState,
}

fn evaluate_symbolic_derivative(worker_path: &Path) -> Result<SymbolicDerivative, String> {
    let _process_guard = SYMBOLICA_PROCESS_LOCK
        .lock()
        .map_err(|_| "Symbolica process lock is poisoned".to_string())?;
    let output = Command::new(worker_path)
        .arg(EXPRESSION)
        .env("SYMBOLICA_HIDE_BANNER", "1")
        .output()
        .map_err(|error| format!("could not start Symbolica worker: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "Symbolica worker exited unsuccessfully ({})",
            output.status
        ));
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|_| "Symbolica worker returned non-UTF-8 output".to_string())?;
    parse_worker_result(&stdout)
}

fn evaluate_symbolic_valencia(
    worker_path: &Path,
    state: [f64; 3],
) -> Result<SymbolicValencia, String> {
    let _process_guard = SYMBOLICA_PROCESS_LOCK
        .lock()
        .map_err(|_| "Symbolica process lock is poisoned".to_string())?;
    let output = Command::new(worker_path)
        .arg("valencia-jacobian")
        .args(state.map(|value| value.to_string()))
        .env("SYMBOLICA_HIDE_BANNER", "1")
        .output()
        .map_err(|error| format!("could not start Symbolica worker: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "Symbolica worker exited unsuccessfully ({})",
            output.status
        ));
    }
    let stdout = String::from_utf8(output.stdout)
        .map_err(|_| "Symbolica worker returned non-UTF-8 output".to_string())?;
    parse_valencia_worker_result(&stdout)
}

fn parse_worker_result(stdout: &str) -> Result<SymbolicDerivative, String> {
    let line = stdout
        .lines()
        .find(|line| line.starts_with(RESULT_MARKER))
        .ok_or_else(|| "Symbolica worker returned no result".to_string())?;
    let mut fields = line.split('\t');
    let marker = fields.next();
    let derivative = fields
        .next()
        .ok_or_else(|| "Symbolica worker omitted its derivative".to_string())?
        .parse::<f64>()
        .map_err(|_| "Symbolica worker returned an invalid derivative".to_string())?;
    let mut parse_value = || {
        fields
            .next()
            .ok_or_else(|| "Symbolica worker omitted an expression value".to_string())?
            .parse::<f64>()
            .map_err(|_| "Symbolica worker returned an invalid expression value".to_string())
    };
    let values = [parse_value()?, parse_value()?, parse_value()?];
    let license_state = match fields.next() {
        Some("licensed") => SymbolicaLicenseState::Licensed,
        Some("restricted-missing") => SymbolicaLicenseState::RestrictedMissing,
        Some("restricted-rejected") => SymbolicaLicenseState::RestrictedRejected,
        _ => return Err("Symbolica worker returned an invalid license state".to_string()),
    };
    if marker != Some(RESULT_MARKER)
        || fields.next().is_some()
        || !derivative.is_finite()
        || !values.into_iter().all(f64::is_finite)
    {
        return Err("Symbolica worker returned an invalid result".to_string());
    }
    Ok(SymbolicDerivative {
        derivative,
        values,
        license_state,
    })
}

fn parse_valencia_worker_result(stdout: &str) -> Result<SymbolicValencia, String> {
    let line = stdout
        .lines()
        .find(|line| line.starts_with(VALENCIA_RESULT_MARKER))
        .ok_or_else(|| "Symbolica worker returned no Valencia result".to_string())?;
    let mut fields = line.split('\t');
    if fields.next() != Some(VALENCIA_RESULT_MARKER) {
        return Err("Symbolica worker returned an invalid Valencia marker".to_string());
    }
    let mut next_value = || {
        fields
            .next()
            .ok_or_else(|| "Symbolica worker omitted Valencia evidence".to_string())?
            .parse::<f64>()
            .map_err(|_| "Symbolica worker returned invalid Valencia evidence".to_string())
    };
    let mut values = [0.0; 6];
    for value in &mut values {
        *value = next_value()?;
    }
    let mut jacobian = [[0.0; 3]; 6];
    for row in &mut jacobian {
        for value in row {
            *value = next_value()?;
        }
    }
    let license_state = match fields.next() {
        Some("licensed") => SymbolicaLicenseState::Licensed,
        Some("restricted-missing") => SymbolicaLicenseState::RestrictedMissing,
        Some("restricted-rejected") => SymbolicaLicenseState::RestrictedRejected,
        _ => return Err("Symbolica worker returned an invalid license state".to_string()),
    };
    if fields.next().is_some()
        || values.iter().any(|value| !value.is_finite())
        || jacobian.iter().flatten().any(|value| !value.is_finite())
    {
        return Err("Symbolica worker returned invalid Valencia evidence".to_string());
    }
    Ok(SymbolicValencia {
        values,
        jacobian,
        license_state,
    })
}

fn evaluate_hyperdual_derivative() -> f64 {
    let x = FirstDerivativeDual::<f64>::new_variable(0, EVALUATION_POINT);
    let value = evaluate_expression(x);
    value.values[1]
}

fn evaluate_centered_finite_difference() -> f64 {
    let upper = evaluate_expression(EVALUATION_POINT + FINITE_DIFFERENCE_STEP);
    let lower = evaluate_expression(EVALUATION_POINT - FINITE_DIFFERENCE_STEP);
    (upper - lower) / (2.0 * FINITE_DIFFERENCE_STEP)
}

trait PolynomialScalar: Clone + std::ops::Add<Output = Self> + std::ops::Mul<Output = Self> {
    fn scaled(self, factor: f64) -> Self;
}

impl PolynomialScalar for f64 {
    fn scaled(self, factor: f64) -> Self {
        self * factor
    }
}

impl PolynomialScalar for FirstDerivativeDual<f64> {
    fn scaled(self, factor: f64) -> Self {
        self * &factor
    }
}

fn evaluate_expression<T: PolynomialScalar>(x: T) -> T {
    x.clone() * x.clone() * x.clone() + x.scaled(2.0)
}

fn evaluate_valencia_hyperdual(state: [f64; 3]) -> ([f64; 6], [[f64; 3]; 6]) {
    let rho = ValenciaDual::<f64>::new_variable(0, state[0]);
    let velocity = ValenciaDual::<f64>::new_variable(1, state[1]);
    let energy = ValenciaDual::<f64>::new_variable(2, state[2]);
    let (conserved, flux) = evaluate_valencia_reference_maps(rho, velocity, energy);
    let outputs = [
        conserved[0].clone(),
        conserved[1].clone(),
        conserved[2].clone(),
        flux[0].clone(),
        flux[1].clone(),
        flux[2].clone(),
    ];
    let values = outputs.clone().map(|output| output.values[0]);
    let jacobian = outputs.map(|output| [output.values[1], output.values[2], output.values[3]]);
    (values, jacobian)
}

fn evaluate_valencia_finite_difference<F>(
    state: [f64; 3],
    production_maps: &F,
) -> Result<[[f64; 3]; 6], String>
where
    F: Fn([f64; 3]) -> Result<[f64; 6], String>,
{
    let mut jacobian = [[0.0; 3]; 6];
    for column in 0..3 {
        let step = 1.0e-6 * state[column].abs().max(1.0e-8);
        let mut upper = state;
        let mut lower = state;
        upper[column] += step;
        lower[column] -= step;
        let upper = production_maps(upper)?;
        let lower = production_maps(lower)?;
        for row in 0..6 {
            jacobian[row][column] = (upper[row] - lower[row]) / (2.0 * step);
        }
    }
    Ok(jacobian)
}

fn evaluate_valencia_reference_maps<T>(rho: T, velocity: T, energy: T) -> ([T; 3], [T; 3])
where
    T: Real + Constructible,
{
    let one = T::new_one();
    let two = T::new_from_i64(2);
    let lorentz = (one.clone() - velocity.clone() * velocity.clone())
        .sqrt()
        .inv();
    let pressure = rho.clone() * energy.clone();
    let enthalpy = one + two * energy;
    let d = rho.clone() * lorentz.clone();
    let q = rho * enthalpy * lorentz.clone() * lorentz;
    let momentum = q.clone() * velocity.clone();
    let tau = q.clone() - pressure.clone() - d.clone();
    let conserved = [d.clone(), momentum.clone(), tau.clone()];
    let flux = [
        d * velocity.clone(),
        momentum * velocity.clone() + pressure.clone(),
        (tau + pressure) * velocity,
    ];
    (conserved, flux)
}

fn maximum_jacobian_disagreement(
    symbolic: &[[f64; 3]],
    hyperdual: &[[f64; 3]],
    finite_difference: &[[f64; 3]],
) -> f64 {
    symbolic
        .iter()
        .flatten()
        .zip(hyperdual.iter().flatten())
        .zip(finite_difference.iter().flatten())
        .map(|((&symbolic, &hyperdual), &finite_difference)| {
            (symbolic - hyperdual)
                .abs()
                .max((symbolic - finite_difference).abs())
                .max((hyperdual - finite_difference).abs())
        })
        .fold(0.0, f64::max)
}

fn maximum_value_disagreement(symbolic: &[f64], hyperdual: &[f64], production: &[f64]) -> f64 {
    symbolic
        .iter()
        .zip(hyperdual)
        .zip(production)
        .map(|((&symbolic, &hyperdual), &production)| {
            (symbolic - hyperdual)
                .abs()
                .max((symbolic - production).abs())
                .max((hyperdual - production).abs())
        })
        .fold(0.0, f64::max)
}

fn condition_number(rows: &[[f64; 3]]) -> Option<f64> {
    let matrix: [[f64; 3]; 3] = rows.try_into().ok()?;
    let determinant = matrix[0][0] * (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1])
        - matrix[0][1] * (matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0])
        + matrix[0][2] * (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0]);
    if determinant == 0.0 || !determinant.is_finite() {
        return None;
    }
    let inverse = [
        [
            (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1]) / determinant,
            (matrix[0][2] * matrix[2][1] - matrix[0][1] * matrix[2][2]) / determinant,
            (matrix[0][1] * matrix[1][2] - matrix[0][2] * matrix[1][1]) / determinant,
        ],
        [
            (matrix[1][2] * matrix[2][0] - matrix[1][0] * matrix[2][2]) / determinant,
            (matrix[0][0] * matrix[2][2] - matrix[0][2] * matrix[2][0]) / determinant,
            (matrix[0][2] * matrix[1][0] - matrix[0][0] * matrix[1][2]) / determinant,
        ],
        [
            (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0]) / determinant,
            (matrix[0][1] * matrix[2][0] - matrix[0][0] * matrix[2][1]) / determinant,
            (matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0]) / determinant,
        ],
    ];
    let norm = |value: [[f64; 3]; 3]| {
        value
            .into_iter()
            .map(|row| row.into_iter().map(f64::abs).sum::<f64>())
            .fold(0.0, f64::max)
    };
    let condition = norm(matrix) * norm(inverse);
    condition.is_finite().then_some(condition)
}

#[cfg(test)]
mod tests {
    use super::{
        condition_number, evaluate_valencia_finite_difference, parse_valencia_worker_result,
        parse_worker_result, SymbolicaLicenseState,
    };

    #[test]
    fn license_states_have_stable_non_secret_observations() {
        assert!(SymbolicaLicenseState::Licensed
            .diagnostic_codes()
            .is_empty());
        assert_eq!(
            SymbolicaLicenseState::RestrictedMissing.provenance_value(),
            "restricted-missing"
        );
        assert_eq!(
            SymbolicaLicenseState::RestrictedRejected.diagnostic_codes(),
            [
                "verification.math.symbolica.license-rejected",
                "verification.math.symbolica.license-restricted"
            ]
        );
    }

    #[test]
    fn worker_protocol_rejects_malformed_or_nonfinite_results() {
        assert_eq!(
            parse_worker_result("transport-studio-math-v1\t14\t-3\t0\t12\tlicensed")
                .unwrap()
                .license_state,
            SymbolicaLicenseState::Licensed
        );
        assert_eq!(
            parse_worker_result("transport-studio-math-v1\t14\t-3\t0\t12\trestricted-missing")
                .unwrap()
                .license_state,
            SymbolicaLicenseState::RestrictedMissing
        );
        assert_eq!(
            parse_worker_result("transport-studio-math-v1\t14\t-3\t0\t12\trestricted-rejected")
                .unwrap()
                .license_state,
            SymbolicaLicenseState::RestrictedRejected
        );
        assert!(parse_worker_result("not-a-result").is_err());
        assert!(
            parse_worker_result("transport-studio-math-v1-extra\t14\t-3\t0\t12\tlicensed").is_err()
        );
        assert!(parse_worker_result("transport-studio-math-v1\tNaN\t-3\t0\t12\tlicensed").is_err());
        assert!(parse_worker_result("transport-studio-math-v1\t14\tNaN\t0\t12\tlicensed").is_err());
        assert!(parse_worker_result("transport-studio-math-v1\t14\t-3\t0\t12\tunknown").is_err());
        assert!(
            parse_worker_result("transport-studio-math-v1\t14\t-3\t0\t12\tlicensed\textra")
                .is_err()
        );
    }

    #[test]
    fn valencia_worker_protocol_requires_complete_finite_repository_owned_evidence() {
        let fields = std::iter::repeat_n("1", 24).collect::<Vec<_>>().join("\t");
        let valid = format!("transport-studio-valencia-v1\t{fields}\trestricted-missing");
        let evidence = parse_valencia_worker_result(&valid).unwrap();
        assert_eq!(evidence.values, [1.0; 6]);
        assert_eq!(evidence.jacobian, [[1.0; 3]; 6]);
        assert_eq!(
            evidence.license_state,
            SymbolicaLicenseState::RestrictedMissing
        );
        for (wire_value, expected) in [
            ("licensed", SymbolicaLicenseState::Licensed),
            (
                "restricted-rejected",
                SymbolicaLicenseState::RestrictedRejected,
            ),
        ] {
            assert_eq!(
                parse_valencia_worker_result(&valid.replace("restricted-missing", wire_value))
                    .unwrap()
                    .license_state,
                expected
            );
        }

        assert!(parse_valencia_worker_result("not-a-result").is_err());
        assert!(parse_valencia_worker_result(&format!(
            "transport-studio-valencia-v1-extra\t{fields}\tlicensed"
        ))
        .is_err());
        assert!(parse_valencia_worker_result(&format!(
            "transport-studio-valencia-v1\t{}\tlicensed",
            std::iter::repeat_n("1", 23).collect::<Vec<_>>().join("\t")
        ))
        .is_err());
        assert!(parse_valencia_worker_result(&valid.replacen("\t1", "\tNaN", 1)).is_err());
        assert!(parse_valencia_worker_result(&format!("{valid}\textra")).is_err());
        assert!(
            parse_valencia_worker_result(&valid.replace("restricted-missing", "unknown")).is_err()
        );
    }

    #[test]
    fn condition_estimator_matches_standard_three_by_three_invariants() {
        assert_eq!(
            condition_number(&[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]),
            Some(1.0)
        );
        assert_eq!(
            condition_number(&[[2.0, 0.0, 0.0], [0.0, 4.0, 0.0], [0.0, 0.0, 8.0]]),
            Some(4.0)
        );
        assert_eq!(
            condition_number(&[[1.0, 2.0, 3.0], [0.0, 1.0, 4.0], [5.0, 6.0, 0.0]]),
            Some(517.0)
        );
        let dense = [[2.0, 1.0, 1.0], [1.0, 3.0, 2.0], [1.0, 0.5, 4.0]];
        let permutations = [
            [0, 1, 2],
            [0, 2, 1],
            [1, 0, 2],
            [1, 2, 0],
            [2, 0, 1],
            [2, 1, 0],
        ];
        for rows in &permutations {
            for columns in &permutations {
                let permuted: [[f64; 3]; 3] = std::array::from_fn(|row| {
                    std::array::from_fn(|column| dense[rows[row]][columns[column]])
                });
                let condition = condition_number(&permuted).unwrap();
                assert!((condition - 186.0 / 35.0).abs() < 1.0e-12);
            }
        }
        assert_eq!(
            condition_number(&[[1.0, 2.0, 3.0], [1.0, 2.0, 3.0], [0.0, 1.0, 0.0]]),
            None
        );
    }

    #[test]
    fn finite_difference_calls_the_supplied_production_maps() {
        let jacobian = evaluate_valencia_finite_difference([2.0, 3.0, 4.0], &|state| {
            let [x, y, z] = state;
            Ok([x * x, y * y, z * z, x * y, y * z, x * z])
        })
        .unwrap();
        let expected = [
            [4.0, 0.0, 0.0],
            [0.0, 6.0, 0.0],
            [0.0, 0.0, 8.0],
            [3.0, 2.0, 0.0],
            [0.0, 4.0, 3.0],
            [4.0, 0.0, 2.0],
        ];
        for (actual, expected) in jacobian.iter().flatten().zip(expected.iter().flatten()) {
            assert!((actual - expected).abs() < 1.0e-8);
        }
    }
}
