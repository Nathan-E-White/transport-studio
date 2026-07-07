

import type {
    TransportEntityId,
    TransportRegionID,
    TransportSurfaceID,
} from "./TransportGeometry";
import type { Vec3 } from "@transport/shared";

/**
 * Backend-facing source model.
 *
 * Sources are compiled simulation inputs, not editor widgets. They describe
 * particle kind, energy, strength, and spatial distribution in a plain
 * serializable form that can be consumed by visual, worker, native, or remote
 * backends.
 */

export type TransportSourceId = string;

export type ParticleKind = "photon" | "neutron" | "electron";

export type TransportSourceKind =
    | "point-source"
    | "beam-source"
    | "isotropic-source"
    | "surface-source"
    | "region-source";

export type SourceAngularDistribution =
    | { readonly kind: "isotropic" }
    | { readonly kind: "directional"; readonly direction: Vec3 }
    | { readonly kind: "cone"; readonly axis: Vec3; readonly angleRadians: number };

export type SourceEnergyDistribution =
    | { readonly kind: "monoenergetic"; readonly energyMeV: number }
    | { readonly kind: "discrete"; readonly lines: readonly SourceEnergyLine[] }
    | { readonly kind: "tabular"; readonly energyMeV: readonly number[]; readonly weights: readonly number[] };

export interface SourceEnergyLine {
    readonly energyMeV: number;
    readonly weight: number;
}

export interface TransportSourceBase<K extends TransportSourceKind = TransportSourceKind> {
    readonly id: TransportSourceId;
    readonly kind: K;
    readonly name: string;
    readonly particle: ParticleKind;
    readonly strength: number;
    readonly enabled: boolean;
    readonly energy: SourceEnergyDistribution;
    readonly angular?: SourceAngularDistribution;
    readonly tags?: readonly string[];
}

export interface TransportPointSource extends TransportSourceBase<"point-source"> {
    readonly position: Vec3;

    /** Compatibility convenience for older code/tests. Mirrors energy.kind === monoenergetic. */
    readonly energyMeV: number;
}

export interface TransportBeamSource extends TransportSourceBase<"beam-source"> {
    readonly position: Vec3;
    readonly direction: Vec3;

    /** Compatibility convenience for older code/tests. Mirrors energy.kind === monoenergetic. */
    readonly energyMeV: number;
}

export interface TransportIsotropicSource extends TransportSourceBase<"isotropic-source"> {
    readonly position: Vec3;

    /** Compatibility convenience for older code/tests. Mirrors energy.kind === monoenergetic. */
    readonly energyMeV: number;
}

export interface TransportSurfaceSource extends TransportSourceBase<"surface-source"> {
    readonly surfaceID: TransportSurfaceID;
    readonly distribution: "uniform";
}

export interface TransportRegionSource extends TransportSourceBase<"region-source"> {
    readonly regionID: TransportRegionID;
    readonly distribution: "uniform";
}

export type TransportSource =
    | TransportPointSource
    | TransportBeamSource
    | TransportIsotropicSource
    | TransportSurfaceSource
    | TransportRegionSource;

export interface CreateSourceBaseOptions {
    readonly id: TransportSourceId;
    readonly name: string;
    readonly particle: ParticleKind;
    readonly strength?: number;
    readonly energyMeV?: number;
    readonly energy?: SourceEnergyDistribution;
    readonly angular?: SourceAngularDistribution;
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

export interface CreateSurfaceSourceOptions extends CreateSourceBaseOptions {
    readonly surfaceID?: TransportSurfaceID;
    readonly surfaceId?: TransportSurfaceID;
    readonly distribution?: "uniform";
}

export interface CreateRegionSourceOptions extends CreateSourceBaseOptions {
    readonly regionID?: TransportRegionID;
    readonly regionId?: TransportRegionID;
    readonly distribution?: "uniform";
}

export interface SourceValidationDiagnostic {
    readonly level: "warning" | "error";
    readonly code: string;
    readonly message: string;
    readonly sourceId: TransportSourceId;
}

export function createPointSource(options: CreatePointSourceOptions): TransportPointSource {
    const energy = resolveEnergyDistribution(options);

    return {
        ...createSourceBase(options, "point-source", energy),
        position: options.position,
        energyMeV: getRepresentativeEnergyMeV(energy),
    };
}

export function createBeamSource(options: CreateBeamSourceOptions): TransportBeamSource {
    const energy = resolveEnergyDistribution(options);
    const angular = options.angular ?? { kind: "directional" as const, direction: options.direction };

    return {
        ...createSourceBase({ ...options, angular }, "beam-source", energy),
        position: options.position,
        direction: options.direction,
        energyMeV: getRepresentativeEnergyMeV(energy),
    };
}

export function createIsotropicSource(options: CreateIsotropicSourceOptions): TransportIsotropicSource {
    const energy = resolveEnergyDistribution(options);
    const angular = options.angular ?? { kind: "isotropic" as const };

    return {
        ...createSourceBase({ ...options, angular }, "isotropic-source", energy),
        position: options.position,
        energyMeV: getRepresentativeEnergyMeV(energy),
    };
}

export function createSurfaceSource(options: CreateSurfaceSourceOptions): TransportSurfaceSource {
    const energy = resolveEnergyDistribution(options);

    return {
        ...createSourceBase(options, "surface-source", energy),
        surfaceID: options.surfaceID ?? options.surfaceId ?? "",
        distribution: options.distribution ?? "uniform",
    };
}

export function createRegionSource(options: CreateRegionSourceOptions): TransportRegionSource {
    const energy = resolveEnergyDistribution(options);

    return {
        ...createSourceBase(options, "region-source", energy),
        regionID: options.regionID ?? options.regionId ?? "",
        distribution: options.distribution ?? "uniform",
    };
}

export function isPointSource(source: TransportSource): source is TransportPointSource {
    return source.kind === "point-source";
}

export function isBeamSource(source: TransportSource): source is TransportBeamSource {
    return source.kind === "beam-source";
}

export function isIsotropicSource(source: TransportSource): source is TransportIsotropicSource {
    return source.kind === "isotropic-source";
}

export function isSurfaceSource(source: TransportSource): source is TransportSurfaceSource {
    return source.kind === "surface-source";
}

export function isRegionSource(source: TransportSource): source is TransportRegionSource {
    return source.kind === "region-source";
}

export function getSourceID(source: TransportSource): TransportSourceId {
    return source.id;
}

export function getSourceIDs(sources: readonly TransportSource[]): readonly TransportSourceId[] {
    return sources.map((source) => source.id);
}

export function getSourceIds(sources: readonly TransportSource[]): readonly TransportSourceId[] {
    return getSourceIDs(sources);
}

export function getSourceLabel(source: TransportSource): string {
    switch (source.kind) {
        case "point-source":
            return `Point Source: ${source.name}`;
        case "beam-source":
            return `Beam Source: ${source.name}`;
        case "isotropic-source":
            return `Isotropic Source: ${source.name}`;
        case "surface-source":
            return `Surface Source: ${source.name}`;
        case "region-source":
            return `Region Source: ${source.name}`;
    }
}

export function getSourceStrength(source: TransportSource): number {
    return source.strength;
}

export function isSourceEnabled(source: TransportSource): boolean {
    return source.enabled;
}

export function getRepresentativeEnergyMeV(energy: SourceEnergyDistribution): number {
    switch (energy.kind) {
        case "monoenergetic":
            return energy.energyMeV;
        case "discrete":
            return energy.lines[0]?.energyMeV ?? Number.NaN;
        case "tabular":
            return energy.energyMeV[0] ?? Number.NaN;
    }
}

export function normalizeDirection(direction: Vec3): Vec3 {
    const magnitude = vectorMagnitude(direction);

    if (!Number.isFinite(magnitude) || magnitude === 0) {
        return direction;
    }

    return {
        x: direction.x / magnitude,
        y: direction.y / magnitude,
        z: direction.z / magnitude,
    };
}

export function validateSource(source: TransportSource): readonly SourceValidationDiagnostic[] {
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

    if (!Number.isFinite(source.strength) || source.strength < 0) {
        diagnostics.push({
            level: "error",
            code: "source.strength.invalid",
            message: `Source "${source.name}" strength must be finite and non-negative.`,
            sourceId: source.id,
        });
    }

    diagnostics.push(...validateEnergyDistribution(source));
    diagnostics.push(...validateAngularDistribution(source));

    switch (source.kind) {
        case "point-source":
        case "isotropic-source":
            if (!isValidVec3(source.position)) {
                diagnostics.push({
                    level: "error",
                    code: "source.position.invalid",
                    message: `Source "${source.name}" has an invalid position.`,
                    sourceId: source.id,
                });
            }
            break;
        case "beam-source":
            if (!isValidVec3(source.position)) {
                diagnostics.push({
                    level: "error",
                    code: "source.position.invalid",
                    message: `Beam source "${source.name}" has an invalid position.`,
                    sourceId: source.id,
                });
            }
            if (!isValidVec3(source.direction) || vectorMagnitude(source.direction) === 0) {
                diagnostics.push({
                    level: "error",
                    code: "source.direction.invalid",
                    message: `Beam source "${source.name}" must have a finite, non-zero direction.`,
                    sourceId: source.id,
                });
            }
            break;
        case "surface-source":
            if (source.surfaceID.trim().length === 0) {
                diagnostics.push({
                    level: "error",
                    code: "source.surface.missing",
                    message: `Surface source "${source.name}" must reference a surface.`,
                    sourceId: source.id,
                });
            }
            break;
        case "region-source":
            if (source.regionID.trim().length === 0) {
                diagnostics.push({
                    level: "error",
                    code: "source.region.missing",
                    message: `Region source "${source.name}" must reference a region.`,
                    sourceId: source.id,
                });
            }
            break;
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

export function isSourceReadyForTransport(source: TransportSource): boolean {
    return source.enabled && validateSource(source).every((diagnostic) => diagnostic.level !== "error");
}

function createSourceBase<K extends TransportSourceKind>(
    options: CreateSourceBaseOptions,
    kind: K,
    energy: SourceEnergyDistribution,
): TransportSourceBase<K> {
    return {
        id: options.id,
        kind,
        name: options.name,
        particle: options.particle,
        strength: options.strength ?? 1,
        enabled: options.enabled ?? true,
        energy,
        angular: options.angular,
        tags: options.tags,
    };
}

function resolveEnergyDistribution(options: CreateSourceBaseOptions): SourceEnergyDistribution {
    if (options.energy) {
        return options.energy;
    }

    return {
        kind: "monoenergetic",
        energyMeV: options.energyMeV ?? 1,
    };
}

function validateEnergyDistribution(source: TransportSource): readonly SourceValidationDiagnostic[] {
    const diagnostics: SourceValidationDiagnostic[] = [];

    switch (source.energy.kind) {
        case "monoenergetic":
            if (!isPositiveFinite(source.energy.energyMeV)) {
                diagnostics.push({
                    level: "error",
                    code: "source.energy.invalid",
                    message: `Source "${source.name}" must have a positive finite energy in MeV.`,
                    sourceId: source.id,
                });
            }
            break;
        case "discrete":
            if (source.energy.lines.length === 0) {
                diagnostics.push({
                    level: "error",
                    code: "source.energy.discrete.empty",
                    message: `Source "${source.name}" discrete energy distribution must contain at least one line.`,
                    sourceId: source.id,
                });
            }
            for (const line of source.energy.lines) {
                if (!isPositiveFinite(line.energyMeV) || !isNonNegativeFinite(line.weight)) {
                    diagnostics.push({
                        level: "error",
                        code: "source.energy.discrete.line.invalid",
                        message: `Source "${source.name}" contains an invalid discrete energy line.`,
                        sourceId: source.id,
                    });
                }
            }
            if (source.energy.lines.length > 0 && source.energy.lines.reduce((sum, line) => sum + line.weight, 0) <= 0) {
                diagnostics.push({
                    level: "error",
                    code: "source.energy.discrete.weight_total.invalid",
                    message: `Source "${source.name}" discrete energy line weights must sum to a positive value.`,
                    sourceId: source.id,
                });
            }
            break;
        case "tabular":
            if (source.energy.energyMeV.length === 0 || source.energy.energyMeV.length !== source.energy.weights.length) {
                diagnostics.push({
                    level: "error",
                    code: "source.energy.tabular.shape.invalid",
                    message: `Source "${source.name}" tabular energy distribution must have matching non-empty energy and weight arrays.`,
                    sourceId: source.id,
                });
            }
            for (let index = 0; index < source.energy.energyMeV.length; index += 1) {
                if (!isPositiveFinite(source.energy.energyMeV[index]) || !isNonNegativeFinite(source.energy.weights[index])) {
                    diagnostics.push({
                        level: "error",
                        code: "source.energy.tabular.entry.invalid",
                        message: `Source "${source.name}" contains an invalid tabular energy entry.`,
                        sourceId: source.id,
                    });
                }
            }
            if (source.energy.weights.length > 0 && source.energy.weights.reduce((sum, weight) => sum + weight, 0) <= 0) {
                diagnostics.push({
                    level: "error",
                    code: "source.energy.tabular.weight_total.invalid",
                    message: `Source "${source.name}" tabular energy weights must sum to a positive value.`,
                    sourceId: source.id,
                });
            }
            break;
    }

    return diagnostics;
}

function validateAngularDistribution(source: TransportSource): readonly SourceValidationDiagnostic[] {
    const diagnostics: SourceValidationDiagnostic[] = [];

    if (!source.angular) {
        return diagnostics;
    }

    switch (source.angular.kind) {
        case "isotropic":
            break;
        case "directional":
            if (!isValidVec3(source.angular.direction) || vectorMagnitude(source.angular.direction) === 0) {
                diagnostics.push({
                    level: "error",
                    code: "source.angular.direction.invalid",
                    message: `Source "${source.name}" angular direction must be finite and non-zero.`,
                    sourceId: source.id,
                });
            }
            break;
        case "cone":
            if (!isValidVec3(source.angular.axis) || vectorMagnitude(source.angular.axis) === 0 || !isPositiveFinite(source.angular.angleRadians)) {
                diagnostics.push({
                    level: "error",
                    code: "source.angular.cone.invalid",
                    message: `Source "${source.name}" cone angular distribution must have a valid axis and positive angle.`,
                    sourceId: source.id,
                });
            }
            break;
    }

    return diagnostics;
}

function isValidVec3(value: Vec3): boolean {
    return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function vectorMagnitude(value: Vec3): number {
    return Math.sqrt(value.x * value.x + value.y * value.y + value.z * value.z);
}

function isPositiveFinite(value: number): boolean {
    return Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: number): boolean {
    return Number.isFinite(value) && value >= 0;
}