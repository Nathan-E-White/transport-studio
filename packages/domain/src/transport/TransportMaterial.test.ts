

import { describe, expect, it } from "vitest";
import {
    createAirMaterial,
    createLeadMaterial,
    createTransportMaterial,
    createVoidMaterial,
    createWaterMaterial,
    getMaterialLabel,
    getNuclideFractionTotal,
    hasNuclides,
    hasPositiveDensity,
    isMaterialReadyForTransport,
    isVoidMaterial,
    normalizeNuclideFractions,
    validateMaterial,
} from "./TransportMaterial";

describe("TransportMaterial", () => {
    it("creates a generic transport material", () => {
        const material = createTransportMaterial({
            id: "mat-poly",
            name: "Polyethylene",
            density: 0.94,
            color: "#f8fafc",
            nuclides: [
                { nuclide: "C12", fraction: 2, basis: "atom" },
                { nuclide: "H1", fraction: 4, basis: "atom" },
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
                { nuclide: "C12", fraction: 2, basis: "atom" },
                { nuclide: "H1", fraction: 4, basis: "atom" },
            ],
            description: "Simple shielding polymer.",
            tags: ["shielding", "polymer"],
        });
    });

    it("creates useful stock transport materials", () => {
        expect(createVoidMaterial()).toMatchObject({
            id: "mat-void",
            name: "Void",
            density: 0,
            nuclides: [],
            tags: ["void"],
        });

        expect(createWaterMaterial()).toMatchObject({
            id: "mat-water",
            name: "Water",
            density: 1,
            nuclides: [
                { nuclide: "H1", fraction: 2, basis: "atom" },
                { nuclide: "O16", fraction: 1, basis: "atom" },
            ],
        });

        expect(createAirMaterial()).toMatchObject({
            id: "mat-air",
            name: "Air",
            density: 0.001225,
        });

        expect(createLeadMaterial()).toMatchObject({
            id: "mat-lead",
            name: "Lead",
            density: 11.34,
            nuclides: [{ nuclide: "Pb", fraction: 1, basis: "atom" }],
        });
    });

    it("detects void, density, and nuclide state", () => {
        const voidMaterial = createVoidMaterial();
        const water = createWaterMaterial();
        const emptyNonVoid = createTransportMaterial({
            id: "mat-empty",
            name: "Empty Non-Void",
            density: 1,
        });

        expect(isVoidMaterial(voidMaterial)).toBe(true);
        expect(hasPositiveDensity(voidMaterial)).toBe(false);
        expect(hasNuclides(voidMaterial)).toBe(false);

        expect(isVoidMaterial(water)).toBe(false);
        expect(hasPositiveDensity(water)).toBe(true);
        expect(hasNuclides(water)).toBe(true);

        expect(isVoidMaterial(emptyNonVoid)).toBe(false);
        expect(hasPositiveDensity(emptyNonVoid)).toBe(true);
        expect(hasNuclides(emptyNonVoid)).toBe(false);
    });

    it("creates readable material labels", () => {
        expect(getMaterialLabel(createWaterMaterial())).toBe("Water (1 g/cm³)");
        expect(getMaterialLabel(createLeadMaterial())).toBe("Lead (11.34 g/cm³)");
        expect(getMaterialLabel(createVoidMaterial())).toBe("Void (0 g/cm³)");
    });

    it("computes and normalizes nuclide fraction totals", () => {
        const water = createWaterMaterial();

        expect(getNuclideFractionTotal(water)).toBe(3);
        expect(normalizeNuclideFractions(water.nuclides)).toEqual([
            { nuclide: "H1", fraction: 2 / 3, basis: "atom" },
            { nuclide: "O16", fraction: 1 / 3, basis: "atom" },
        ]);
    });

    it("returns original nuclide fractions when normalization total is invalid", () => {
        const nuclides = [
            { nuclide: "BadA", fraction: 0, basis: "atom" as const },
            { nuclide: "BadB", fraction: 0, basis: "atom" as const },
        ];

        expect(normalizeNuclideFractions(nuclides)).toEqual(nuclides);
    });

    it("validates transport-ready stock materials", () => {
        expect(validateMaterial(createVoidMaterial())).toEqual([]);
        expect(validateMaterial(createWaterMaterial())).toEqual([]);
        expect(validateMaterial(createAirMaterial())).toEqual([]);
        expect(validateMaterial(createLeadMaterial())).toEqual([]);

        expect(isMaterialReadyForTransport(createVoidMaterial())).toBe(true);
        expect(isMaterialReadyForTransport(createWaterMaterial())).toBe(true);
        expect(isMaterialReadyForTransport(createAirMaterial())).toBe(true);
        expect(isMaterialReadyForTransport(createLeadMaterial())).toBe(true);
    });

    it("rejects non-void materials without nuclides", () => {
        const material = createTransportMaterial({
            id: "mat-empty",
            name: "Empty Non-Void",
            density: 1,
        });

        expect(validateMaterial(material)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    level: "error",
                    code: "material.nuclides.missing",
                    materialId: "mat-empty",
                }),
            ]),
        );
        expect(isMaterialReadyForTransport(material)).toBe(false);
    });

    it("rejects invalid identity, density, nuclide name, fraction, and total", () => {
        const material = createTransportMaterial({
            id: "",
            name: "",
            density: -1,
            nuclides: [
                { nuclide: "", fraction: 0, basis: "atom" },
                { nuclide: "H1", fraction: Number.NaN, basis: "atom" },
            ],
        });

        expect(validateMaterial(material)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ level: "error", code: "material.id.missing" }),
                expect.objectContaining({ level: "error", code: "material.name.missing" }),
                expect.objectContaining({ level: "error", code: "material.density.invalid" }),
                expect.objectContaining({ level: "error", code: "material.nuclide.name.missing" }),
                expect.objectContaining({ level: "error", code: "material.nuclide.fraction.invalid" }),
                expect.objectContaining({ level: "error", code: "material.nuclides.total.invalid" }),
            ]),
        );
        expect(isMaterialReadyForTransport(material)).toBe(false);
    });

    it("warns when atom and weight fraction bases are mixed", () => {
        const material = createTransportMaterial({
            id: "mat-mixed",
            name: "Mixed Basis Material",
            density: 1,
            nuclides: [
                { nuclide: "H1", fraction: 0.5, basis: "atom" },
                { nuclide: "O16", fraction: 0.5, basis: "weight" },
            ],
        });

        expect(validateMaterial(material)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    level: "warning",
                    code: "material.nuclide.basis.mixed",
                    materialId: "mat-mixed",
                }),
            ]),
        );
        expect(isMaterialReadyForTransport(material)).toBe(true);
    });
});