use crate::photon_smoke::TransportProblem;
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct Transform3 {
    pub position: Vec3,
    pub rotation: Vec3,
}

#[derive(Debug, Clone, PartialEq)]
pub enum GeometryEntity {
    Box {
        id: String,
        name: String,
        material_id: String,
        transform: Transform3,
        size: Vec3,
    },
    Sphere {
        id: String,
        name: String,
        material_id: String,
        transform: Transform3,
        radius: f64,
    },
    Cylinder {
        id: String,
        name: String,
        material_id: String,
        transform: Transform3,
        radius: f64,
        height: f64,
    },
    Unsupported {
        id: String,
        name: String,
        kind: String,
    },
}

pub(crate) struct GeometryHit {
    pub(crate) entity_id: String,
    pub(crate) material_id: String,
    pub(crate) entry_distance: f64,
    pub(crate) exit_distance: f64,
}

impl GeometryHit {
    pub(crate) fn path_length(&self) -> f64 {
        (self.exit_distance - self.entry_distance).max(0.0)
    }
}

pub(crate) fn nearest_intersection(
    problem: &TransportProblem,
    origin: Vec3,
    direction: Vec3,
) -> Option<GeometryHit> {
    problem
        .geometry
        .iter()
        .filter_map(|entity| intersect_entity(entity, origin, direction))
        .filter(|hit| hit.exit_distance > 0.0)
        .min_by(|a, b| a.entry_distance.total_cmp(&b.entry_distance))
}

fn intersect_entity(entity: &GeometryEntity, origin: Vec3, direction: Vec3) -> Option<GeometryHit> {
    match entity {
        GeometryEntity::Box {
            id,
            material_id,
            transform,
            size,
            ..
        } => {
            let local_origin = origin - transform.position;
            let half = *size * 0.5;
            intersect_aabb(local_origin, direction, -half, half).map(|(entry, exit)| GeometryHit {
                entity_id: id.clone(),
                material_id: material_id.clone(),
                entry_distance: entry.max(0.0),
                exit_distance: exit,
            })
        }
        GeometryEntity::Sphere {
            id,
            material_id,
            transform,
            radius,
            ..
        } => intersect_sphere(origin - transform.position, direction, *radius).map(
            |(entry, exit)| GeometryHit {
                entity_id: id.clone(),
                material_id: material_id.clone(),
                entry_distance: entry.max(0.0),
                exit_distance: exit,
            },
        ),
        GeometryEntity::Cylinder {
            id,
            material_id,
            transform,
            radius,
            height,
            ..
        } => intersect_cylinder_z(origin - transform.position, direction, *radius, *height).map(
            |(entry, exit)| GeometryHit {
                entity_id: id.clone(),
                material_id: material_id.clone(),
                entry_distance: entry.max(0.0),
                exit_distance: exit,
            },
        ),
        GeometryEntity::Unsupported { .. } => None,
    }
}

fn intersect_aabb(origin: Vec3, direction: Vec3, min: Vec3, max: Vec3) -> Option<(f64, f64)> {
    let (mut t_min, mut t_max) = (-f64::INFINITY, f64::INFINITY);

    for (o, d, min_axis, max_axis) in [
        (origin.x, direction.x, min.x, max.x),
        (origin.y, direction.y, min.y, max.y),
        (origin.z, direction.z, min.z, max.z),
    ] {
        if d.abs() < 1.0e-12 {
            if o < min_axis || o > max_axis {
                return None;
            }
            continue;
        }

        let inv = 1.0 / d;
        let mut t1 = (min_axis - o) * inv;
        let mut t2 = (max_axis - o) * inv;
        if t1 > t2 {
            std::mem::swap(&mut t1, &mut t2);
        }
        t_min = t_min.max(t1);
        t_max = t_max.min(t2);
        if t_min > t_max {
            return None;
        }
    }

    Some((t_min, t_max))
}

fn intersect_sphere(origin: Vec3, direction: Vec3, radius: f64) -> Option<(f64, f64)> {
    let b = origin.dot(direction);
    let c = origin.dot(origin) - radius * radius;
    let discriminant = b * b - c;
    if discriminant < 0.0 {
        return None;
    }
    let root = discriminant.sqrt();
    Some((-b - root, -b + root))
}

fn intersect_cylinder_z(
    origin: Vec3,
    direction: Vec3,
    radius: f64,
    height: f64,
) -> Option<(f64, f64)> {
    let a = direction.x * direction.x + direction.y * direction.y;
    if a.abs() < 1.0e-12 {
        return intersect_aabb(
            origin,
            direction,
            Vec3::new(-radius, -radius, -height * 0.5),
            Vec3::new(radius, radius, height * 0.5),
        );
    }

    let b = 2.0 * (origin.x * direction.x + origin.y * direction.y);
    let c = origin.x * origin.x + origin.y * origin.y - radius * radius;
    let discriminant = b * b - 4.0 * a * c;
    if discriminant < 0.0 {
        return None;
    }

    let root = discriminant.sqrt();
    let mut hits = Vec::new();
    for t in [(-b - root) / (2.0 * a), (-b + root) / (2.0 * a)] {
        let z = origin.z + direction.z * t;
        if z >= -height * 0.5 && z <= height * 0.5 {
            hits.push(t);
        }
    }

    if hits.len() == 2 {
        hits.sort_by(f64::total_cmp);
        Some((hits[0], hits[1]))
    } else {
        None
    }
}

impl Vec3 {
    pub const ZERO: Self = Self::new(0.0, 0.0, 0.0);
    pub const X: Self = Self::new(1.0, 0.0, 0.0);

    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    pub fn dot(self, rhs: Self) -> f64 {
        self.x * rhs.x + self.y * rhs.y + self.z * rhs.z
    }

    pub fn norm(self) -> f64 {
        self.dot(self).sqrt()
    }

    pub fn normalized_or_x(self) -> Self {
        let norm = self.norm();
        if norm <= 1.0e-12 || !norm.is_finite() {
            Self::X
        } else {
            self * (1.0 / norm)
        }
    }
}

impl std::ops::Add for Vec3 {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Self::new(self.x + rhs.x, self.y + rhs.y, self.z + rhs.z)
    }
}

impl std::ops::Sub for Vec3 {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self::Output {
        Self::new(self.x - rhs.x, self.y - rhs.y, self.z - rhs.z)
    }
}

impl std::ops::Neg for Vec3 {
    type Output = Self;

    fn neg(self) -> Self::Output {
        Self::new(-self.x, -self.y, -self.z)
    }
}

impl std::ops::Mul<f64> for Vec3 {
    type Output = Self;

    fn mul(self, rhs: f64) -> Self::Output {
        Self::new(self.x * rhs, self.y * rhs, self.z * rhs)
    }
}
