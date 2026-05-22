import {describe, expect, it} from "vitest";
import type {EditorBox, EditorScene} from "./EditorScene";
import {identityTransform, makeEmptyEditorScene} from "./EditorScene";

describe("EditorScene", () => {
    it("creates an identity transform", () => {
        expect(identityTransform()).toEqual({
            position: {x: 0, y: 0, z: 0},
            rotation: {x: 0, y: 0, z: 0},
            scale: {x: 1, y: 1, z: 1},
        });
    });

    it("creates an empty editor scene with default run settings", () => {
        expect(makeEmptyEditorScene("scene-1", "Untitled Scene")).toEqual({
            id: "scene-1",
            name: "Untitled Scene",
            entities: [],
            materials: [],
            sources: [],
            tallies: [],
            settings: {
                histories: 1_000,
            },
        });
    });

    it("allows a minimal strongly typed box scene", () => {
        const box: EditorBox = {
            id: "box-1",
            name: "Shield Box",
            kind: "box",
            visible: true,
            locked: false,
            materialId: "mat-water",
            transform: identityTransform(),
            size: {x: 10, y: 10, z: 10},
        };

        const scene: EditorScene = {
            id: "scene-1",
            name: "Smoke Test Scene",
            entities: [box],
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
        };

        expect(scene.entities[0]).toMatchObject({
            id: "box-1",
            kind: "box",
            materialId: "mat-water",
        });
    });
});
