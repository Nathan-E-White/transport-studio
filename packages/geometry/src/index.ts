import type { GeometryEntity } from "@transport/domain";
import type { Vec3 } from "@transport/shared";

export interface Bounds3 {
  readonly min: Vec3;
  readonly max: Vec3;
}

// noinspection JSUnusedGlobalSymbols
export interface CompiledGeometry {
  readonly objects: readonly GeometryEntity[];
  readonly worldBounds: Bounds3;
}

// noinspection JSUnusedGlobalSymbols
export function estimateWorldBounds(objects: readonly GeometryEntity[]): Bounds3 {
  if (objects.length === 0) {
    return { min: { x: -10, y: -10, z: -10 }, max: { x: 10, y: 10, z: 10 } };
  }

  return {
    min: { x: -25, y: -25, z: -25 },
    max: { x: 25, y: 25, z: 25 }
  };
}
