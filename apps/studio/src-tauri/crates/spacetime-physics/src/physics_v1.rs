//! V1 rad-hydro physics substrate.
//!
//! This module keeps V1 facets explicit even when a solver is not runnable yet.
//! The runnable pieces are intentionally small deterministic kernels that can
//! anchor validation, reporting, and orchestration.

use crate::{PhysicsError, TimeDuration, Vec3};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PhysicsSolverId {
    MockFields,
    GrayRadiationDiffusion,
    MultigroupRadiationDiffusion,
    DiscreteOrdinates,
    ImplicitMonteCarlo,
    LagrangianHydro,
    EulerianHydro,
    AleHydro,
    CriticalityKeff,
    PointKinetics,
    Depletion,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum SolverSupportStatus {
    Runnable,
    Gated,
    Placeholder,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum RadiationTransportMode {
    None,
    GrayM1,
    GrayDiffusion,
    MultigroupDiffusion,
    DiscreteOrdinates,
    ImplicitMonteCarlo,
    Hybrid,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum HydroMode {
    None,
    Eulerian,
    Lagrangian,
    Ale,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TemperatureModelKind {
    SingleTemperature,
    TwoTemperature,
    ThreeTemperature,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct FieldSample1D {
    pub x: f64,
    pub value: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ScalarField1D {
    pub dx: f64,
    pub values: Vec<f64>,
}

impl ScalarField1D {
    pub fn new(dx: f64, values: Vec<f64>) -> Result<Self, PhysicsError> {
        if !dx.is_finite() || dx <= 0.0 || values.iter().any(|value| !value.is_finite()) {
            return Err(PhysicsError::NonFiniteValue);
        }
        Ok(Self { dx, values })
    }

    pub fn uniform(cell_count: usize, dx: f64, value: f64) -> Result<Self, PhysicsError> {
        Self::new(dx, vec![value; cell_count])
    }

    pub fn len(&self) -> usize {
        self.values.len()
    }

    pub fn total(&self) -> f64 {
        self.values.iter().sum::<f64>() * self.dx
    }
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct TableDomain {
    pub density: Option<(f64, f64)>,
    pub temperature: Option<(f64, f64)>,
    pub energy_mev: Option<(f64, f64)>,
    pub radiation_group: Option<(u32, u32)>,
}

impl TableDomain {
    pub const EMPTY: Self = Self {
        density: None,
        temperature: None,
        energy_mev: None,
        radiation_group: None,
    };

    pub fn validate_density(self, density: f64) -> Result<(), PhysicsError> {
        validate_range(density, self.density)
    }

    pub fn validate_temperature(self, temperature: f64) -> Result<(), PhysicsError> {
        validate_range(temperature, self.temperature)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct TableRef {
    pub id: String,
    pub data_policy: TableDataPolicy,
    pub domain: TableDomain,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TableDataPolicy {
    Mock,
    LocalTable,
    ExternalRequired,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub enum EosModel {
    IdealGas { gamma: f64 },
    Table { domain: TableDomain },
    Placeholder,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub enum OpacityModel {
    Constant { value: f64 },
    GrayTable { domain: TableDomain },
    MultigroupTable { domain: TableDomain, groups: u32 },
    Placeholder,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct TemperatureModel {
    pub kind: TemperatureModelKind,
    pub electron_ion_coupling: Option<f64>,
    pub matter_radiation_coupling: Option<f64>,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct MaterialStateCell {
    pub density: f64,
    pub velocity: Vec3,
    pub pressure: f64,
    pub internal_energy: f64,
    pub electron_temperature: f64,
    pub ion_temperature: f64,
    pub radiation_temperature: f64,
    pub ionization_state: Option<f64>,
}

impl MaterialStateCell {
    pub fn validate(self) -> Result<(), PhysicsError> {
        if self.density < 0.0
            || !self.density.is_finite()
            || !self.pressure.is_finite()
            || !self.internal_energy.is_finite()
            || !self.electron_temperature.is_finite()
            || !self.ion_temperature.is_finite()
            || !self.radiation_temperature.is_finite()
        {
            return Err(PhysicsError::NonFiniteValue);
        }
        Ok(())
    }
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct RadHydroCell {
    pub material: MaterialStateCell,
    pub radiation_energy: f64,
    pub radiation_flux: Vec3,
    pub material_radiation_coupling: f64,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct ConservationDiagnostics {
    pub mass: f64,
    pub material_energy: f64,
    pub radiation_energy: f64,
    pub total_energy: f64,
}

impl ConservationDiagnostics {
    pub fn from_cells(cells: &[RadHydroCell], cell_volume: f64) -> Result<Self, PhysicsError> {
        if !cell_volume.is_finite() || cell_volume <= 0.0 {
            return Err(PhysicsError::InvalidGrid);
        }

        let mut mass = 0.0;
        let mut material_energy = 0.0;
        let mut radiation_energy = 0.0;
        for cell in cells {
            cell.material.validate()?;
            mass += cell.material.density * cell_volume;
            material_energy += cell.material.internal_energy * cell_volume;
            radiation_energy += cell.radiation_energy * cell_volume;
        }

        Ok(Self {
            mass,
            material_energy,
            radiation_energy,
            total_energy: material_energy + radiation_energy,
        })
    }

    pub fn delta(self, previous: Self) -> Self {
        Self {
            mass: self.mass - previous.mass,
            material_energy: self.material_energy - previous.material_energy,
            radiation_energy: self.radiation_energy - previous.radiation_energy,
            total_energy: self.total_energy - previous.total_energy,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum CouplingNodeKind {
    RadiationTransportStep,
    HydroStep,
    EosUpdate,
    OpacityUpdate,
    ElectronIonCoupling,
    LaserDeposition,
    ConductiveHeatTransfer,
    ArtificialViscosity,
    AmrRegrid,
    Diagnostics,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CouplingNode {
    pub id: String,
    pub kind: CouplingNodeKind,
    pub inputs: Vec<String>,
    pub outputs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CouplingEdge {
    pub from: String,
    pub output: String,
    pub to: String,
    pub input: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CouplingGraph {
    pub nodes: Vec<CouplingNode>,
    pub edges: Vec<CouplingEdge>,
}

impl CouplingGraph {
    pub fn validate(&self) -> Result<(), PhysicsError> {
        for edge in &self.edges {
            let Some(from) = self.nodes.iter().find(|node| node.id == edge.from) else {
                return Err(PhysicsError::InvalidGrid);
            };
            let Some(to) = self.nodes.iter().find(|node| node.id == edge.to) else {
                return Err(PhysicsError::InvalidGrid);
            };
            if !from.outputs.iter().any(|output| output == &edge.output)
                || !to.inputs.iter().any(|input| input == &edge.input)
            {
                return Err(PhysicsError::InvalidGrid);
            }
        }
        Ok(())
    }
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct CriticalityState {
    pub has_fissile_material: bool,
    pub keff_placeholder: Option<f64>,
    pub beta_effective_placeholder: Option<f64>,
    pub reactivity_placeholder: Option<f64>,
    pub subcritical_margin: Option<f64>,
}

impl CriticalityState {
    pub const fn placeholder_subcritical(margin: f64) -> Self {
        Self {
            has_fissile_material: true,
            keff_placeholder: None,
            beta_effective_placeholder: None,
            reactivity_placeholder: None,
            subcritical_margin: Some(margin),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct GrayDiffusionConfig {
    pub diffusion_coefficient: f64,
    pub absorption: f64,
    pub left_boundary_value: f64,
    pub right_boundary_value: f64,
}

pub fn gray_diffusion_step(
    field: &ScalarField1D,
    source: &ScalarField1D,
    config: GrayDiffusionConfig,
    dt: TimeDuration,
) -> Result<ScalarField1D, PhysicsError> {
    if field.len() != source.len()
        || field.len() < 3
        || !dt.seconds().is_finite()
        || dt.seconds() <= 0.0
        || !config.diffusion_coefficient.is_finite()
        || config.diffusion_coefficient < 0.0
        || !config.absorption.is_finite()
        || config.absorption < 0.0
    {
        return Err(PhysicsError::InvalidStep);
    }

    let stable_dt = 0.5 * field.dx * field.dx / config.diffusion_coefficient.max(1.0e-12);
    if dt.seconds() > stable_dt {
        return Err(PhysicsError::InvalidStep);
    }

    let mut next = field.values.clone();
    let dx2 = field.dx * field.dx;
    for i in 0..field.len() {
        let left = if i == 0 {
            config.left_boundary_value
        } else {
            field.values[i - 1]
        };
        let right = if i + 1 == field.len() {
            config.right_boundary_value
        } else {
            field.values[i + 1]
        };
        let laplacian = (left - 2.0 * field.values[i] + right) / dx2;
        next[i] = field.values[i]
            + dt.seconds()
                * (config.diffusion_coefficient * laplacian - config.absorption * field.values[i]
                    + source.values[i]);
    }
    ScalarField1D::new(field.dx, next)
}

pub fn marshak_wave_fixture(
    cell_count: usize,
) -> Result<(ScalarField1D, ScalarField1D, GrayDiffusionConfig), PhysicsError> {
    let field = ScalarField1D::uniform(cell_count, 1.0 / cell_count as f64, 0.0)?;
    let source = ScalarField1D::uniform(cell_count, field.dx, 0.0)?;
    Ok((
        field,
        source,
        GrayDiffusionConfig {
            diffusion_coefficient: 0.05,
            absorption: 0.0,
            left_boundary_value: 1.0,
            right_boundary_value: 0.0,
        },
    ))
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct EulerianHydroCell {
    pub density: f64,
    pub momentum: f64,
    pub total_energy: f64,
}

impl EulerianHydroCell {
    pub fn velocity(self) -> Result<f64, PhysicsError> {
        if self.density <= 0.0 || !self.density.is_finite() {
            return Err(PhysicsError::NonFiniteValue);
        }
        Ok(self.momentum / self.density)
    }

    pub fn pressure(self, gamma: f64) -> Result<f64, PhysicsError> {
        if gamma <= 1.0 || !gamma.is_finite() {
            return Err(PhysicsError::NonFiniteValue);
        }
        let kinetic = 0.5 * self.momentum * self.momentum / self.density;
        Ok((gamma - 1.0) * (self.total_energy - kinetic).max(0.0))
    }
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct EulerianHydroConfig {
    pub gamma: f64,
    pub courant: f64,
}

pub fn eulerian_hydro_step(
    cells: &[EulerianHydroCell],
    dx: f64,
    dt: TimeDuration,
    config: EulerianHydroConfig,
) -> Result<Vec<EulerianHydroCell>, PhysicsError> {
    if cells.len() < 3 || dx <= 0.0 || !dx.is_finite() || dt.seconds() <= 0.0 {
        return Err(PhysicsError::InvalidGrid);
    }

    let max_speed = cells
        .iter()
        .map(|cell| {
            let pressure = cell.pressure(config.gamma)?;
            let sound_speed = (config.gamma * pressure / cell.density).max(0.0).sqrt();
            Ok(cell.velocity()?.abs() + sound_speed)
        })
        .collect::<Result<Vec<_>, PhysicsError>>()?
        .into_iter()
        .fold(0.0, f64::max);

    if dt.seconds() > config.courant * dx / max_speed.max(1.0e-12) {
        return Err(PhysicsError::InvalidStep);
    }

    let mut fluxes = vec![[0.0; 3]; cells.len() + 1];
    for face in 1..cells.len() {
        fluxes[face] = rusanov_flux(cells[face - 1], cells[face], config.gamma)?;
    }

    let mut next = cells.to_vec();
    for i in 1..cells.len() - 1 {
        next[i].density -= dt.seconds() / dx * (fluxes[i + 1][0] - fluxes[i][0]);
        next[i].momentum -= dt.seconds() / dx * (fluxes[i + 1][1] - fluxes[i][1]);
        next[i].total_energy -= dt.seconds() / dx * (fluxes[i + 1][2] - fluxes[i][2]);
    }
    Ok(next)
}

pub fn sod_shock_tube_fixture(cell_count: usize) -> Vec<EulerianHydroCell> {
    (0..cell_count)
        .map(|i| {
            if i < cell_count / 2 {
                primitive_to_conservative(1.0, 0.0, 1.0, 1.4)
            } else {
                primitive_to_conservative(0.125, 0.0, 0.1, 1.4)
            }
        })
        .collect()
}

pub fn primitive_to_conservative(
    density: f64,
    velocity: f64,
    pressure: f64,
    gamma: f64,
) -> EulerianHydroCell {
    EulerianHydroCell {
        density,
        momentum: density * velocity,
        total_energy: pressure / (gamma - 1.0) + 0.5 * density * velocity * velocity,
    }
}

fn rusanov_flux(
    left: EulerianHydroCell,
    right: EulerianHydroCell,
    gamma: f64,
) -> Result<[f64; 3], PhysicsError> {
    let left_flux = hydro_flux(left, gamma)?;
    let right_flux = hydro_flux(right, gamma)?;
    let left_speed = left.velocity()?.abs()
        + (gamma * left.pressure(gamma)? / left.density)
            .max(0.0)
            .sqrt();
    let right_speed = right.velocity()?.abs()
        + (gamma * right.pressure(gamma)? / right.density)
            .max(0.0)
            .sqrt();
    let speed = left_speed.max(right_speed);
    Ok([
        0.5 * (left_flux[0] + right_flux[0]) - 0.5 * speed * (right.density - left.density),
        0.5 * (left_flux[1] + right_flux[1]) - 0.5 * speed * (right.momentum - left.momentum),
        0.5 * (left_flux[2] + right_flux[2])
            - 0.5 * speed * (right.total_energy - left.total_energy),
    ])
}

fn hydro_flux(cell: EulerianHydroCell, gamma: f64) -> Result<[f64; 3], PhysicsError> {
    let velocity = cell.velocity()?;
    let pressure = cell.pressure(gamma)?;
    Ok([
        cell.momentum,
        cell.momentum * velocity + pressure,
        (cell.total_energy + pressure) * velocity,
    ])
}

fn validate_range(value: f64, range: Option<(f64, f64)>) -> Result<(), PhysicsError> {
    if !value.is_finite() {
        return Err(PhysicsError::NonFiniteValue);
    }
    if let Some((min, max)) = range {
        if value < min || value > max {
            return Err(PhysicsError::InvalidStep);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn table_domain_validates_density_and_temperature() {
        let domain = TableDomain {
            density: Some((0.1, 10.0)),
            temperature: Some((100.0, 1_000.0)),
            energy_mev: None,
            radiation_group: None,
        };

        assert_eq!(domain.validate_density(1.0), Ok(()));
        assert_eq!(
            domain.validate_temperature(10.0),
            Err(PhysicsError::InvalidStep)
        );
    }

    #[test]
    fn conservation_diagnostics_accumulate_mass_and_energy() {
        let material = MaterialStateCell {
            density: 2.0,
            velocity: Vec3::ZERO,
            pressure: 1.0,
            internal_energy: 3.0,
            electron_temperature: 1.0,
            ion_temperature: 1.0,
            radiation_temperature: 1.0,
            ionization_state: None,
        };

        let diagnostics = ConservationDiagnostics::from_cells(
            &[RadHydroCell {
                material,
                radiation_energy: 4.0,
                radiation_flux: Vec3::ZERO,
                material_radiation_coupling: 0.0,
            }],
            0.5,
        )
        .expect("diagnostics");

        assert_eq!(diagnostics.mass, 1.0);
        assert_eq!(diagnostics.total_energy, 3.5);
    }

    #[test]
    fn gray_diffusion_marshak_fixture_heats_left_boundary() {
        let (field, source, config) = marshak_wave_fixture(16).expect("fixture");
        let next = gray_diffusion_step(&field, &source, config, TimeDuration::from_seconds(0.001))
            .expect("step");

        assert!(next.values[0] > field.values[0]);
        assert!(next.total() > field.total());
    }

    #[test]
    fn eulerian_hydro_shock_fixture_moves_contact_region() {
        let cells = sod_shock_tube_fixture(16);
        let next = eulerian_hydro_step(
            &cells,
            1.0 / 16.0,
            TimeDuration::from_seconds(0.001),
            EulerianHydroConfig {
                gamma: 1.4,
                courant: 0.5,
            },
        )
        .expect("hydro step");

        assert!(next[7].density < cells[7].density);
        assert!(next[8].density > cells[8].density);
    }

    #[test]
    fn coupling_graph_rejects_unresolved_io() {
        let graph = CouplingGraph {
            nodes: vec![CouplingNode {
                id: "rad".to_string(),
                kind: CouplingNodeKind::RadiationTransportStep,
                inputs: vec![],
                outputs: vec!["radiation-energy".to_string()],
            }],
            edges: vec![CouplingEdge {
                from: "rad".to_string(),
                output: "missing-output".to_string(),
                to: "hydro".to_string(),
                input: "energy".to_string(),
            }],
        };

        assert_eq!(graph.validate(), Err(PhysicsError::InvalidGrid));
    }
}
