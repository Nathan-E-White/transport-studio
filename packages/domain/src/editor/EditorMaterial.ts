export type MaterialId = string;

export interface EditorNuclideFraction {
  readonly nuclide: string;
  readonly fraction: number;
}

export interface EditorMaterial {
  readonly id: MaterialId;
  readonly name: string;
  readonly density?: number;
  readonly color?: string;
  readonly nuclides?: readonly EditorNuclideFraction[];
  readonly description?: string;
  readonly tags?: readonly string[];
}

export interface CreateMaterialOptions {
  readonly id: MaterialId;
  readonly name: string;
  readonly density?: number;
  readonly color?: string;
  readonly nuclides?: readonly EditorNuclideFraction[];
  readonly description?: string;
  readonly tags?: readonly string[];
}

export interface MaterialValidationDiagnostic {
  readonly level: "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly materialId: MaterialId;
}

export function createMaterial(options: CreateMaterialOptions): EditorMaterial {
  return {
    id: options.id,
    name: options.name,
    density: options.density,
    color: options.color,
    nuclides: options.nuclides,
    description: options.description,
    tags: options.tags,
  };
}

export function createVoidMaterial(id = "mat-void", name = "Void"): EditorMaterial {
  return createMaterial({
    id,
    name,
    density: 0,
    color: "#111827",
    nuclides: [],
    description: "A zero-density material used to represent void or exterior regions.",
    tags: ["void"],
  });
}

export function createWaterMaterial(id = "mat-water"): EditorMaterial {
  return createMaterial({
    id,
    name: "Water",
    density: 1,
    color: "#38bdf8",
    nuclides: [
      { nuclide: "H1", fraction: 2 },
      { nuclide: "O16", fraction: 1 },
    ],
    tags: ["moderator", "shielding"],
  });
}

export function createLeadMaterial(id = "mat-lead"): EditorMaterial {
  return createMaterial({
    id,
    name: "Lead",
    density: 11.34,
    color: "#64748b",
    nuclides: [{ nuclide: "Pb", fraction: 1 }],
    tags: ["shielding"],
  });
}

export function createAirMaterial(id = "mat-air"): EditorMaterial {
  return createMaterial({
    id,
    name: "Air",
    density: 0.001225,
    color: "#e0f2fe",
    nuclides: [
      { nuclide: "N14", fraction: 0.78084 },
      { nuclide: "O16", fraction: 0.20946 },
      { nuclide: "Ar40", fraction: 0.00934 },
      { nuclide: "C12", fraction: 0.00036 },
    ],
    tags: ["gas"],
  });
}

export function hasDensity(material: EditorMaterial): boolean {
  return typeof material.density === "number" && Number.isFinite(material.density);
}

export function hasPositiveDensity(material: EditorMaterial): boolean {
  return hasDensity(material) && material.density! > 0;
}

export function isVoidMaterial(material: EditorMaterial): boolean {
  return material.density === 0 || material.tags?.includes("void") === true;
}

export function hasNuclides(material: EditorMaterial): boolean {
  return Array.isArray(material.nuclides) && material.nuclides.length > 0;
}

export function getMaterialLabel(material: EditorMaterial): string {
  if (typeof material.density === "number" && Number.isFinite(material.density)) {
    return `${material.name} (${material.density} g/cm³)`;
  }

  return material.name;
}

export function normalizeNuclideFractions(
  nuclides: readonly EditorNuclideFraction[],
): readonly EditorNuclideFraction[] {
  const total = nuclides.reduce((sum, entry) => sum + entry.fraction, 0);

  if (total <= 0 || !Number.isFinite(total)) {
    return nuclides;
  }

  return nuclides.map((entry) => ({
    nuclide: entry.nuclide,
    fraction: entry.fraction / total,
  }));
}

export function getNuclideFractionTotal(material: EditorMaterial): number {
  return material.nuclides?.reduce((sum, entry) => sum + entry.fraction, 0) ?? 0;
}

export function validateMaterial(material: EditorMaterial): readonly MaterialValidationDiagnostic[] {
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

  if (material.density === undefined) {
    diagnostics.push({
      level: "warning",
      code: "material.density.missing",
      message: `Material "${material.name}" does not specify density yet.`,
      materialId: material.id,
    });
  } else if (!Number.isFinite(material.density) || material.density < 0) {
    diagnostics.push({
      level: "error",
      code: "material.density.invalid",
      message: `Material "${material.name}" density must be finite and non-negative.`,
      materialId: material.id,
    });
  }

  if (!isVoidMaterial(material) && !hasNuclides(material)) {
    diagnostics.push({
      level: "warning",
      code: "material.nuclides.missing",
      message: `Material "${material.name}" does not define any nuclide fractions yet.`,
      materialId: material.id,
    });
  }

  for (const nuclide of material.nuclides ?? []) {
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
  }

  return diagnostics;
}

export function isMaterialReadyForTransport(material: EditorMaterial): boolean {
  return validateMaterial(material).every((diagnostic) => diagnostic.level !== "error")
    && (isVoidMaterial(material) || (hasPositiveDensity(material) && hasNuclides(material)));
}
