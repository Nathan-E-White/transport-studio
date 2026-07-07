

/**
 * Backend-facing material model.
 *
 * Materials are deliberately plain serializable data. They are referenced by
 * transport geometry regions/entities and consumed by compiled simulation
 * problems. UI-only concerns such as inspector expansion state, selected rows,
 * color palette state, or editor widgets do not belong here.
 */

export type TransportMaterialId = string;

export type NuclideId = string;

export type FractionBasis = "atom" | "weight";

export interface TransportNuclideFraction {
    readonly nuclide: NuclideId;
    readonly fraction: number;
    readonly basis: FractionBasis;
}

export interface TransportMaterial {
    readonly id: TransportMaterialId;
    readonly name: string;

    /** Density in g/cm^3. Use zero for void. */
    readonly density: number;

    /** Nuclide composition. Empty composition is allowed only for void. */
    readonly nuclides: readonly TransportNuclideFraction[];

    /** Optional display hint for editor/render layers. Not physically meaningful. */
    readonly color?: string;

    readonly description?: string;
    readonly tags?: readonly string[];
}

export interface CreateTransportMaterialOptions {
    readonly id: TransportMaterialId;
    readonly name: string;
    readonly density: number;
    readonly nuclides?: readonly TransportNuclideFraction[];
    readonly color?: string;
    readonly description?: string;
    readonly tags?: readonly string[];
}

export interface MaterialValidationDiagnostic {
    readonly level: "warning" | "error";
    readonly code: string;
    readonly message: string;
    readonly materialId: TransportMaterialId;
}

export function createTransportMaterial(options: CreateTransportMaterialOptions): TransportMaterial {
    return {
        id: options.id,
        name: options.name,
        density: options.density,
        nuclides: options.nuclides ?? [],
        color: options.color,
        description: options.description,
        tags: options.tags,
    };
}

export function createVoidMaterial(
    id: TransportMaterialId = "mat-void",
    name = "Void",
): TransportMaterial {
    return createTransportMaterial({
        id,
        name,
        density: 0,
        nuclides: [],
        color: "#111827",
        description: "Zero-density void material.",
        tags: ["void"],
    });
}

export function createWaterMaterial(id: TransportMaterialId = "mat-water"): TransportMaterial {
    return createTransportMaterial({
        id,
        name: "Water",
        density: 1,
        color: "#38bdf8",
        nuclides: [
            { nuclide: "H1", fraction: 2, basis: "atom" },
            { nuclide: "O16", fraction: 1, basis: "atom" },
        ],
        tags: ["moderator", "shielding"],
    });
}

export function createAirMaterial(id: TransportMaterialId = "mat-air"): TransportMaterial {
    return createTransportMaterial({
        id,
        name: "Air",
        density: 0.001225,
        color: "#e0f2fe",
        nuclides: [
            { nuclide: "N14", fraction: 0.78084, basis: "atom" },
            { nuclide: "O16", fraction: 0.20946, basis: "atom" },
            { nuclide: "Ar40", fraction: 0.00934, basis: "atom" },
            { nuclide: "C12", fraction: 0.00036, basis: "atom" },
        ],
        tags: ["gas"],
    });
}

export function createLeadMaterial(id: TransportMaterialId = "mat-lead"): TransportMaterial {
    return createTransportMaterial({
        id,
        name: "Lead",
        density: 11.34,
        color: "#64748b",
        nuclides: [{ nuclide: "Pb", fraction: 1, basis: "atom" }],
        tags: ["shielding"],
    });
}

export function isVoidMaterial(material: TransportMaterial): boolean {
    return material.density === 0 || material.tags?.includes("void") === true;
}

export function hasPositiveDensity(material: TransportMaterial): boolean {
    return Number.isFinite(material.density) && material.density > 0;
}

export function hasNuclides(material: TransportMaterial): boolean {
    return material.nuclides.length > 0;
}

export function getMaterialLabel(material: TransportMaterial): string {
    return `${material.name} (${material.density} g/cm³)`;
}

export function getNuclideFractionTotal(material: TransportMaterial): number {
    return material.nuclides.reduce((sum, nuclide) => sum + nuclide.fraction, 0);
}

export function normalizeNuclideFractions(
    nuclides: readonly TransportNuclideFraction[],
): readonly TransportNuclideFraction[] {
    const total = nuclides.reduce((sum, nuclide) => sum + nuclide.fraction, 0);

    if (!Number.isFinite(total) || total <= 0) {
        return nuclides;
    }

    return nuclides.map((nuclide) => ({
        ...nuclide,
        fraction: nuclide.fraction / total,
    }));
}

export function validateMaterial(material: TransportMaterial): readonly MaterialValidationDiagnostic[] {
    const diagnostics: MaterialValidationDiagnostic[] = [];

    if (material.id.trim().length === 0) {
        diagnostics.push({
            level: "error",
            code: "material.id.missing",
            message: "Material must have a non-empty id.",
            materialId: material.id,
        });
    }

    if (material.name.trim().length === 0) {
        diagnostics.push({
            level: "error",
            code: "material.name.missing",
            message: "Material must have a non-empty name.",
            materialId: material.id,
        });
    }

    if (!Number.isFinite(material.density) || material.density < 0) {
        diagnostics.push({
            level: "error",
            code: "material.density.invalid",
            message: `Material "${material.name}" density must be finite and non-negative.`,
            materialId: material.id,
        });
    }

    if (!isVoidMaterial(material) && material.nuclides.length === 0) {
        diagnostics.push({
            level: "error",
            code: "material.nuclides.missing",
            message: `Non-void material "${material.name}" must define at least one nuclide fraction.`,
            materialId: material.id,
        });
    }

    const basis = material.nuclides[0]?.basis;

    for (const nuclide of material.nuclides) {
        if (nuclide.nuclide.trim().length === 0) {
            diagnostics.push({
                level: "error",
                code: "material.nuclide.name.missing",
                message: `Material "${material.name}" contains a nuclide with an empty name.`,
                materialId: material.id,
            });
        }

        if (!Number.isFinite(nuclide.fraction) || nuclide.fraction < 0) {
            diagnostics.push({
                level: "error",
                code: "material.nuclide.fraction.invalid",
                message: `Material "${material.name}" contains an invalid nuclide fraction.`,
                materialId: material.id,
            });
        }

        if (basis && nuclide.basis !== basis) {
            diagnostics.push({
                level: "warning",
                code: "material.nuclide.basis.mixed",
                message: `Material "${material.name}" mixes atom and weight fraction bases.`,
                materialId: material.id,
            });
        }
    }

    const nuclideFractionTotal = getNuclideFractionTotal(material);

    if (material.nuclides.length > 0 && (!Number.isFinite(nuclideFractionTotal) || nuclideFractionTotal <= 0)) {
        diagnostics.push({
            level: "error",
            code: "material.nuclides.total.invalid",
            message: `Material "${material.name}" nuclide fractions must sum to a positive value.`,
            materialId: material.id,
        });
    }

    return diagnostics;
}

export function isMaterialReadyForTransport(material: TransportMaterial): boolean {
    return validateMaterial(material).every((diagnostic) => diagnostic.level !== "error");
}
