

import { describe, expect, it } from "vitest";
import {
    createAirMaterial,
    createLeadMaterial,
    createMaterial,
    createVoidMaterial,
    createWaterMaterial,
    getMaterialLabel,
    getNuclideFractionTotal,
    hasDensity,
    hasNuclides,
    hasPositiveDensity,
    isMaterialReadyForTransport,
    isVoidMaterial,
    normalizeNuclideFractions,
    validateMaterial,
} from "./EditorMaterial";

describe("EditorMaterial", () => {
    it("creates a generic material", () => {
        const material = createMaterial({
            id: "mat-poly",
            name: "Polyethylene",
            density: 0.94,
            color: "#f8fafc",
            nuclides: [
                { nuclide: "C12", fraction: 2 },
                { nuclide: "H1", fraction: 4 },
            ],
            description: "Simple shielding polymer.",
            tags: ["shielding", "polymer"],
        });

        expect(material).toEqual({
            id: "mat-poly",
            name: "Polyethylene",
            density: 0.94,
            color: "#f8fafc",
            nuclides: [
                { nuclide: "C12", fraction: 2 },
                { nuclide: "H1", fraction: 4 },
            ],
            description: "Simple shielding polymer.",
            tags: ["shielding", "polymer"],
        });
    });

    it("creates useful stock materials", () => {
        expect(createVoidMaterial()).toMatchObject({
            id: "mat-void",
            name: "Void",
            density: 0,
            tags: ["void"],
        });

        expect(createWaterMaterial()).toMatchObject({
            id: "mat-water",
            name: "Water",
            density: 1,
            nuclides: [
                { nuclide: "H1", fraction: 2 },
                { nuclide: "O16", fraction: 1 },
            ],
        });

        expect(createLeadMaterial()).toMatchObject({
            id: "mat-lead",
            name: "Lead",
            density: 11.34,
            nuclides: [{ nuclide: "Pb", fraction: 1 }],
        });

        expect(createAirMaterial()).toMatchObject({
            id: "mat-air",
            name: "Air",
            density: 0.001225,
        });
    });

    it("detects density and nuclide readiness", () => {
        const water = createWaterMaterial();
        const draft = createMaterial({ id: "mat-draft", name: "Draft" });
        const voidMaterial = createVoidMaterial();

        expect(hasDensity(water)).toBe(true);
        expect(hasPositiveDensity(water)).toBe(true);
        expect(hasNuclides(water)).toBe(true);
        expect(isVoidMaterial(water)).toBe(false);

        expect(hasDensity(draft)).toBe(false);
        expect(hasPositiveDensity(draft)).toBe(false);
        expect(hasNuclides(draft)).toBe(false);

        expect(hasDensity(voidMaterial)).toBe(true);
        expect(hasPositiveDensity(voidMaterial)).toBe(false);
        expect(isVoidMaterial(voidMaterial)).toBe(true);
    });

    it("creates readable material labels", () => {
        expect(getMaterialLabel(createWaterMaterial())).toBe("Water (1 g/cm³)");
        expect(getMaterialLabel(createMaterial({ id: "mat-draft", name: "Draft Material" }))).toBe("Draft Material");
    });

    it("computes and normalizes nuclide fraction totals", () => {
        const material = createWaterMaterial();

        expect(getNuclideFractionTotal(material)).toBe(3);
        expect(normalizeNuclideFractions(material.nuclides ?? [])).toEqual([
            { nuclide: "H1", fraction: 2 / 3 },
            { nuclide: "O16", fraction: 1 / 3 },
        ]);
    });

    it("returns original fractions when normalization total is invalid", () => {
        const nuclides = [
            { nuclide: "BadA", fraction: 0 },
            { nuclide: "BadB", fraction: 0 },
        ];

        expect(normalizeNuclideFractions(nuclides)).toEqual(nuclides);
    });

    it("validates complete transport-ready materials", () => {
        expect(validateMaterial(createWaterMaterial())).toEqual([]);
        expect(validateMaterial(createLeadMaterial())).toEqual([]);
        expect(isMaterialReadyForTransport(createWaterMaterial())).toBe(true);
        expect(isMaterialReadyForTransport(createLeadMaterial())).toBe(true);
    });

    it("allows void material as transport-ready without nuclides", () => {
        const material = createVoidMaterial();

        expect(validateMaterial(material)).toEqual([]);
        expect(isMaterialReadyForTransport(material)).toBe(true);
    });

    it("warns on draft materials missing density and nuclides", () => {
        const diagnostics = validateMaterial(createMaterial({ id: "mat-draft", name: "Draft" }));

        expect(diagnostics).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ code: "material.density.missing", level: "warning" }),
                expect.objectContaining({ code: "material.nuclides.missing", level: "warning" }),
            ]),
        );
    });

    it("rejects invalid density and nuclide fractions", () => {
        const diagnostics = validateMaterial(
            createMaterial({
                id: "mat-bad",
                name: "Bad Material",
                density: -1,
                nuclides: [
                    { nuclide: "", fraction: 1 },
                    { nuclide: "H1", fraction: Number.NaN },
                ],
            }),
        );

        expect(diagnostics).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ code: "material.density.invalid", level: "error" }),
                expect.objectContaining({ code: "material.nuclide.name.missing", level: "error" }),
                expect.objectContaining({ code: "material.nuclide.fraction.invalid", level: "error" }),
            ]),
        );
        expect(isMaterialReadyForTransport(createMaterial({ id: "mat-bad", name: "Bad Material", density: -1 }))).toBe(false);
    });
});