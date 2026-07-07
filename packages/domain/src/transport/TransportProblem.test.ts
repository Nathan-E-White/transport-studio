

import { describe, expect, it } from "vitest";
import {
    createTransportProblem,
    findMaterial,
    findSource,
    findTally,
    getMaterialIds,
    getSourceIds,
    getTallyIds,
    getTransportProblemSummary,
    hasMaterial,
    hasSource,
    hasTally,
    isTransportProblemReady,
    markTransportProblemCompiled,
    markTransportProblemValidated,
    validateTransportProblem,
} from "./TransportProblem";
import { createTransportBox, createTransportGeometry, createTransportRegion, entityRef } from "./TransportGeometry";
import { createWaterMaterial } from "./TransportMaterial";
import type { TransportSource } from "./TransportSource";
import type { TransportTally } from "./TransportTally";

function sourceFixture(id = "source-1"): TransportSource {
    return {
        id,
        name: "Photon Source",
        kind: "point-source",
        particle: "photon",
        energyMeV: 1,
        strength: 1,
        position: { x: 0, y: 0, z: 0 },
    } as unknown as TransportSource;
}

function tallyFixture(id = "tally-1"): TransportTally {
    return {
        id,
        name: "Flux Tally",
        kind: "cell-flux",
        particle: "photon",
        entityId: "box-1",
    } as unknown as TransportTally;
}

describe("TransportProblem", () => {
    it("creates a transport problem with default run settings", () => {
        const geometry = createTransportGeometry();
        const problem = createTransportProblem({
            id: "problem-1",
            name: "Demo Problem",
            geometry,
        });

        expect(problem).toEqual({
            id: "problem-1",
            name: "Demo Problem",
            status: "draft",
            geometry,
            materials: [],
            sources: [],
            tallies: [],
            settings: {
                histories: 1_000,
                seed: 1,
                particles: ["photon"],
            },
            metadata: undefined,
        });
    });

    it("overrides run settings and preserves metadata", () => {
        const problem = createTransportProblem({
            id: "problem-1",
            name: "Demo Problem",
            status: "validated",
            geometry: createTransportGeometry(),
            settings: {
                histories: 50_000,
                seed: 123,
                particles: ["photon", "neutron"],
                maxStepsPerHistory: 10_000,
                energyCutoffMeV: { photon: 0.001 },
                timeLimitSeconds: 30,
            },
            metadata: {
                description: "Small smoke-test problem.",
                sourceSceneId: "scene-1",
                compilerVersion: "test",
                tags: ["demo"],
            },
        });

        expect(problem.status).toBe("validated");
        expect(problem.settings).toEqual({
            histories: 50_000,
            seed: 123,
            particles: ["photon", "neutron"],
            maxStepsPerHistory: 10_000,
            energyCutoffMeV: { photon: 0.001 },
            timeLimitSeconds: 30,
        });
        expect(problem.metadata).toMatchObject({
            description: "Small smoke-test problem.",
            sourceSceneId: "scene-1",
            compilerVersion: "test",
            tags: ["demo"],
        });
    });

    it("summarizes geometry, material, source, and tally counts", () => {
        const geometry = createTransportGeometry({
            entities: [
                createTransportBox({
                    id: "box-1",
                    name: "Shield Box",
                    materialId: "mat-water",
                    size: { x: 1, y: 2, z: 3 },
                }),
            ],
            regions: [
                createTransportRegion({
                    id: "region-1",
                    name: "Box Region",
                    materialID: "mat-water",
                    expression: entityRef("box-1"),
                }),
            ],
        });

        const problem = createTransportProblem({
            id: "problem-1",
            name: "Demo Problem",
            geometry,
            materials: [createWaterMaterial()],
            sources: [sourceFixture()],
            tallies: [tallyFixture()],
            settings: { histories: 25 },
        });

        expect(getTransportProblemSummary(problem)).toEqual({
            id: "problem-1",
            name: "Demo Problem",
            status: "draft",
            entityCount: 1,
            surfaceCount: 0,
            regionCount: 1,
            materialCount: 1,
            sourceCount: 1,
            tallyCount: 1,
            histories: 25,
        });
    });

    it("finds materials, sources, and tallies by id", () => {
        const material = createWaterMaterial();
        const source = sourceFixture();
        const tally = tallyFixture();
        const problem = createTransportProblem({
            id: "problem-1",
            name: "Demo Problem",
            geometry: createTransportGeometry(),
            materials: [material],
            sources: [source],
            tallies: [tally],
        });

        expect(getMaterialIds(problem)).toEqual(["mat-water"]);
        expect(hasMaterial(problem, "mat-water")).toBe(true);
        expect(findMaterial(problem, "mat-water")).toBe(material);
        expect(hasMaterial(problem, "missing-material")).toBe(false);
        expect(findMaterial(problem, "missing-material")).toBeUndefined();

        expect(getSourceIds(problem)).toEqual(["source-1"]);
        expect(hasSource(problem, "source-1")).toBe(true);
        expect(findSource(problem, "source-1")).toBe(source);
        expect(hasSource(problem, "missing-source")).toBe(false);
        expect(findSource(problem, "missing-source")).toBeUndefined();

        expect(getTallyIds(problem)).toEqual(["tally-1"]);
        expect(hasTally(problem, "tally-1")).toBe(true);
        expect(findTally(problem, "tally-1")).toBe(tally);
        expect(hasTally(problem, "missing-tally")).toBe(false);
        expect(findTally(problem, "missing-tally")).toBeUndefined();
    });

    it("warns on empty sources and tallies without blocking readiness", () => {
        const problem = createTransportProblem({
            id: "problem-1",
            name: "Demo Problem",
            geometry: createTransportGeometry(),
            materials: [createWaterMaterial()],
        });

        expect(validateTransportProblem(problem)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ level: "warning", code: "problem.sources.empty" }),
                expect.objectContaining({ level: "warning", code: "problem.tallies.empty" }),
            ]),
        );
        expect(isTransportProblemReady(problem)).toBe(true);
    });

    it("reports invalid identity and run settings", () => {
        const problem = createTransportProblem({
            id: "",
            name: "",
            geometry: createTransportGeometry(),
            settings: {
                histories: 0,
                seed: 0,
                maxStepsPerHistory: 0,
                timeLimitSeconds: -1,
                energyCutoffMeV: { photon: -0.1 },
            },
        });

        expect(validateTransportProblem(problem)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ level: "error", code: "problem.id.missing" }),
                expect.objectContaining({ level: "error", code: "problem.name.missing" }),
                expect.objectContaining({ level: "error", code: "problem.settings.histories.invalid" }),
                expect.objectContaining({ level: "error", code: "problem.settings.seed.invalid" }),
                expect.objectContaining({ level: "error", code: "problem.settings.max_steps.invalid" }),
                expect.objectContaining({ level: "error", code: "problem.settings.time_limit.invalid" }),
                expect.objectContaining({ level: "error", code: "problem.settings.energy_cutoff.invalid" }),
            ]),
        );
        expect(isTransportProblemReady(problem)).toBe(false);
    });

    it("reports duplicate material, source, and tally ids", () => {
        const material = createWaterMaterial();
        const problem = createTransportProblem({
            id: "problem-1",
            name: "Demo Problem",
            geometry: createTransportGeometry(),
            materials: [material, material],
            sources: [sourceFixture("source-dup"), sourceFixture("source-dup")],
            tallies: [tallyFixture("tally-dup"), tallyFixture("tally-dup")],
        });

        expect(validateTransportProblem(problem)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ level: "error", code: "problem.material.id.duplicate", materialId: "mat-water" }),
                expect.objectContaining({ level: "error", code: "problem.source.id.duplicate", sourceId: "source-dup" }),
                expect.objectContaining({ level: "error", code: "problem.tally.id.duplicate", tallyId: "tally-dup" }),
            ]),
        );
        expect(isTransportProblemReady(problem)).toBe(false);
    });

    it("reports missing material references from geometry entities and regions", () => {
        const geometry = createTransportGeometry({
            entities: [
                createTransportBox({
                    id: "box-1",
                    name: "Shield Box",
                    materialId: "missing-material",
                    size: { x: 1, y: 1, z: 1 },
                }),
            ],
            regions: [
                createTransportRegion({
                    id: "region-1",
                    name: "Missing Material Region",
                    materialID: "missing-region-material",
                    expression: entityRef("box-1"),
                }),
            ],
        });

        const problem = createTransportProblem({
            id: "problem-1",
            name: "Demo Problem",
            geometry,
            materials: [createWaterMaterial()],
            sources: [sourceFixture()],
            tallies: [tallyFixture()],
        });

        expect(validateTransportProblem(problem)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    level: "error",
                    code: "problem.geometry.entity.material.invalid",
                    entityId: "box-1",
                    materialId: "missing-material",
                }),
                expect.objectContaining({
                    level: "error",
                    code: "problem.geometry.region.material.invalid",
                    regionId: "region-1",
                    materialId: "missing-region-material",
                }),
            ]),
        );
        expect(isTransportProblemReady(problem)).toBe(false);
    });

    it("marks problems as validated and compiled", () => {
        const problem = createTransportProblem({
            id: "problem-1",
            name: "Demo Problem",
            geometry: createTransportGeometry(),
            metadata: { compilerVersion: "test" },
        });

        const validated = markTransportProblemValidated(problem);
        const compiled = markTransportProblemCompiled(validated, "transport-visual");

        expect(validated.status).toBe("validated");
        expect(compiled.status).toBe("compiled");
        expect(compiled.metadata).toEqual({
            compilerVersion: "test",
            targetBackendId: "transport-visual",
        });
    });
});