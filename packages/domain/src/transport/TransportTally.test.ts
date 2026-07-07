

import { describe, expect, it } from "vitest";
import {
    createCellFluxTally,
    createPulseHeightTally,
    createRegionDoseTally,
    createSurfaceCurrentTally,
    createSurfaceFluxTally,
    createTrackLengthTally,
    getTallyID,
    getTallyIDs,
    getTallyIds,
    getTallyLabel,
    getTallyTarget,
    isCellFluxTally,
    isPulseHeightTally,
    isRegionDoseTally,
    isSurfaceCurrentTally,
    isSurfaceFluxTally,
    isTallyEnabled,
    isTallyReadyForTransport,
    isTrackLengthTally,
    referencesEntity,
    referencesRegion,
    referencesSurface,
    validateTally,
} from "./TransportTally";

describe("TransportTally", () => {
    it("creates an entity-targeted cell flux tally with default enabled state", () => {
        const tally = createCellFluxTally({
            id: "tally-1",
            name: "Box Flux",
            particle: "photon",
            entityId: "box-1",
        });

        expect(tally).toEqual({
            id: "tally-1",
            kind: "cell-flux",
            name: "Box Flux",
            particle: "photon",
            target: { kind: "entity", entityId: "box-1" },
            response: "flux",
            enabled: true,
            energyBins: undefined,
            tags: undefined,
            entityId: "box-1",
        });
    });

    it("creates track-length and pulse-height tallies", () => {
        expect(
            createTrackLengthTally({
                id: "track-1",
                name: "Track Length",
                particle: "neutron",
                entityId: "cell-1",
                energyBins: [{ minMeV: 0, maxMeV: 1 }],
            }),
        ).toMatchObject({
            id: "track-1",
            kind: "track-length",
            target: { kind: "entity", entityId: "cell-1" },
            response: "track-length",
            entityId: "cell-1",
            energyBins: [{ minMeV: 0, maxMeV: 1 }],
        });

        expect(
            createPulseHeightTally({
                id: "pulse-1",
                name: "Pulse Height",
                particle: "photon",
                entityId: "detector-1",
                enabled: false,
                tags: ["detector"],
            }),
        ).toMatchObject({
            id: "pulse-1",
            kind: "pulse-height",
            target: { kind: "entity", entityId: "detector-1" },
            response: "pulse-height",
            enabled: false,
            tags: ["detector"],
            entityId: "detector-1",
        });
    });

    it("creates surface-current and surface-flux tallies", () => {
        const current = createSurfaceCurrentTally({
            id: "surface-current-1",
            name: "Surface Current",
            particle: "photon",
            surfaceID: "surface-1",
        });
        const flux = createSurfaceFluxTally({
            id: "surface-flux-1",
            name: "Surface Flux",
            particle: "neutron",
            surfaceId: "surface-2",
        });

        expect(current).toMatchObject({
            id: "surface-current-1",
            kind: "surface-current",
            target: { kind: "surface", surfaceID: "surface-1" },
            response: "current",
            surfaceID: "surface-1",
        });
        expect(flux).toMatchObject({
            id: "surface-flux-1",
            kind: "surface-flux",
            target: { kind: "surface", surfaceID: "surface-2" },
            response: "flux",
            surfaceID: "surface-2",
        });
    });

    it("creates region-dose tallies", () => {
        const tally = createRegionDoseTally({
            id: "dose-1",
            name: "Dose Region",
            particle: "photon",
            regionId: "region-1",
        });

        expect(tally).toMatchObject({
            id: "dose-1",
            kind: "region-dose",
            target: { kind: "region", regionID: "region-1" },
            response: "dose",
            regionID: "region-1",
        });
    });

    it("narrows tally kinds", () => {
        const cellFlux = createCellFluxTally({ id: "cell-1", name: "Cell", particle: "photon", entityId: "box-1" });
        const surfaceCurrent = createSurfaceCurrentTally({ id: "surf-current-1", name: "Current", particle: "photon", surfaceID: "s1" });
        const trackLength = createTrackLengthTally({ id: "track-1", name: "Track", particle: "neutron", entityId: "cell-1" });
        const pulseHeight = createPulseHeightTally({ id: "pulse-1", name: "Pulse", particle: "photon", entityId: "detector-1" });
        const surfaceFlux = createSurfaceFluxTally({ id: "surf-flux-1", name: "Flux", particle: "photon", surfaceID: "s2" });
        const regionDose = createRegionDoseTally({ id: "dose-1", name: "Dose", particle: "photon", regionID: "r1" });

        expect(isCellFluxTally(cellFlux)).toBe(true);
        expect(isSurfaceCurrentTally(surfaceCurrent)).toBe(true);
        expect(isTrackLengthTally(trackLength)).toBe(true);
        expect(isPulseHeightTally(pulseHeight)).toBe(true);
        expect(isSurfaceFluxTally(surfaceFlux)).toBe(true);
        expect(isRegionDoseTally(regionDose)).toBe(true);

        expect(isSurfaceCurrentTally(cellFlux)).toBe(false);
        expect(isTrackLengthTally(surfaceCurrent)).toBe(false);
        expect(isPulseHeightTally(trackLength)).toBe(false);
        expect(isSurfaceFluxTally(pulseHeight)).toBe(false);
        expect(isRegionDoseTally(surfaceFlux)).toBe(false);
        expect(isCellFluxTally(regionDose)).toBe(false);
    });

    it("returns IDs, labels, enabled state, and targets", () => {
        const tallies = [
            createCellFluxTally({ id: "cell-1", name: "A", particle: "photon", entityId: "box-1" }),
            createSurfaceCurrentTally({ id: "current-1", name: "B", particle: "photon", surfaceID: "surface-1" }),
            createTrackLengthTally({ id: "track-1", name: "C", particle: "neutron", entityId: "cell-1" }),
            createPulseHeightTally({ id: "pulse-1", name: "D", particle: "photon", entityId: "detector-1", enabled: false }),
            createSurfaceFluxTally({ id: "surface-flux-1", name: "E", particle: "photon", surfaceID: "surface-2" }),
            createRegionDoseTally({ id: "dose-1", name: "F", particle: "photon", regionID: "region-1" }),
        ];

        expect(getTallyID(tallies[0])).toBe("cell-1");
        expect(getTallyIDs(tallies)).toEqual(["cell-1", "current-1", "track-1", "pulse-1", "surface-flux-1", "dose-1"]);
        expect(getTallyIds(tallies)).toEqual(["cell-1", "current-1", "track-1", "pulse-1", "surface-flux-1", "dose-1"]);

        expect(getTallyLabel(tallies[0])).toBe("Cell Flux Tally: A");
        expect(getTallyLabel(tallies[1])).toBe("Surface Current Tally: B");
        expect(getTallyLabel(tallies[2])).toBe("Track Length Tally: C");
        expect(getTallyLabel(tallies[3])).toBe("Pulse Height Tally: D");
        expect(getTallyLabel(tallies[4])).toBe("Surface Flux Tally: E");
        expect(getTallyLabel(tallies[5])).toBe("Region Dose Tally: F");

        expect(isTallyEnabled(tallies[0])).toBe(true);
        expect(isTallyEnabled(tallies[3])).toBe(false);
        expect(getTallyTarget(tallies[5])).toEqual({ kind: "region", regionID: "region-1" });
    });

    it("checks entity, surface, and region references", () => {
        const entityTally = createCellFluxTally({ id: "cell-1", name: "Cell", particle: "photon", entityId: "box-1" });
        const surfaceTally = createSurfaceCurrentTally({ id: "surface-1", name: "Surface", particle: "photon", surfaceID: "surface-a" });
        const regionTally = createRegionDoseTally({ id: "region-1", name: "Region", particle: "neutron", regionID: "region-a" });

        expect(referencesEntity(entityTally, "box-1")).toBe(true);
        expect(referencesEntity(entityTally, "box-2")).toBe(false);
        expect(referencesEntity(surfaceTally, "surface-a")).toBe(false);

        expect(referencesSurface(surfaceTally, "surface-a")).toBe(true);
        expect(referencesSurface(surfaceTally, "surface-b")).toBe(false);
        expect(referencesSurface(regionTally, "region-a")).toBe(false);

        expect(referencesRegion(regionTally, "region-a")).toBe(true);
        expect(referencesRegion(regionTally, "region-b")).toBe(false);
        expect(referencesRegion(entityTally, "box-1")).toBe(false);
    });

    it("validates ready tallies without a registry context", () => {
        const tallies = [
            createCellFluxTally({ id: "cell-1", name: "Cell", particle: "photon", entityId: "box-1" }),
            createSurfaceCurrentTally({ id: "surface-1", name: "Surface", particle: "photon", surfaceID: "surface-a" }),
            createRegionDoseTally({ id: "dose-1", name: "Dose", particle: "neutron", regionID: "region-a" }),
        ];

        for (const tally of tallies) {
            expect(validateTally(tally)).toEqual([]);
            expect(isTallyReadyForTransport(tally)).toBe(true);
        }
    });

    it("validates ready tallies against registry context", () => {
        const entityTally = createTrackLengthTally({ id: "track-1", name: "Track", particle: "neutron", entityId: "entity-1" });
        const surfaceTally = createSurfaceFluxTally({ id: "surface-1", name: "Surface", particle: "photon", surfaceID: "surface-1" });
        const regionTally = createRegionDoseTally({ id: "region-1", name: "Region", particle: "photon", regionID: "region-1" });
        const context = {
            entityIds: new Set(["entity-1"]),
            surfaceIds: new Set(["surface-1"]),
            regionIds: new Set(["region-1"]),
        };

        expect(validateTally(entityTally, context)).toEqual([]);
        expect(validateTally(surfaceTally, context)).toEqual([]);
        expect(validateTally(regionTally, context)).toEqual([]);
        expect(isTallyReadyForTransport(entityTally, context)).toBe(true);
        expect(isTallyReadyForTransport(surfaceTally, context)).toBe(true);
        expect(isTallyReadyForTransport(regionTally, context)).toBe(true);
    });

    it("reports invalid id, name, missing targets, and missing registry references", () => {
        const missingEntity = createCellFluxTally({ id: "", name: "", particle: "photon", entityId: "" });
        const invalidEntity = createCellFluxTally({ id: "entity-tally", name: "Invalid Entity", particle: "photon", entityId: "missing-entity" });
        const invalidSurface = createSurfaceCurrentTally({ id: "surface-tally", name: "Invalid Surface", particle: "photon", surfaceID: "missing-surface" });
        const invalidRegion = createRegionDoseTally({ id: "region-tally", name: "Invalid Region", particle: "photon", regionID: "missing-region" });
        const context = {
            entityIds: new Set(["entity-1"]),
            surfaceIds: new Set(["surface-1"]),
            regionIds: new Set(["region-1"]),
        };

        expect(validateTally(missingEntity, context)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ level: "error", code: "tally.id.missing" }),
                expect.objectContaining({ level: "error", code: "tally.name.missing" }),
                expect.objectContaining({ level: "error", code: "tally.entity.missing" }),
            ]),
        );

        expect(validateTally(invalidEntity, context)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ level: "error", code: "tally.entity.invalid" }),
            ]),
        );
        expect(validateTally(invalidSurface, context)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ level: "error", code: "tally.surface.invalid" }),
            ]),
        );
        expect(validateTally(invalidRegion, context)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ level: "error", code: "tally.region.invalid" }),
            ]),
        );
    });

    it("reports missing surface and region targets", () => {
        const missingSurface = createSurfaceFluxTally({
            id: "surface-tally",
            name: "Missing Surface",
            particle: "photon",
        });
        const missingRegion = createRegionDoseTally({
            id: "region-tally",
            name: "Missing Region",
            particle: "photon",
        });

        expect(validateTally(missingSurface)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ level: "error", code: "tally.surface.missing" }),
            ]),
        );
        expect(validateTally(missingRegion)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ level: "error", code: "tally.region.missing" }),
            ]),
        );
    });

    it("reports invalid energy bins", () => {
        const tally = createCellFluxTally({
            id: "bad-bins",
            name: "Bad Energy Bins",
            particle: "photon",
            entityId: "box-1",
            energyBins: [
                { minMeV: -1, maxMeV: 1 },
                { minMeV: 2, maxMeV: 1 },
                { minMeV: Number.NaN, maxMeV: 3 },
            ],
        });

        expect(validateTally(tally)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ level: "error", code: "tally.energy_bin.invalid" }),
            ]),
        );
        expect(validateTally(tally).filter((diagnostic) => diagnostic.code === "tally.energy_bin.invalid")).toHaveLength(3);
    });

    it("warns on disabled tallies and excludes them from transport readiness", () => {
        const tally = createPulseHeightTally({
            id: "disabled-tally",
            name: "Disabled Tally",
            particle: "photon",
            entityId: "detector-1",
            enabled: false,
        });

        expect(validateTally(tally)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ level: "warning", code: "tally.disabled" }),
            ]),
        );
        expect(isTallyReadyForTransport(tally)).toBe(false);
    });
});