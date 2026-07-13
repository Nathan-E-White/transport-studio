pub mod adm;
pub mod amr;
pub mod bssn;
pub mod coupling;
pub mod curvature;
pub mod diagnostics;
pub mod geodesic;
pub mod geometry;
pub mod grid;
pub mod grid_metric_adapter;
pub mod io;
pub mod kernel;
pub mod matter;
pub mod metric;
pub mod numerics;
pub mod physics_v1;
pub mod radiation;
pub mod tensor;
mod transport;
pub mod units;
pub mod valencia;
pub mod vec3;

pub use adm::*;
pub use bssn::*;
pub use coupling::*;
pub use curvature::*;
pub use diagnostics::*;
pub use geodesic::*;
pub use geometry::*;
pub use grid::*;
pub use grid_metric_adapter::*;
pub use matter::*;
pub use metric::*;
pub use numerics::*;
pub use physics_v1::*;
pub use tensor::*;
pub use transport::*;
pub use units::*;
pub use valencia::*;
pub use vec3::Vec3;

/// Deliberate access to low-level physics substrate for numerical development and debugging.
///
/// The [`kernel`] module is the canonical interface for coupled stepping. These modules expose
/// raw fields and numerical operations for callers who explicitly need expert-level control.
pub mod expert {
    pub use crate::{
        adm, bssn, curvature, diagnostics, geodesic, geometry, grid, matter, metric, numerics,
        physics_v1, tensor, units, vec3,
    };
}

#[cfg(test)]
mod tests;
