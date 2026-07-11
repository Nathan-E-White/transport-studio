import {describe, expect, it} from "vitest";
import type {EditorScene} from "../editor/EditorScene";
import {compileEditorScene} from "./CompileEditorScene";

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
