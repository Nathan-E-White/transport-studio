import {describe, expect, it} from "vitest";
import type {Project} from "../index";
import {compileTransportProblem} from "./CompileTransportProblem";

const baseProject = (): Project => ({
    id: "project-1",
    name: "Prepared Project",
    scene: {
        entities: [
            {
                id: "mat-water",
                kind: "material",
                name: "Water",
                tags: [],
                visible: true,
                locked: false,
                transform: {
                    position: {x: 0, y: 0, z: 0},
                    rotationEuler: {x: 0, y: 0, z: 0},
                    scale: {x: 1, y: 1, z: 1},
                },
                color: "#38bdf8",
                density: 1,
                nuclides: [
                    {nuclide: "H1", fraction: 2},
                    {nuclide: "O16", fraction: 1},
                ],
                attenuationCoefficient: 0,
                scatterProbability: 0,
                absorptionProbability: 0,
                anisotropy: 0,
            },
            {
                id: "box-1",
                kind: "geometry",
                name: "Shield Box",
                tags: [],
                visible: true,
                includedInCompile: true,
                locked: false,
                transform: {
                    position: {x: 0, y: 0, z: 0},
                    rotationEuler: {x: 0, y: 0, z: 0},
                    scale: {x: 1, y: 1, z: 1},
                },
                primitive: "box",
                materialId: "mat-water",
                parameters: {width: 10, height: 10, depth: 10},
            },
            {
                id: "source-1",
                kind: "source",
                name: "Beam",
                tags: [],
                visible: true,
                locked: false,
                transform: {
                    position: {x: -5, y: 0, z: 0},
                    rotationEuler: {x: 0, y: 0, z: 0},
                    scale: {x: 1, y: 1, z: 1},
                },
                sourceKind: "pencil-beam",
                particleType: "photon",
                energy: 1,
                strength: 1,
                direction: {x: 1, y: 0, z: 0},
            },
            {
                id: "tally-1",
                kind: "tally",
                name: "Shield Track Length",
                tags: [],
                visible: true,
                locked: false,
                transform: {
                    position: {x: 0, y: 0, z: 0},
                    rotationEuler: {x: 0, y: 0, z: 0},
                    scale: {x: 1, y: 1, z: 1},
                },
                tallyKind: "track-length",
                particleTypes: ["photon"],
                targetEntityId: "box-1",
            },
        ],
    },
    runConfiguration: {
        particleTypes: ["photon"],
        histories: 1000,
        batchSize: 100,
        seed: 7,
        backend: "native",
        visibleHistoryBudget: 10,
    },
    metadata: {
        appVersion: "test",
        physicsModelVersion: "test",
        createdAt: "2026-07-11T00:00:00.000Z",
        modifiedAt: "2026-07-11T00:00:00.000Z",
    },
} as unknown as Project);

describe("compileTransportProblem", () => {
    it("prepares supported authoring meaning through the canonical compiler interface", () => {
        const result = compileTransportProblem(baseProject());

        expect(result.ok).toBe(true);
        expect(result.value).toMatchObject({
            id: "project-1",
            geometry: {entities: [{id: "box-1", kind: "box", materialId: "mat-water"}]},
            materials: [{
                id: "mat-water",
                density: 1,
                nuclides: [
                    {nuclide: "H1", fraction: 2, basis: "atom"},
                    {nuclide: "O16", fraction: 1, basis: "atom"},
                ],
            }],
            sources: [{id: "source-1", kind: "beam-source", direction: {x: 1, y: 0, z: 0}}],
            tallies: [{id: "tally-1", kind: "track-length", entityId: "box-1"}],
            settings: {histories: 1000, seed: 7},
        });
        expect(result.diagnostics).toEqual([]);
    });

    it("keeps viewport visibility independent from compiled-problem inclusion", () => {
        const project = baseProject();
        const entities = project.scene.entities.map((entity) => entity.id === "box-1"
            ? {...entity, visible: false, includedInCompile: true}
            : entity.id === "source-1"
                ? {...entity, visible: true, includedInCompile: false}
                : entity);
        const result = compileTransportProblem({...project, scene: {entities}} as Project);

        expect(result.ok).toBe(true);
        expect(result.value?.geometry.entities.map((entity) => entity.id)).toEqual(["box-1"]);
        expect(result.value?.sources).toEqual([]);
        expect(result.diagnostics).toEqual([{
            level: "info",
            code: "source.compile.excluded",
            message: "Source \"Beam\" was excluded from the compiled transport problem.",
            entityId: "source-1",
        }]);
    });

    it("reports unsupported geometry instead of silently omitting it", () => {
        const project = baseProject();
        const entities = project.scene.entities.map((entity) => entity.id === "box-1" && entity.kind === "geometry"
            ? {...entity, primitive: "plane" as const}
            : entity).filter((entity) => entity.id !== "tally-1");
        const result = compileTransportProblem({...project, scene: {entities}});

        expect(result.ok).toBe(false);
        expect(result.diagnostics).toEqual(expect.arrayContaining([{
            level: "error",
            code: "entity.geometry.unsupported",
            message: "Geometry entity \"Shield Box\" uses unsupported plane geometry.",
            entityId: "box-1",
        }]));
    });

    it("does not validate unsupported geometry that is excluded from the compiled problem", () => {
        const project = baseProject();
        const entities = project.scene.entities.map((entity) => entity.id === "box-1" && entity.kind === "geometry"
            ? {...entity, primitive: "plane" as const, includedInCompile: false}
            : entity).filter((entity) => entity.id !== "tally-1");
        const result = compileTransportProblem({...project, scene: {entities}});

        expect(result.ok).toBe(true);
        expect(result.value?.geometry.entities).toEqual([]);
        expect(result.diagnostics).toEqual([{
            level: "info",
            code: "entity.compile.excluded",
            message: "Entity \"Shield Box\" was excluded from the compiled transport problem.",
            entityId: "box-1",
        }]);
    });

    it("reports lossy non-uniform sphere and cylinder scaling", () => {
        const project = baseProject();
        const geometry = project.scene.entities.find((entity) => entity.id === "box-1" && entity.kind === "geometry")!;
        const withoutTally = project.scene.entities.filter((entity) => entity.id !== "tally-1");
        const sphere = compileTransportProblem({
            ...project,
            scene: {entities: withoutTally.map((entity) => entity.id === geometry.id
                ? {
                    ...geometry,
                    primitive: "sphere" as const,
                    parameters: {radius: 2},
                    transform: {...geometry.transform, scale: {x: 1, y: 2, z: 1}},
                }
                : entity)},
        });
        const cylinder = compileTransportProblem({
            ...project,
            scene: {entities: withoutTally.map((entity) => entity.id === geometry.id
                ? {
                    ...geometry,
                    primitive: "cylinder" as const,
                    parameters: {radius: 2, height: 4},
                    transform: {...geometry.transform, scale: {x: 1, y: 2, z: 3}},
                }
                : entity)},
        });

        expect(sphere.ok).toBe(false);
        expect(sphere.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({code: "sphere.scale.unsupported", entityId: "box-1"}),
        ]));
        expect(cylinder.ok).toBe(false);
        expect(cylinder.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({code: "cylinder.radial-scale.unsupported", entityId: "box-1"}),
        ]));
    });

    it("reports missing and invalid tally targets without retargeting", () => {
        const project = baseProject();
        const tally = project.scene.entities.find((entity) => entity.id === "tally-1")!;
        const missing = compileTransportProblem({
            ...project,
            scene: {entities: project.scene.entities.map((entity) => entity.id === "tally-1"
                ? {...tally, targetEntityId: undefined} as typeof tally
                : entity)},
        });
        const invalid = compileTransportProblem({
            ...project,
            scene: {entities: project.scene.entities.map((entity) => entity.id === "tally-1"
                ? {...tally, targetEntityId: "not-box-1"} as typeof tally
                : entity)},
        });

        expect(missing.ok).toBe(false);
        expect(missing.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({code: "tally.target.missing", entityId: "tally-1"}),
        ]));
        expect(invalid.ok).toBe(false);
        expect(invalid.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({code: "tally.entity.invalid", entityId: "tally-1"}),
        ]));
    });

    it("reports missing material composition instead of inventing it", () => {
        const project = baseProject();
        const result = compileTransportProblem({
            ...project,
            scene: {entities: project.scene.entities.map((entity) => entity.id === "mat-water"
                ? {...entity, nuclides: undefined}
                : entity)},
        });

        expect(result.ok).toBe(false);
        expect(result.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({code: "material.nuclides.missing", entityId: "mat-water"}),
        ]));
    });

    it("reports missing beam direction instead of silently repairing it", () => {
        const project = baseProject();
        const result = compileTransportProblem({
            ...project,
            scene: {entities: project.scene.entities.map((entity) => entity.id === "source-1"
                ? {...entity, direction: undefined}
                : entity)},
        });

        expect(result.ok).toBe(false);
        expect(result.diagnostics).toEqual(expect.arrayContaining([{
            level: "error",
            code: "source.beam.direction.missing",
            message: "Beam source \"Beam\" must define an authoring direction before compilation.",
            entityId: "source-1",
        }]));
    });

    it("keeps preparation diagnostics stable for the same authoring input", () => {
        const project = baseProject();
        const invalid = {
            ...project,
            scene: {entities: project.scene.entities.map((entity) => entity.id === "source-1"
                ? {...entity, direction: undefined}
                : entity)},
        };

        expect(compileTransportProblem(invalid).diagnostics).toEqual([{
            level: "error",
            code: "source.beam.direction.missing",
            message: "Beam source \"Beam\" must define an authoring direction before compilation.",
            entityId: "source-1",
        }]);
    });

    it("diagnoses lossy toy material coefficients", () => {
        const project = baseProject();
        const result = compileTransportProblem({...project, scene: {entities: project.scene.entities.map((entity) =>
            entity.id === "mat-water" ? {...entity, attenuationCoefficient: 0.5} : entity)}});

        expect(result.ok).toBe(true);
        expect(result.diagnostics).toContainEqual(expect.objectContaining({
            code: "material.toy-coefficients.lossy",
            entityId: "mat-water",
        }));
    });

    it("derives compiled particle settings from included sources", () => {
        const project = baseProject();
        const result = compileTransportProblem({...project, scene: {entities: project.scene.entities.map((entity) =>
            entity.id === "source-1" ? {...entity, particleType: "neutron" as const} : entity)}});

        expect(result.ok).toBe(true);
        expect(result.value?.sources[0]?.particle).toBe("neutron");
        expect(result.value?.settings.particles).toEqual(["neutron"]);
    });

    it("reports invalid material references through the canonical interface", () => {
        const project = baseProject();
        const result = compileTransportProblem({...project, scene: {entities: project.scene.entities.map((entity) =>
            entity.id === "box-1" ? {...entity, materialId: "missing-material"} : entity)}} as Project);

        expect(result.ok).toBe(false);
        expect(result.diagnostics).toContainEqual(expect.objectContaining({code: "entity.material.invalid", entityId: "box-1"}));
    });

    it("reports unsupported tally translations through the canonical interface", () => {
        const project = baseProject();
        const result = compileTransportProblem({...project, scene: {entities: project.scene.entities.map((entity) =>
            entity.id === "tally-1" ? {...entity, tallyKind: "voxel-flux" as const} : entity)}});

        expect(result.ok).toBe(false);
        expect(result.diagnostics).toContainEqual(expect.objectContaining({code: "tally.kind.unsupported", entityId: "tally-1"}));
    });
});
