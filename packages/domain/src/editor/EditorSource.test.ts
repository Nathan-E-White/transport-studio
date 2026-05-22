import { describe, expect, it } from "vitest";
import {
    createBeamSource,
    createIsotropicSource,
    createPointSource,
    getSourceLabel,
    getSourceStrength,
    hasPositiveEnergy,
    hasValidDirection,
    isBeamSource,
    isIsotropicSource,
    isPointSource,
    isSourceEnabled,
    isSourceReadyForTransport,
    normalizeDirection,
    validateSource,
} from "./EditorSource";

describe("EditorSource", () => {
    it("creates a point source with default enabled state", () => {
        const source = createPointSource({
            id: "src-1",
            name: "Point Source",
            particle: "photon",
            energyMeV: 1,
            position: { x: 1, y: 2, z: 3 },
        });

        expect(source).toEqual({
            id: "src-1",
            name: "Point Source",
            kind: "point-source",
            particle: "photon",
            energyMeV: 1,
            strength: undefined,
            enabled: true,
            tags: undefined,
            position: { x: 1, y: 2, z: 3 },
        });
    });

    it("creates beam and isotropic sources", () => {
        expect(
            createBeamSource({
                id: "beam-1",
                name: "Beam",
                particle: "neutron",
                energyMeV: 2,
                strength: 5,
                position: { x: 0, y: 0, z: 0 },
                direction: { x: 0, y: 0, z: 10 },
            }),
        ).toMatchObject({
            id: "beam-1",
            kind: "beam-source",
            particle: "neutron",
            strength: 5,
            direction: { x: 0, y: 0, z: 10 },
        });

        expect(
            createIsotropicSource({
                id: "iso-1",
                name: "Isotropic",
                particle: "photon",
                energyMeV: 0.662,
                enabled: false,
                tags: ["demo"],
                position: { x: 1, y: 0, z: 0 },
            }),
        ).toMatchObject({
            id: "iso-1",
            kind: "isotropic-source",
            enabled: false,
            tags: ["demo"],
        });
    });

    it("narrows source types", () => {
        const point = createPointSource({
            id: "point-1",
            name: "Point",
            particle: "photon",
            energyMeV: 1,
            position: { x: 0, y: 0, z: 0 },
        });
        const beam = createBeamSource({
            id: "beam-1",
            name: "Beam",
            particle: "photon",
            energyMeV: 1,
            position: { x: 0, y: 0, z: 0 },
            direction: { x: 1, y: 0, z: 0 },
        });
        const isotropic = createIsotropicSource({
            id: "iso-1",
            name: "Iso",
            particle: "neutron",
            energyMeV: 1,
            position: { x: 0, y: 0, z: 0 },
        });

        expect(isPointSource(point)).toBe(true);
        expect(isBeamSource(beam)).toBe(true);
        expect(isIsotropicSource(isotropic)).toBe(true);

        expect(isBeamSource(point)).toBe(false);
        expect(isIsotropicSource(beam)).toBe(false);
        expect(isPointSource(isotropic)).toBe(false);
    });

    it("creates user-facing labels", () => {
        expect(
            getSourceLabel(
                createPointSource({
                    id: "point-1",
                    name: "A",
                    particle: "photon",
                    energyMeV: 1,
                    position: { x: 0, y: 0, z: 0 },
                }),
            ),
        ).toBe("Point Source: A");

        expect(
            getSourceLabel(
                createBeamSource({
                    id: "beam-1",
                    name: "B",
                    particle: "photon",
                    energyMeV: 1,
                    position: { x: 0, y: 0, z: 0 },
                    direction: { x: 1, y: 0, z: 0 },
                }),
            ),
        ).toBe("Beam Source: B");

        expect(
            getSourceLabel(
                createIsotropicSource({
                    id: "iso-1",
                    name: "C",
                    particle: "neutron",
                    energyMeV: 1,
                    position: { x: 0, y: 0, z: 0 },
                }),
            ),
        ).toBe("Isotropic Source: C");
    });

    it("handles enabled state, positive energy, and default strength", () => {
        const enabled = createPointSource({
            id: "src-1",
            name: "Enabled",
            particle: "photon",
            energyMeV: 1,
            position: { x: 0, y: 0, z: 0 },
        });
        const disabled = createPointSource({
            id: "src-2",
            name: "Disabled",
            particle: "photon",
            energyMeV: 0,
            strength: 12,
            enabled: false,
            position: { x: 0, y: 0, z: 0 },
        });

        expect(isSourceEnabled(enabled)).toBe(true);
        expect(hasPositiveEnergy(enabled)).toBe(true);
        expect(getSourceStrength(enabled)).toBe(1);

        expect(isSourceEnabled(disabled)).toBe(false);
        expect(hasPositiveEnergy(disabled)).toBe(false);
        expect(getSourceStrength(disabled)).toBe(12);
    });

    it("normalizes non-zero directions and preserves invalid zero directions", () => {
        expect(normalizeDirection({ x: 10, y: 0, z: 0 })).toEqual({ x: 1, y: 0, z: 0 });
        expect(normalizeDirection({ x: 0, y: 3, z: 4 })).toEqual({ x: 0, y: 0.6, z: 0.8 });
        expect(normalizeDirection({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 });
    });

    it("validates beam directions only for beam sources", () => {
        expect(
            hasValidDirection(
                createPointSource({
                    id: "point-1",
                    name: "Point",
                    particle: "photon",
                    energyMeV: 1,
                    position: { x: 0, y: 0, z: 0 },
                }),
            ),
        ).toBe(true);

        expect(
            hasValidDirection(
                createBeamSource({
                    id: "beam-1",
                    name: "Beam",
                    particle: "photon",
                    energyMeV: 1,
                    position: { x: 0, y: 0, z: 0 },
                    direction: { x: 0, y: 0, z: 0 },
                }),
            ),
        ).toBe(false);
    });

    it("validates ready transport sources", () => {
        const source = createBeamSource({
            id: "beam-1",
            name: "Beam",
            particle: "photon",
            energyMeV: 1,
            strength: 10,
            position: { x: 0, y: 0, z: 0 },
            direction: { x: 1, y: 0, z: 0 },
        });

        expect(validateSource(source)).toEqual([]);
        expect(isSourceReadyForTransport(source)).toBe(true);
    });

    it("reports invalid source diagnostics", () => {
        const diagnostics = validateSource(
            createBeamSource({
                id: "",
                name: "",
                particle: "electron",
                energyMeV: -1,
                strength: Number.NaN,
                enabled: false,
                position: { x: Number.NaN, y: 0, z: 0 },
                direction: { x: 0, y: 0, z: 0 },
            }),
        );

        expect(diagnostics).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ code: "source.id.missing", level: "error" }),
                expect.objectContaining({ code: "source.name.missing", level: "error" }),
                expect.objectContaining({ code: "source.energy.invalid", level: "error" }),
                expect.objectContaining({ code: "source.strength.invalid", level: "error" }),
                expect.objectContaining({ code: "source.position.invalid", level: "error" }),
                expect.objectContaining({ code: "source.direction.invalid", level: "error" }),
                expect.objectContaining({ code: "source.disabled", level: "warning" }),
            ]),
        );
    });

    it("does not treat disabled sources as transport ready", () => {
        const source = createPointSource({
            id: "src-1",
            name: "Disabled Source",
            particle: "photon",
            energyMeV: 1,
            enabled: false,
            position: { x: 0, y: 0, z: 0 },
        });

        expect(isSourceReadyForTransport(source)).toBe(false);
    });
});