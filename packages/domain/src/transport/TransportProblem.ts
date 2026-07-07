import type { TransportGeometry } from "./TransportGeometry";
import type { TransportMaterial } from "./TransportMaterial";
import type { TransportSource } from "./TransportSource";
import type { TransportTally } from "./TransportTally";

/**
 * Backend-facing compiled simulation problem.
 *
 * A TransportProblem is not the editable scene and not the render scene.
 * It is the validated, serializable input envelope consumed by transport
 * backends. Editor-only concerns such as selection, panels, viewport state,
 * Three.js objects, gizmos, and partial draft edits do not belong here.
 */

export type TransportProblemId = string;
export type TransportRunId = string;
export type TransportBackendId = string;

export type ParticleKind = "photon" | "neutron" | "electron";

export type TransportProblemStatus = "draft" | "validated" | "compiled";

export interface TransportProblem {
    readonly id: TransportProblemId;
    readonly name: string;
    readonly status: TransportProblemStatus;

    readonly geometry: TransportGeometry;
    readonly materials: readonly TransportMaterial[];
    readonly sources: readonly TransportSource[];
    readonly tallies: readonly TransportTally[];
    readonly settings: TransportRunSettings;

    readonly metadata?: TransportProblemMetadata;
}

export interface TransportProblemMetadata {
    readonly description?: string;
    readonly createdAt?: string;
    readonly updatedAt?: string;
    readonly sourceSceneId?: string;
    readonly compilerVersion?: string;
    readonly targetBackendId?: TransportBackendId;
    readonly tags?: readonly string[];
}

export interface TransportRunSettings {
    readonly histories: number;
    readonly seed: number;
    readonly particles?: readonly ParticleKind[];
    readonly maxStepsPerHistory?: number;
    readonly energyCutoffMeV?: Partial<Record<ParticleKind, number>>;
    readonly timeLimitSeconds?: number;
}

export interface CreateTransportProblemOptions {
    readonly id: TransportProblemId;
    readonly name: string;
    readonly status?: TransportProblemStatus;
    readonly geometry: TransportGeometry;
    readonly materials?: readonly TransportMaterial[];
    readonly sources?: readonly TransportSource[];
    readonly tallies?: readonly TransportTally[];
    readonly settings?: Partial<TransportRunSettings>;
    readonly metadata?: TransportProblemMetadata;
}

export interface TransportProblemValidationDiagnostic {
    readonly level: "warning" | "error";
    readonly code: string;
    readonly message: string;
    readonly problemId?: TransportProblemId;
    readonly entityId?: string;
    readonly surfaceId?: string;
    readonly regionId?: string;
    readonly materialId?: string;
    readonly sourceId?: string;
    readonly tallyId?: string;
}

export interface TransportProblemSummary {
    readonly id: TransportProblemId;
    readonly name: string;
    readonly status: TransportProblemStatus;
    readonly entityCount: number;
    readonly surfaceCount: number;
    readonly regionCount: number;
    readonly materialCount: number;
    readonly sourceCount: number;
    readonly tallyCount: number;
    readonly histories: number;
}

export const DEFAULT_TRANSPORT_RUN_SETTINGS: TransportRunSettings = {
    histories: 1_000,
    seed: 1,
    particles: ["photon"],
};

export function createTransportProblem(options: CreateTransportProblemOptions): TransportProblem {
    return {
        id: options.id,
        name: options.name,
        status: options.status ?? "draft",
        geometry: options.geometry,
        materials: options.materials ?? [],
        sources: options.sources ?? [],
        tallies: options.tallies ?? [],
        settings: {
            ...DEFAULT_TRANSPORT_RUN_SETTINGS,
            ...options.settings,
        },
        metadata: options.metadata,
    };
}

export function getTransportProblemSummary(problem: TransportProblem): TransportProblemSummary {
    return {
        id: problem.id,
        name: problem.name,
        status: problem.status,
        entityCount: problem.geometry.entities.length,
        surfaceCount: problem.geometry.surfaces.length,
        regionCount: problem.geometry.regions.length,
        materialCount: problem.materials.length,
        sourceCount: problem.sources.length,
        tallyCount: problem.tallies.length,
        histories: problem.settings.histories,
    };
}

export function getMaterialIds(problem: TransportProblem): readonly string[] {
    return problem.materials.map((material) => material.id);
}

export function hasMaterial(problem: TransportProblem, materialId: string): boolean {
    return problem.materials.some((material) => material.id === materialId);
}

export function findMaterial(problem: TransportProblem, materialId: string): TransportMaterial | undefined {
    return problem.materials.find((material) => material.id === materialId);
}

export function getSourceIds(problem: TransportProblem): readonly string[] {
    return problem.sources.map((source) => source.id);
}

export function hasSource(problem: TransportProblem, sourceId: string): boolean {
    return problem.sources.some((source) => source.id === sourceId);
}

export function findSource(problem: TransportProblem, sourceId: string): TransportSource | undefined {
    return problem.sources.find((source) => source.id === sourceId);
}

export function getTallyIds(problem: TransportProblem): readonly string[] {
    return problem.tallies.map((tally) => tally.id);
}

export function hasTally(problem: TransportProblem, tallyId: string): boolean {
    return problem.tallies.some((tally) => tally.id === tallyId);
}

export function findTally(problem: TransportProblem, tallyId: string): TransportTally | undefined {
    return problem.tallies.find((tally) => tally.id === tallyId);
}

export function validateTransportProblem(problem: TransportProblem): readonly TransportProblemValidationDiagnostic[] {
    const diagnostics: TransportProblemValidationDiagnostic[] = [];

    if (problem.id.trim().length === 0) {
        diagnostics.push({
            level: "error",
            code: "problem.id.missing",
            message: "Transport problem must have a non-empty id.",
            problemId: problem.id,
        });
    }

    if (problem.name.trim().length === 0) {
        diagnostics.push({
            level: "error",
            code: "problem.name.missing",
            message: "Transport problem must have a non-empty name.",
            problemId: problem.id,
        });
    }

    diagnostics.push(...validateRunSettings(problem));
    diagnostics.push(...validateDuplicateIds(problem));
    diagnostics.push(...validateMaterialReferences(problem));

    if (problem.sources.length === 0) {
        diagnostics.push({
            level: "warning",
            code: "problem.sources.empty",
            message: `Transport problem "${problem.name}" does not define any sources.`,
            problemId: problem.id,
        });
    }

    if (problem.tallies.length === 0) {
        diagnostics.push({
            level: "warning",
            code: "problem.tallies.empty",
            message: `Transport problem "${problem.name}" does not define any tallies.`,
            problemId: problem.id,
        });
    }

    return diagnostics;
}

export function isTransportProblemReady(problem: TransportProblem): boolean {
    return validateTransportProblem(problem).every((diagnostic) => diagnostic.level !== "error");
}

export function markTransportProblemValidated(problem: TransportProblem): TransportProblem {
    return {
        ...problem,
        status: "validated",
    };
}

export function markTransportProblemCompiled(
    problem: TransportProblem,
    targetBackendId?: TransportBackendId,
): TransportProblem {
    return {
        ...problem,
        status: "compiled",
        metadata: {
            ...problem.metadata,
            targetBackendId: targetBackendId ?? problem.metadata?.targetBackendId,
        },
    };
}

function validateRunSettings(problem: TransportProblem): readonly TransportProblemValidationDiagnostic[] {
    const diagnostics: TransportProblemValidationDiagnostic[] = [];
    const {settings} = problem;

    if (!Number.isInteger(settings.histories) || settings.histories <= 0) {
        diagnostics.push({
            level: "error",
            code: "problem.settings.histories.invalid",
            message: "Run settings must specify a positive integer number of histories.",
            problemId: problem.id,
        });
    }

    if (!Number.isInteger(settings.seed) || settings.seed <= 0) {
        diagnostics.push({
            level: "error",
            code: "problem.settings.seed.invalid",
            message: "Run settings must specify a positive integer seed.",
            problemId: problem.id,
        });
    }

    if (settings.maxStepsPerHistory !== undefined
        && (!Number.isInteger(settings.maxStepsPerHistory) || settings.maxStepsPerHistory <= 0)) {
        diagnostics.push({
            level: "error",
            code: "problem.settings.max_steps.invalid",
            message: "Maximum steps per history must be a positive integer when provided.",
            problemId: problem.id,
        });
    }

    if (settings.timeLimitSeconds !== undefined
        && (!Number.isFinite(settings.timeLimitSeconds) || settings.timeLimitSeconds <= 0)) {
        diagnostics.push({
            level: "error",
            code: "problem.settings.time_limit.invalid",
            message: "Time limit must be finite and positive when provided.",
            problemId: problem.id,
        });
    }

    const energyCutoffMeV = settings.energyCutoffMeV ?? {};

    for (const particle of Object.keys(energyCutoffMeV) as ParticleKind[]) {
        const cutoff = energyCutoffMeV[particle];

        if (cutoff === undefined) {
            continue;
        }

        if (!Number.isFinite(cutoff) || cutoff < 0) {
            diagnostics.push({
                level: "error",
                code: "problem.settings.energy_cutoff.invalid",
                message: `Energy cutoff for ${particle} must be finite and non-negative.`,
                problemId: problem.id,
            });
        }
    }

    return diagnostics;
}

function validateDuplicateIds(problem: TransportProblem): readonly TransportProblemValidationDiagnostic[] {
    return [
        ...duplicateMaterialDiagnostics(problem.id, problem.materials.map((material) => material.id)),
        ...duplicateSourceDiagnostics(problem.id, problem.sources.map((source) => source.id)),
        ...duplicateTallyDiagnostics(problem.id, problem.tallies.map((tally) => tally.id)),
    ];
}

function duplicateMaterialDiagnostics(
    problemId: TransportProblemId,
    ids: readonly string[],
): readonly TransportProblemValidationDiagnostic[] {
    return duplicateDiagnostics(problemId, ids, (id) => ({
        level: "error",
        code: "problem.material.id.duplicate",
        message: `Duplicate material id "${id}" found in transport problem.`,
        problemId,
        materialId: id,
    }));
}

function duplicateSourceDiagnostics(
    problemId: TransportProblemId,
    ids: readonly string[],
): readonly TransportProblemValidationDiagnostic[] {
    return duplicateDiagnostics(problemId, ids, (id) => ({
        level: "error",
        code: "problem.source.id.duplicate",
        message: `Duplicate source id "${id}" found in transport problem.`,
        problemId,
        sourceId: id,
    }));
}

function duplicateTallyDiagnostics(
    problemId: TransportProblemId,
    ids: readonly string[],
): readonly TransportProblemValidationDiagnostic[] {
    return duplicateDiagnostics(problemId, ids, (id) => ({
        level: "error",
        code: "problem.tally.id.duplicate",
        message: `Duplicate tally id "${id}" found in transport problem.`,
        problemId,
        tallyId: id,
    }));
}

function duplicateDiagnostics(
    _problemId: TransportProblemId,
    ids: readonly string[],
    createDiagnostic: (id: string) => TransportProblemValidationDiagnostic,
): readonly TransportProblemValidationDiagnostic[] {
    const diagnostics: TransportProblemValidationDiagnostic[] = [];
    const seen = new Set<string>();
    const reported = new Set<string>();

    for (const id of ids) {
        if (!seen.has(id)) {
            seen.add(id);
            continue;
        }

        if (reported.has(id)) {
            continue;
        }

        diagnostics.push(createDiagnostic(id));
        reported.add(id);
    }

    return diagnostics;
}

function validateMaterialReferences(problem: TransportProblem): readonly TransportProblemValidationDiagnostic[] {
    const diagnostics: TransportProblemValidationDiagnostic[] = [];
    const materialIds = new Set(problem.materials.map((material) => material.id));

    for (const entity of problem.geometry.entities) {
        const materialId = getEntityMaterialId(entity);

        if (materialId === undefined || materialId.length === 0 || materialIds.has(materialId)) {
            continue;
        }

        diagnostics.push({
            level: "error",
            code: "problem.geometry.entity.material.invalid",
            message: `Geometry entity "${entity.name}" references missing material "${materialId}".`,
            problemId: problem.id,
            entityId: entity.id,
            materialId,
        });
    }

    for (const region of problem.geometry.regions) {
        const materialId = getRegionMaterialId(region);

        if (materialId === undefined || materialId.length === 0 || materialIds.has(materialId)) {
            continue;
        }

        diagnostics.push({
            level: "error",
            code: "problem.geometry.region.material.invalid",
            message: `Geometry region "${region.name}" references missing material "${materialId}".`,
            problemId: problem.id,
            regionId: region.id,
            materialId,
        });
    }

    return diagnostics;
}

function getEntityMaterialId(entity: TransportGeometry["entities"][number]): string | undefined {
    if ("materialId" in entity && typeof entity.materialId === "string") {
        return entity.materialId;
    }

    if ("materialID" in entity && typeof entity.materialID === "string") {
        return entity.materialID;
    }

    return undefined;
}

function getRegionMaterialId(region: TransportGeometry["regions"][number]): string | undefined {
    if ("materialId" in region && typeof region.materialId === "string") {
        return region.materialId;
    }

    if ("materialID" in region && typeof region.materialID === "string") {
        return region.materialID;
    }

    return undefined;
}