export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

export type EntityId = Brand<string, "EntityId">;
export type RunId = Brand<string, "RunId">;

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Transform {
  readonly position: Vec3;
  readonly rotationEuler: Vec3;
  readonly scale: Vec3;
}

export const IDENTITY_TRANSFORM: Transform = {
  position: { x: 0, y: 0, z: 0 },
  rotationEuler: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 }
};

export function makeId(prefix = "entity"): EntityId {
  return `${prefix}_${crypto.randomUUID}` as EntityId;
}
