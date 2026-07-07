

import type {
    TransportEntityId,
    TransportRegionID,
    TransportSurfaceID,
} from "./TransportGeometry";

/**
 * Backend-facing tally model.
 *
 * Tallies are compiled simulation requests, not editor overlays. They describe
 * what response should be accumulated and where it should be measured. Render
 * overlays, chart state, panel expansion, and sampled-track visualization state
 * do not belong here.
 */

export type TransportTallyId = string;

export type ParticleKind = "photon" | "neutron" | "electron";

export type TransportTallyKind =
    | "cell-flux"
    | "surface-current"
    | "track-length"
    | "pulse-height"
    | "surface-flux"
    | "region-dose";

export type TallyTarget =
    | { readonly kind: "entity"; readonly entityId: TransportEntityId }
    | { readonly kind: "surface"; readonly surfaceID: TransportSurfaceID }
    | { readonly kind: "region"; readonly regionID: TransportRegionID };

export type TallyResponse =
    | "flux"
    | "current"
    | "track-length"
    | "pulse-height"
    | "dose"
    | "count";

export interface EnergyBin {
    readonly minMeV: number;
    readonly maxMeV: number;
}

export interface TransportTallyBase<K extends TransportTallyKind = TransportTallyKind> {
    readonly id: TransportTallyId;
    readonly kind: K;
    readonly name: string;
    readonly particle: ParticleKind;
    readonly target: TallyTarget;
    readonly response: TallyResponse;
    readonly enabled: boolean;
    readonly energyBins?: readonly EnergyBin[];
    readonly tags?: readonly string[];
}

export interface TransportCellFluxTally extends TransportTallyBase<"cell-flux"> {
    readonly target: { readonly kind: "entity"; readonly entityId: TransportEntityId };

    /** Compatibility convenience for older code/tests. Mirrors target.entityId. */
    readonly entityId: TransportEntityId;
}

export interface TransportSurfaceCurrentTally extends TransportTallyBase<"surface-current"> {
    readonly target: { readonly kind: "surface"; readonly surfaceID: TransportSurfaceID };

    /** Compatibility convenience for older code/tests. Mirrors target.surfaceID. */
    readonly surfaceID: TransportSurfaceID;
}

export interface TransportTrackLengthTally extends TransportTallyBase<"track-length"> {
    readonly target: { readonly kind: "entity"; readonly entityId: TransportEntityId };

    /** Compatibility convenience for older code/tests. Mirrors target.entityId. */
    readonly entityId: TransportEntityId;
}

export interface TransportPulseHeightTally extends TransportTallyBase<"pulse-height"> {
    readonly target: { readonly kind: "entity"; readonly entityId: TransportEntityId };

    /** Compatibility convenience for older code/tests. Mirrors target.entityId. */
    readonly entityId: TransportEntityId;
}

export interface TransportSurfaceFluxTally extends TransportTallyBase<"surface-flux"> {
    readonly target: { readonly kind: "surface"; readonly surfaceID: TransportSurfaceID };

    /** Compatibility convenience for older code/tests. Mirrors target.surfaceID. */
    readonly surfaceID: TransportSurfaceID;
}

export interface TransportRegionDoseTally extends TransportTallyBase<"region-dose"> {
    readonly target: { readonly kind: "region"; readonly regionID: TransportRegionID };

    /** Compatibility convenience for older code/tests. Mirrors target.regionID. */
    readonly regionID: TransportRegionID;
}

export type TransportTally =
    | TransportCellFluxTally
    | TransportSurfaceCurrentTally
    | TransportTrackLengthTally
    | TransportPulseHeightTally
    | TransportSurfaceFluxTally
    | TransportRegionDoseTally;

export interface CreateTallyBaseOptions {
    readonly id: TransportTallyId;
    readonly name: string;
    readonly particle: ParticleKind;
    readonly enabled?: boolean;
    readonly energyBins?: readonly EnergyBin[];
    readonly tags?: readonly string[];
}

export interface CreateEntityTallyOptions extends CreateTallyBaseOptions {
    readonly entityId: TransportEntityId;
}

export interface CreateSurfaceTallyOptions extends CreateTallyBaseOptions {
    readonly surfaceID?: TransportSurfaceID;
    readonly surfaceId?: TransportSurfaceID;
}

export interface CreateRegionTallyOptions extends CreateTallyBaseOptions {
    readonly regionID?: TransportRegionID;
    readonly regionId?: TransportRegionID;
}

export interface TallyValidationDiagnostic {
    readonly level: "warning" | "error";
    readonly code: string;
    readonly message: string;
    readonly tallyId: TransportTallyId;
}

export interface TallyValidationContext {
    readonly entityIds?: ReadonlySet<TransportEntityId>;
    readonly surfaceIds?: ReadonlySet<TransportSurfaceID>;
    readonly regionIds?: ReadonlySet<TransportRegionID>;
}

export function createCellFluxTally(options: CreateEntityTallyOptions): TransportCellFluxTally {
    return <TransportCellFluxTally>{
        ...createTallyBase(options, "cell-flux", {kind: "entity", entityId: options.entityId}, "flux"),
        entityId: options.entityId,
    };
}

export function createTrackLengthTally(options: CreateEntityTallyOptions): TransportTrackLengthTally {
    return <TransportTrackLengthTally>{
        ...createTallyBase(options, "track-length", {kind: "entity", entityId: options.entityId}, "track-length"),
        entityId: options.entityId,
    };
}

export function createPulseHeightTally(options: CreateEntityTallyOptions): TransportPulseHeightTally {
    return <TransportPulseHeightTally>{
        ...createTallyBase(options, "pulse-height", {kind: "entity", entityId: options.entityId}, "pulse-height"),
        entityId: options.entityId,
    };
}

export function createSurfaceCurrentTally(options: CreateSurfaceTallyOptions): TransportSurfaceCurrentTally {
    const surfaceID = options.surfaceID ?? options.surfaceId ?? "";

    return <TransportSurfaceCurrentTally>{
        ...createTallyBase(options, "surface-current", {kind: "surface", surfaceID}, "current"),
        surfaceID,
    };
}

export function createSurfaceFluxTally(options: CreateSurfaceTallyOptions): TransportSurfaceFluxTally {
    const surfaceID = options.surfaceID ?? options.surfaceId ?? "";

    return <TransportSurfaceFluxTally>{
        ...createTallyBase(options, "surface-flux", {kind: "surface", surfaceID}, "flux"),
        surfaceID,
    };
}

export function createRegionDoseTally(options: CreateRegionTallyOptions): TransportRegionDoseTally {
    const regionID = options.regionID ?? options.regionId ?? "";

    return <TransportRegionDoseTally>{
        ...createTallyBase(options, "region-dose", {kind: "region", regionID}, "dose"),
        regionID,
    };
}

export function isCellFluxTally(tally: TransportTally): tally is TransportCellFluxTally {
    return tally.kind === "cell-flux";
}

export function isSurfaceCurrentTally(tally: TransportTally): tally is TransportSurfaceCurrentTally {
    return tally.kind === "surface-current";
}

export function isTrackLengthTally(tally: TransportTally): tally is TransportTrackLengthTally {
    return tally.kind === "track-length";
}

export function isPulseHeightTally(tally: TransportTally): tally is TransportPulseHeightTally {
    return tally.kind === "pulse-height";
}

export function isSurfaceFluxTally(tally: TransportTally): tally is TransportSurfaceFluxTally {
    return tally.kind === "surface-flux";
}

export function isRegionDoseTally(tally: TransportTally): tally is TransportRegionDoseTally {
    return tally.kind === "region-dose";
}

export function getTallyID(tally: TransportTally): TransportTallyId {
    return tally.id;
}

export function getTallyIDs(tallies: readonly TransportTally[]): readonly TransportTallyId[] {
    return tallies.map((tally) => tally.id);
}

export function getTallyIds(tallies: readonly TransportTally[]): readonly TransportTallyId[] {
    return getTallyIDs(tallies);
}

export function getTallyLabel(tally: TransportTally): string {
    switch (tally.kind) {
        case "cell-flux":
            return `Cell Flux Tally: ${tally.name}`;
        case "surface-current":
            return `Surface Current Tally: ${tally.name}`;
        case "track-length":
            return `Track Length Tally: ${tally.name}`;
        case "pulse-height":
            return `Pulse Height Tally: ${tally.name}`;
        case "surface-flux":
            return `Surface Flux Tally: ${tally.name}`;
        case "region-dose":
            return `Region Dose Tally: ${tally.name}`;
    }
}

export function isTallyEnabled(tally: TransportTally): boolean {
    return tally.enabled;
}

export function getTallyTarget(tally: TransportTally): TallyTarget {
    return tally.target;
}

export function referencesEntity(tally: TransportTally, entityId: TransportEntityId): boolean {
    return tally.target.kind === "entity" && tally.target.entityId === entityId;
}

export function referencesSurface(tally: TransportTally, surfaceID: TransportSurfaceID): boolean {
    return tally.target.kind === "surface" && tally.target.surfaceID === surfaceID;
}

export function referencesRegion(tally: TransportTally, regionID: TransportRegionID): boolean {
    return tally.target.kind === "region" && tally.target.regionID === regionID;
}

export function validateTally(
    tally: TransportTally,
    context: TallyValidationContext = {},
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

    diagnostics.push(...validateTallyTarget(tally, context));
    diagnostics.push(...validateEnergyBins(tally));

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

export function isTallyReadyForTransport(
    tally: TransportTally,
    context: TallyValidationContext = {},
): boolean {
    return tally.enabled && validateTally(tally, context).every((diagnostic) => diagnostic.level !== "error");
}

function createTallyBase<K extends TransportTallyKind>(
    options: CreateTallyBaseOptions,
    kind: K,
    target: TallyTarget,
    response: TallyResponse,
): TransportTallyBase<K> {
    return {
        id: options.id,
        kind,
        name: options.name,
        particle: options.particle,
        target,
        response,
        enabled: options.enabled ?? true,
        energyBins: options.energyBins,
        tags: options.tags,
    };
}

function validateTallyTarget(
    tally: TransportTally,
    context: TallyValidationContext,
): readonly TallyValidationDiagnostic[] {
    const diagnostics: TallyValidationDiagnostic[] = [];

    switch (tally.target.kind) {
        case "entity":
            if (tally.target.entityId.trim().length === 0) {
                diagnostics.push({
                    level: "error",
                    code: "tally.entity.missing",
                    message: `Tally "${tally.name}" must reference an entity.`,
                    tallyId: tally.id,
                });
            } else if (context.entityIds && !context.entityIds.has(tally.target.entityId)) {
                diagnostics.push({
                    level: "error",
                    code: "tally.entity.invalid",
                    message: `Tally "${tally.name}" references an entity that does not exist.`,
                    tallyId: tally.id,
                });
            }
            break;
        case "surface":
            if (tally.target.surfaceID.trim().length === 0) {
                diagnostics.push({
                    level: "error",
                    code: "tally.surface.missing",
                    message: `Tally "${tally.name}" must reference a surface.`,
                    tallyId: tally.id,
                });
            } else if (context.surfaceIds && !context.surfaceIds.has(tally.target.surfaceID)) {
                diagnostics.push({
                    level: "error",
                    code: "tally.surface.invalid",
                    message: `Tally "${tally.name}" references a surface that does not exist.`,
                    tallyId: tally.id,
                });
            }
            break;
        case "region":
            if (tally.target.regionID.trim().length === 0) {
                diagnostics.push({
                    level: "error",
                    code: "tally.region.missing",
                    message: `Tally "${tally.name}" must reference a region.`,
                    tallyId: tally.id,
                });
            } else if (context.regionIds && !context.regionIds.has(tally.target.regionID)) {
                diagnostics.push({
                    level: "error",
                    code: "tally.region.invalid",
                    message: `Tally "${tally.name}" references a region that does not exist.`,
                    tallyId: tally.id,
                });
            }
            break;
    }

    return diagnostics;
}

function validateEnergyBins(tally: TransportTally): readonly TallyValidationDiagnostic[] {
    const diagnostics: TallyValidationDiagnostic[] = [];

    for (const bin of tally.energyBins ?? []) {
        if (!Number.isFinite(bin.minMeV) || !Number.isFinite(bin.maxMeV) || bin.minMeV < 0 || bin.maxMeV <= bin.minMeV) {
            diagnostics.push({
                level: "error",
                code: "tally.energy_bin.invalid",
                message: `Tally "${tally.name}" contains an invalid energy bin.`,
                tallyId: tally.id,
            });
        }
    }

    return diagnostics;
}