use std::process::ExitCode;

use symbolica::{LicenseManager, prelude::*};

const RESULT_MARKER: &str = "transport-studio-math-v1";

fn main() -> ExitCode {
    let Some(expression) = std::env::args().nth(1) else {
        return ExitCode::from(2);
    };

    match symbolic_evidence(&expression) {
        Ok(evidence) => {
            println!(
                "{RESULT_MARKER}\t{}\t{}\t{}\t{}\t{}",
                evidence.derivative,
                evidence.values[0],
                evidence.values[1],
                evidence.values[2],
                evidence.license_state
            );
            ExitCode::SUCCESS
        }
        Err(_) => ExitCode::from(1),
    }
}

struct SymbolicEvidence {
    derivative: f64,
    values: [f64; 3],
    license_state: &'static str,
}

fn symbolic_evidence(expression: &str) -> Result<SymbolicEvidence, String> {
    let license_was_provided = std::env::var_os("SYMBOLICA_LICENSE").is_some();
    let license_state = if !license_was_provided {
        "restricted-missing"
    } else if LicenseManager::is_licensed() {
        "licensed"
    } else {
        "restricted-rejected"
    };

    let expression = try_parse!(expression)?;
    let derivative = expression.derivative(symbol!("x"));
    let derivative = scalar_value(&derivative, 2)?;
    let values = [
        scalar_value(&expression, -1)?,
        scalar_value(&expression, 0)?,
        scalar_value(&expression, 2)?,
    ];
    Ok(SymbolicEvidence {
        derivative,
        values,
        license_state,
    })
}

fn scalar_value(expression: &Atom, x: i64) -> Result<f64, String> {
    expression
        .replace(symbol!("x"))
        .with(Atom::num(x))
        .to_string()
        .parse::<f64>()
        .map_err(|error| format!("non-scalar result: {error}"))
}
