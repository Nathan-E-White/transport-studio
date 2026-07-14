#![allow(clippy::suspicious_arithmetic_impl, clippy::suspicious_op_assign_impl)]

use numerica::create_hyperdual_single_derivative;
use sha2::{Digest, Sha256};
use std::path::Path;
use std::process::Command;
use std::sync::Mutex;

const EXPRESSION: &str = "x^3+2*x";
const EVALUATION_POINT: f64 = 2.0;
const FINITE_DIFFERENCE_STEP: f64 = 1.0e-5;
const RESULT_MARKER: &str = "transport-studio-math-v1";

static SYMBOLICA_PROCESS_LOCK: Mutex<()> = Mutex::new(());

create_hyperdual_single_derivative!(FirstDerivativeDual, 1);

pub(crate) struct DerivativeGatewayResult {
    pub symbolic_derivative: f64,
    pub hyperdual_derivative: f64,
    pub finite_difference_derivative: f64,
    pub maximum_value_disagreement: f64,
    pub expression_sha256: String,
    pub symbolica_license: SymbolicaLicenseState,
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

struct SymbolicDerivative {
    derivative: f64,
    values: [f64; 3],
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

#[cfg(test)]
mod tests {
    use super::{SymbolicaLicenseState, parse_worker_result};

    #[test]
    fn license_states_have_stable_non_secret_observations() {
        assert!(
            SymbolicaLicenseState::Licensed
                .diagnostic_codes()
                .is_empty()
        );
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
}
