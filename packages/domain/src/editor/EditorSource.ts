import type { SourceId } from "./EditorScene";
import type { Vec3 } from '@transport/shared';

export type ParticleKind = "photon" | "neutron" | "electron";
export type EditorSourceKind = "point-source" | "beam-source" | "isotropic-source";

export interface EditorSourceBase {
  readonly id: SourceId;
  readonly name: string;
  readonly particle: ParticleKind;
  readonly energyMeV: number;
  readonly strength?: number;
  readonly enabled: boolean;
  readonly tags?: readonly string[];
}

export interface EditorPointSource extends EditorSourceBase {
  readonly kind: "point-source";
  readonly position: Vec3;
}

export interface EditorBeamSource extends EditorSourceBase {
  readonly kind: "beam-source";
  readonly position: Vec3;
  readonly direction: Vec3;
}

export interface EditorIsotropicSource extends EditorSourceBase {
  readonly kind: "isotropic-source";
  readonly position: Vec3;
}

export type EditorSource = EditorPointSource | EditorBeamSource | EditorIsotropicSource;

export interface CreateSourceBaseOptions {
  readonly id: SourceId;
  readonly name: string;
  readonly particle: ParticleKind;
  readonly energyMeV: number;
  readonly strength?: number;
  readonly enabled?: boolean;
  readonly tags?: readonly string[];
}

export interface CreatePointSourceOptions extends CreateSourceBaseOptions {
  readonly position: Vec3;
}

export interface CreateBeamSourceOptions extends CreateSourceBaseOptions {
  readonly position: Vec3;
  readonly direction: Vec3;
}

export interface CreateIsotropicSourceOptions extends CreateSourceBaseOptions {
  readonly position: Vec3;
}

export interface SourceValidationDiagnostic {
  readonly level: "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly sourceId: SourceId;
}

export function createPointSource(options: CreatePointSourceOptions): EditorPointSource {
  return {
    ...createSourceBase(options),
    kind: "point-source",
    position: options.position,
  };
}

export function createBeamSource(options: CreateBeamSourceOptions): EditorBeamSource {
  return {
    ...createSourceBase(options),
    kind: "beam-source",
    position: options.position,
    direction: options.direction,
  };
}

export function createIsotropicSource(options: CreateIsotropicSourceOptions): EditorIsotropicSource {
  return {
    ...createSourceBase(options),
    kind: "isotropic-source",
    position: options.position,
  };
}

export function isPointSource(source: EditorSource): source is EditorPointSource {
  return source.kind === "point-source";
}

export function isBeamSource(source: EditorSource): source is EditorBeamSource {
  return source.kind === "beam-source";
}

export function isIsotropicSource(source: EditorSource): source is EditorIsotropicSource {
  return source.kind === "isotropic-source";
}

export function getSourceLabel(source: EditorSource): string {
  switch (source.kind) {
    case "point-source":
      return `Point Source: ${source.name}`;
    case "beam-source":
      return `Beam Source: ${source.name}`;
    case "isotropic-source":
      return `Isotropic Source: ${source.name}`;
  }
}

export function isSourceEnabled(source: EditorSource): boolean {
  return source.enabled;
}

export function hasPositiveEnergy(source: EditorSource): boolean {
  return Number.isFinite(source.energyMeV) && source.energyMeV > 0;
}

export function getSourceStrength(source: EditorSource): number {
  return source.strength ?? 1;
}

export function normalizeDirection(direction: Vec3): Vec3 {
  const magnitude = vectorMagnitude(direction);

  if (magnitude === 0 || !Number.isFinite(magnitude)) {
    return direction;
  }

  return {
    x: direction.x / magnitude,
    y: direction.y / magnitude,
    z: direction.z / magnitude,
  };
}

export function hasValidDirection(source: EditorSource): boolean {
  if (!isBeamSource(source)) {
    return true;
  }

  return isValidVec3(source.direction) && vectorMagnitude(source.direction) > 0;
}

export function validateSource(source: EditorSource): readonly SourceValidationDiagnostic[] {
  const diagnostics: SourceValidationDiagnostic[] = [];

  if (source.id.trim().length === 0) {
    diagnostics.push({
      level: "error",
      code: "source.id.missing",
      message: "Source must have a non-empty id.",
      sourceId: source.id,
    });
  }

  if (source.name.trim().length === 0) {
    diagnostics.push({
      level: "error",
      code: "source.name.missing",
      message: "Source must have a non-empty name.",
      sourceId: source.id,
    });
  }

  if (!hasPositiveEnergy(source)) {
    diagnostics.push({
      level: "error",
      code: "source.energy.invalid",
      message: `Source "${source.name}" must have a positive finite energy in MeV.`,
      sourceId: source.id,
    });
  }

  if (source.strength !== undefined && (!Number.isFinite(source.strength) || source.strength < 0)) {
    diagnostics.push({
      level: "error",
      code: "source.strength.invalid",
      message: `Source "${source.name}" strength must be finite and non-negative.`,
      sourceId: source.id,
    });
  }

  if (!isValidVec3(source.position)) {
    diagnostics.push({
      level: "error",
      code: "source.position.invalid",
      message: `Source "${source.name}" has an invalid position.`,
      sourceId: source.id,
    });
  }

  if (isBeamSource(source) && !hasValidDirection(source)) {
    diagnostics.push({
      level: "error",
      code: "source.direction.invalid",
      message: `Beam source "${source.name}" must have a finite, non-zero direction.`,
      sourceId: source.id,
    });
  }

  if (!source.enabled) {
    diagnostics.push({
      level: "warning",
      code: "source.disabled",
      message: `Source "${source.name}" is disabled and will not contribute to a run.`,
      sourceId: source.id,
    });
  }

  return diagnostics;
}

export function isSourceReadyForTransport(source: EditorSource): boolean {
  return source.enabled && validateSource(source).every((diagnostic) => diagnostic.level !== "error");
}

function createSourceBase(options: CreateSourceBaseOptions): EditorSourceBase {
  return {
    id: options.id,
    name: options.name,
    particle: options.particle,
    energyMeV: options.energyMeV,
    strength: options.strength,
    enabled: options.enabled ?? true,
    tags: options.tags,
  };
}

function isValidVec3(value: Vec3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function vectorMagnitude(value: Vec3): number {
  return Math.hypot(value.x, value.y, value.z);
}
