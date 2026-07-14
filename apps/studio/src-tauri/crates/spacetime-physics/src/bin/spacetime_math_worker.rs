use std::process::ExitCode;

use symbolica::{prelude::*, LicenseManager};

const RESULT_MARKER: &str = "transport-studio-math-v1";

fn main() -> ExitCode {
    let mut arguments = std::env::args().skip(1);
    let Some(command) = arguments.next() else {
        return ExitCode::from(2);
    };

    if command == "valencia-jacobian" {
        return match parse_valencia_arguments(arguments).and_then(valencia_evidence) {
            Ok(evidence) => {
                print!("transport-studio-valencia-v1");
                for value in evidence.values {
                    print!("\t{value}");
                }
                for row in evidence.jacobian {
                    for value in row {
                        print!("\t{value}");
                    }
                }
                println!("\t{}", evidence.license_state);
                ExitCode::SUCCESS
            }
            Err(_) => ExitCode::from(1),
        };
    }

    match symbolic_evidence(&command) {
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

struct ValenciaEvidence {
    values: [f64; 6],
    jacobian: [[f64; 3]; 6],
    license_state: &'static str,
}

fn parse_valencia_arguments(
    mut arguments: impl Iterator<Item = String>,
) -> Result<[f64; 3], String> {
    let mut values = [0.0; 3];
    for value in &mut values {
        *value = arguments
            .next()
            .ok_or_else(|| "missing Valencia state".to_string())?
            .parse::<f64>()
            .map_err(|_| "invalid Valencia state".to_string())?;
    }
    if arguments.next().is_some() || values.iter().any(|value| !value.is_finite()) {
        return Err("invalid Valencia arguments".to_string());
    }
    Ok(values)
}

fn valencia_evidence(state: [f64; 3]) -> Result<ValenciaEvidence, String> {
    let license_state = license_state();
    let expressions = [
        "rho*(1-v^2)^(-1/2)",
        "rho*(1+2*epsilon)*(1-v^2)^(-1)*v",
        "rho*(1+2*epsilon)*(1-v^2)^(-1)-rho*epsilon-rho*(1-v^2)^(-1/2)",
        "rho*(1-v^2)^(-1/2)*v",
        "rho*(1+2*epsilon)*(1-v^2)^(-1)*v^2+rho*epsilon",
        "(rho*(1+2*epsilon)*(1-v^2)^(-1)-rho*(1-v^2)^(-1/2))*v",
    ];
    let variables = [symbol!("rho"), symbol!("v"), symbol!("epsilon")];
    let expressions = expressions
        .into_iter()
        .map(|source| try_parse!(source))
        .collect::<Result<Vec<_>, _>>()?;
    let mut outputs = expressions.clone();
    for expression in &expressions {
        for variable in variables {
            outputs.push(expression.derivative(variable));
        }
    }
    let parameters = variables.map(Atom::var);
    let evaluator = Atom::evaluator_multiple(&outputs, &parameters)
        .build()
        .map_err(|error| format!("could not build Valencia evaluator: {error}"))?;
    let mut evaluator = evaluator.map_coeff(&|coefficient| coefficient.re.to_f64());
    let mut evaluated = [0.0; 24];
    evaluator
        .try_evaluate(&state, &mut evaluated)
        .map_err(|error| format!("could not evaluate Valencia expressions: {error}"))?;
    if evaluated.iter().any(|value| !value.is_finite()) {
        return Err("Valencia expressions produced non-finite evidence".to_string());
    }
    let values = evaluated[..6]
        .try_into()
        .map_err(|_| "invalid Valencia value count".to_string())?;
    let mut jacobian = [[0.0; 3]; 6];
    for (row, values) in evaluated[6..].chunks_exact(3).enumerate() {
        jacobian[row].copy_from_slice(values);
    }
    Ok(ValenciaEvidence {
        values,
        jacobian,
        license_state,
    })
}

struct SymbolicEvidence {
    derivative: f64,
    values: [f64; 3],
    license_state: &'static str,
}

fn symbolic_evidence(expression: &str) -> Result<SymbolicEvidence, String> {
    let license_state = license_state();

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

fn license_state() -> &'static str {
    if std::env::var_os("SYMBOLICA_LICENSE").is_none() {
        "restricted-missing"
    } else if LicenseManager::is_licensed() {
        "licensed"
    } else {
        "restricted-rejected"
    }
}

fn scalar_value(expression: &Atom, x: i64) -> Result<f64, String> {
    expression
        .replace(symbol!("x"))
        .with(Atom::num(x))
        .to_string()
        .parse::<f64>()
        .map_err(|error| format!("non-scalar result: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{parse_valencia_arguments, valencia_evidence};

    #[test]
    fn valencia_arguments_require_exactly_three_finite_values() {
        assert_eq!(
            parse_valencia_arguments(["1", "0.2", "0.5"].into_iter().map(str::to_string)),
            Ok([1.0, 0.2, 0.5])
        );
        for arguments in [
            vec!["1", "0.2"],
            vec!["1", "0.2", "0.5", "extra"],
            vec!["1", "NaN", "0.5"],
            vec!["1", "not-a-number", "0.5"],
        ] {
            assert!(parse_valencia_arguments(arguments.into_iter().map(str::to_string)).is_err());
        }
    }

    #[test]
    fn symbolic_valencia_evaluator_handles_repeated_variables_and_small_densities() {
        let ordinary = valencia_evidence([1.0, 0.2, 0.5]).unwrap();
        assert!((ordinary.values[0] - 1.020_620_726_159_657_6).abs() < 1.0e-14);
        assert!((ordinary.values[1] - 5.0 / 12.0).abs() < 1.0e-14);
        assert!((ordinary.values[3] - 0.204_124_145_231_931_54).abs() < 1.0e-14);
        assert!((ordinary.jacobian[1][1] - 2.256_944_444_444_444_6).abs() < 1.0e-13);
        assert!((ordinary.jacobian[5][2] - 5.0 / 12.0).abs() < 1.0e-14);

        let near_vacuum = valencia_evidence([1.0e-9, 0.1, 0.1]).unwrap();
        assert!(near_vacuum.values.iter().all(|value| value.is_finite()));
        assert!(near_vacuum
            .jacobian
            .iter()
            .flatten()
            .all(|value| value.is_finite()));
        assert!(near_vacuum.values[0] > 1.0e-9);
        assert!(near_vacuum.values[0] < 1.1e-9);
    }
}
