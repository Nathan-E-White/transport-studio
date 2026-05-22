import type { EntityId, TallyId } from "./EditorScene";
import type { ParticleKind } from "./EditorSource";

// noinspection JSUnusedGlobalSymbols
export type EditorTallyKind = "cell-flux" | "surface-current" | "track-length" | "pulse-height";

export interface EditorTallyBase {
  readonly id: TallyId;
  readonly name: string;
  readonly particle: ParticleKind;
  readonly enabled: boolean;
  readonly tags?: readonly string[];
}

export interface EditorEntityTallyBase extends EditorTallyBase {
  readonly entityId: EntityId;
}

export interface EditorCellFluxTally extends EditorEntityTallyBase {
  readonly kind: "cell-flux";
}

export interface EditorSurfaceCurrentTally extends EditorEntityTallyBase {
  readonly kind: "surface-current";
}

export interface EditorTrackLengthTally extends EditorEntityTallyBase {
  readonly kind: "track-length";
}

export interface EditorPulseHeightTally extends EditorEntityTallyBase {
  readonly kind: "pulse-height";
}

export type EditorTally =
  | EditorCellFluxTally
  | EditorSurfaceCurrentTally
  | EditorTrackLengthTally
  | EditorPulseHeightTally;

export interface CreateTallyBaseOptions {
  readonly id: TallyId;
  readonly name: string;
  readonly particle: ParticleKind;
  readonly entityId: EntityId;
  readonly enabled?: boolean;
  readonly tags?: readonly string[];
}

export interface TallyValidationDiagnostic {
  readonly level: "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly tallyId: TallyId;
}

// noinspection JSUnusedGlobalSymbols
export function createCellFluxTally(options: CreateTallyBaseOptions): EditorCellFluxTally {
  return {
    ...createEntityTallyBase(options),
    kind: "cell-flux",
  };
}

// noinspection JSUnusedGlobalSymbols
export function createSurfaceCurrentTally(options: CreateTallyBaseOptions): EditorSurfaceCurrentTally {
  return {
    ...createEntityTallyBase(options),
    kind: "surface-current",
  };
}

// noinspection JSUnusedGlobalSymbols
export function createTrackLengthTally(options: CreateTallyBaseOptions): EditorTrackLengthTally {
  return {
    ...createEntityTallyBase(options),
    kind: "track-length",
  };
}

// noinspection JSUnusedGlobalSymbols
export function createPulseHeightTally(options: CreateTallyBaseOptions): EditorPulseHeightTally {
  return {
    ...createEntityTallyBase(options),
    kind: "pulse-height",
  };
}


// noinspection JSUnusedGlobalSymbols
export function isCellFluxTally(tally: EditorTally): tally is EditorCellFluxTally {
  return tally.kind === "cell-flux";
}

// noinspection JSUnusedGlobalSymbols
export function isSurfaceCurrentTally(tally: EditorTally): tally is EditorSurfaceCurrentTally {
  return tally.kind === "surface-current";
}

// noinspection JSUnusedGlobalSymbols
export function isTrackLengthTally(tally: EditorTally): tally is EditorTrackLengthTally {
  return tally.kind === "track-length";
}

// noinspection JSUnusedGlobalSymbols
export function isPulseHeightTally(tally: EditorTally): tally is EditorPulseHeightTally {
  return tally.kind === "pulse-height";
}

// noinspection JSUnusedGlobalSymbols
export function getTallyLabel(tally: EditorTally): string {
  switch (tally.kind) {
    case "cell-flux":
      return `Cell Flux Tally: ${tally.name}`;
    case "surface-current":
      return `Surface Current Tally: ${tally.name}`;
    case "track-length":
      return `Track Length Tally: ${tally.name}`;
    case "pulse-height":
      return `Pulse Height Tally: ${tally.name}`;
  }
}

// noinspection JSUnusedGlobalSymbols
export function isTallyEnabled(tally: EditorTally): boolean {
  return tally.enabled;
}

// noinspection JSUnusedGlobalSymbols
export function referencesEntity(tally: EditorTally, entityId: EntityId): boolean {
  return tally.entityId === entityId;
}

// noinspection JSUnusedGlobalSymbols
export function validateTally(
  tally: EditorTally,
  existingEntityIds?: ReadonlySet<EntityId>,
): readonly TallyValidationDiagnostic[] {
  const diagnostics: TallyValidationDiagnostic[] = [];

  if (tally.id.trim().length === 0) {
    diagnostics.push({
      level: "error",
      code: "tally.id.missing",
      message: "Tally must have a non-empty id.",
      tallyId: tally.id,
    });
  }

  if (tally.name.trim().length === 0) {
    diagnostics.push({
      level: "error",
      code: "tally.name.missing",
      message: "Tally must have a non-empty name.",
      tallyId: tally.id,
    });
  }

  if (tally.entityId.trim().length === 0) {
    diagnostics.push({
      level: "error",
      code: "tally.entity.missing",
      message: `Tally "${tally.name}" must reference an entity.`,
      tallyId: tally.id,
    });
  } else if (existingEntityIds && !existingEntityIds.has(tally.entityId)) {
    diagnostics.push({
      level: "error",
      code: "tally.entity.invalid",
      message: `Tally "${tally.name}" references an entity that does not exist.`,
      tallyId: tally.id,
    });
  }

  if (!tally.enabled) {
    diagnostics.push({
      level: "warning",
      code: "tally.disabled",
      message: `Tally "${tally.name}" is disabled and will not be collected during a run.`,
      tallyId: tally.id,
    });
  }

  return diagnostics;
}

// noinspection JSUnusedGlobalSymbols
export function isTallyReadyForTransport(
  tally: EditorTally,
  existingEntityIds?: ReadonlySet<EntityId>,
): boolean {
  return tally.enabled && validateTally(tally, existingEntityIds).every((diagnostic) => diagnostic.level !== "error");
}

function createEntityTallyBase(options: CreateTallyBaseOptions): EditorEntityTallyBase {
  return {
    id: options.id,
    name: options.name,
    particle: options.particle,
    entityId: options.entityId,
    enabled: options.enabled ?? true,
    tags: options.tags,
  };
}