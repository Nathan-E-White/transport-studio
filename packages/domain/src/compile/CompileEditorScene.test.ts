import {describe, expect, it} from "vitest";
import type {Project} from "../index";
import type {EditorScene} from "../editor/EditorScene";
import {compileEditorScene, prepareTransportProblem} from "./CompileEditorScene";

const baseScene = (): EditorScene => ({
    id: "scene-1",
    name: "Smoke Test Scene",
    entities: [
        {
            id: "box-1",
            name: "Shield Box",
            kind: "box",
            visible: true,
            locked: false,
            materialId: "mat-water",
            transform: {
                position: {x: 0, y: 0, z: 0},
                rotation: {x: 0, y: 0, z: 0},
                scale: {x: 1, y: 1, z: 1},
            },
            size: {x: 10, y: 10, z: 10},
        },
    ],
    materials: [
        {
            id: "mat-water",
            name: "Water",
            density: 1,
            nuclides: [
                {nuclide: "H1", fraction: 2},
                {nuclide: "O16", fraction: 1},
            ],
        },
    ],
    sources: [
        {
            id: "src-1",
            name: "Point Source",
            kind: "point-source",
            particle: "photon",
            energyMeV: 1,
            position: {x: -5, y: 0, z: 0},
        },
    ],
    tallies: [
        {
            id: "tally-1",
            name: "Box Flux",
            kind: "cell-flux",
            particle: "photon",
            entityId: "box-1",
        },
    ],
    settings: {
        histories: 1_000,
    },
});

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
                attenuationCoefficient: 0.1,
                scatterProbability: 0.1,
                absorptionProbability: 0.9,
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

describe("compileEditorScene", () => {
    it("compiles a minimal valid editor scene into a transport problem", () => {
        const result = compileEditorScene(baseScene());

        expect(result.ok).toBe(true);
        expect(result.value).toMatchObject({
            id: "scene-1",
            name: "Smoke Test Scene",
            status: "compiled",
            geometry: {
                entities: [
                    {
                        id: "box-1",
                        kind: "box",
                        materialId: "mat-water",
                        transform: {
                            position: {x: 0, y: 0, z: 0},
                            rotation: {x: 0, y: 0, z: 0},
                        },
                    },
                ],
            },
            materials: [
                {
                    id: "mat-water",
                    density: 1,
                    nuclides: [
                        {nuclide: "H1", fraction: 2, basis: "atom"},
                        {nuclide: "O16", fraction: 1, basis: "atom"},
                    ],
                },
            ],
            sources: [
                {
                    id: "src-1",
                    kind: "point-source",
                    strength: 1,
                    enabled: true,
                    energy: {kind: "monoenergetic", energyMeV: 1},
                },
            ],
            tallies: [
                {
                    id: "tally-1",
                    kind: "cell-flux",
                    entityId: "box-1",
                    target: {kind: "entity", entityId: "box-1"},
                    enabled: true,
                },
            ],
            settings: {
                histories: 1_000,
                seed: 1,
                particles: ["photon"],
            },
            metadata: {
                sourceSceneId: "scene-1",
                compilerVersion: "transport-domain-compiler-1",
            },
        });
    });

    it("reports invalid material references", () => {
        const scene = baseScene();
        const result = compileEditorScene({
            ...scene,
            entities: [
                {
                    ...scene.entities[0],
                    materialId: "missing-material",
                },
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.diagnostics).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    level: "error",
                    code: "entity.material.invalid",
                    entityId: "box-1",
                }),
            ]),
        );
    });

    it("compiles hidden entities when they remain included in the compiled problem", () => {
        const scene = baseScene();
        const result = compileEditorScene({
            ...scene,
            entities: [
                {
                    ...scene.entities[0],
                    visible: false,
                    includedInCompile: true,
                },
            ],
        });

        expect(result.ok).toBe(true);
        expect(result.value?.geometry.entities).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "box-1",
                    kind: "box",
                }),
            ]),
        );
        expect(result.diagnostics).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "entity.hidden.skipped",
                    entityId: "box-1",
                }),
            ]),
        );
    });

    it("skips explicitly excluded entities with an informational diagnostic", () => {
        const scene = baseScene();
        const result = compileEditorScene({
            ...scene,
            tallies: [],
            entities: [
                {
                    ...scene.entities[0],
                    visible: true,
                    includedInCompile: false,
                },
            ],
        });

        expect(result.ok).toBe(true);
        expect(result.value?.geometry.entities).toEqual([]);
        expect(result.diagnostics).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    level: "info",
                    code: "entity.compile.excluded",
                    entityId: "box-1",
                }),
            ]),
        );
    });

    it("normalizes beam source directions", () => {
        const scene = baseScene();
        const result = compileEditorScene({
            ...scene,
            sources: [
                {
                    id: "beam-1",
                    name: "Beam Source",
                    kind: "beam-source",
                    particle: "photon",
                    energyMeV: 2,
                    position: {x: 0, y: 0, z: 0},
                    direction: {x: 10, y: 0, z: 0},
                },
            ],
        });

        expect(result.ok).toBe(true);
        expect(result.value?.sources[0]).toMatchObject({
            kind: "beam-source",
            direction: {x: 1, y: 0, z: 0},
        });
    });

    it("reports unsupported imported meshes", () => {
        const scene = baseScene();
        const result = compileEditorScene({
            ...scene,
            entities: [
                {
                    id: "mesh-1",
                    name: "Imported CAD",
                    kind: "mesh-import",
                    uri: "file://example.step",
                    visible: true,
                    locked: false,
                    materialId: "mat-water",
                    transform: {
                        position: {x: 0, y: 0, z: 0},
                        rotation: {x: 0, y: 0, z: 0},
                        scale: {x: 1, y: 1, z: 1},
                    },
                },
            ],
            tallies: [],
        });

        expect(result.ok).toBe(false);
        expect(result.diagnostics).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    level: "error",
                    code: "entity.mesh.unsupported",
                    entityId: "mesh-1",
                }),
            ]),
        );
    });
});

describe("prepareTransportProblem", () => {
    it("prepares supported authoring meaning through the canonical compiler interface", () => {
        const result = prepareTransportProblem(baseProject());

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
        const result = prepareTransportProblem({...project, scene: {entities}} as Project);

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
        const result = prepareTransportProblem({...project, scene: {entities}});

        expect(result.ok).toBe(false);
        expect(result.diagnostics).toEqual(expect.arrayContaining([{
            level: "error",
            code: "entity.geometry.unsupported",
            message: "Geometry entity \"Shield Box\" uses unsupported plane geometry.",
            entityId: "box-1",
        }]));
    });

    it("reports missing and invalid tally targets without retargeting", () => {
        const project = baseProject();
        const tally = project.scene.entities.find((entity) => entity.id === "tally-1")!;
        const missing = prepareTransportProblem({
            ...project,
            scene: {entities: project.scene.entities.map((entity) => entity.id === "tally-1"
                ? {...tally, targetEntityId: undefined} as typeof tally
                : entity)},
        });
        const invalid = prepareTransportProblem({
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
        const result = prepareTransportProblem({
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
        const result = prepareTransportProblem({
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

        expect(prepareTransportProblem(invalid).diagnostics).toEqual([{
            level: "error",
            code: "source.beam.direction.missing",
            message: "Beam source \"Beam\" must define an authoring direction before compilation.",
            entityId: "source-1",
        }]);
    });
});
