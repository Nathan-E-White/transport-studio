mod adm;
mod amr;
mod bssn;
mod coupling;
mod curvature;
mod diagnostics;
mod geodesic;
mod geometry;
mod grhd;
mod grid;
mod grid_metric_adapter;
mod io;
pub mod kernel;
mod math_gateway;
mod matter;
mod metric;
mod numerics;
mod packet_deposition;
mod physics_v1;
mod radiation;
mod radiation_matter;
mod tensor;
mod transport;
mod units;
mod valencia;
mod vec3;
pub mod verification;

pub(crate) use adm::*;
pub(crate) use bssn::*;
pub(crate) use coupling::*;
pub(crate) use curvature::*;
pub(crate) use diagnostics::*;
pub(crate) use geodesic::*;
pub(crate) use geometry::*;
pub(crate) use grhd::*;
pub(crate) use grid::*;
pub(crate) use matter::*;
pub(crate) use metric::*;
pub(crate) use numerics::*;
pub(crate) use physics_v1::*;
pub(crate) use radiation_matter::*;
pub(crate) use tensor::*;
pub(crate) use transport::*;
pub(crate) use units::*;
pub(crate) use valencia::*;
pub(crate) use vec3::Vec3;

/// Deliberate access to low-level physics substrate for numerical development and debugging.
///
/// The [`kernel`] module is the canonical interface for coupled stepping. These modules expose
/// raw fields and numerical operations for callers who explicitly need expert-level control.
pub mod expert {
    pub use crate::adm::*;
    pub use crate::amr::*;
    pub use crate::bssn::*;
    pub use crate::coupling::*;
    pub use crate::curvature::*;
    pub use crate::diagnostics::*;
    pub use crate::geodesic::*;
    pub use crate::geometry::*;
    pub use crate::grhd::*;
    pub use crate::grid::*;
    pub use crate::grid_metric_adapter::*;
    pub use crate::matter::*;
    pub use crate::metric::*;
    pub use crate::numerics::*;
    pub use crate::packet_deposition::*;
    pub use crate::physics_v1::*;
    pub use crate::radiation::*;
    pub use crate::radiation_matter::*;
    pub use crate::tensor::*;
    pub use crate::transport::*;
    pub use crate::units::*;
    pub use crate::valencia::*;
    pub use crate::vec3::*;

    pub mod amr {
        pub use crate::amr::*;
    }
    pub mod packet_deposition {
        pub use crate::packet_deposition::*;
    }
    pub mod radiation {
        pub use crate::radiation::*;
    }
    pub mod vec3 {
        pub use crate::vec3::*;
    }
}

#[cfg(test)]
mod tests;
