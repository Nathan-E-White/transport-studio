import { describe, expect, it } from "vitest";
import {
    createBox,
    createCylinder,
    createMeshImport,
    createSphere,
    getEditorEntityLabel,
    hasMaterial,
    hasValidEntityDimensions,
    isEditorBox,
    isEditorCylinder,
    isEditorMeshImport,
    isEditorSphere,
    isRenderableEntity,
} from "./EditorEntity";

import { identityTransform } from "./EditorScene";

describe("EditorEntity", () => {
    it("creates a box with default editor-facing state", () => {
        const box = createBox({
            id: "box-1",
            name: "Shield Box",
            materialId: "mat-water",
            size: { x: 10, y: 20, z: 30 },
        });

        expect(box).toEqual({
            id: "box-1",
            name: "Shield Box",
            kind: "box",
            materialId: "mat-water",
            transform: identityTransform(),
            visible: true,
            locked: false,
            tags: undefined,
            size: { x: 10, y: 20, z: 30 },
        });
    });

    it("preserves explicit visibility, lock, transform, and tags", () => {
        const transform = {
            position: { x: 1, y: 2, z: 3 },
            rotation: { x: 0.1, y: 0.2, z: 0.3 },
            scale: { x: 2, y: 2, z: 2 },
        };

        const sphere = createSphere({
            id: "sphere-1",
            name: "Detector Sphere",
            radius: 4,
            transform,
            visible: false,
            locked: true,
            tags: ["detector", "debug"],
        });

        expect(sphere).toMatchObject({
            id: "sphere-1",
            kind: "sphere",
            radius: 4,
            transform,
            visible: false,
            locked: true,
            tags: ["detector", "debug"],
        });
    });

    it("narrows entities by kind", () => {
        const box = createBox({ id: "box-1", name: "Box", size: { x: 1, y: 1, z: 1 } });
        const sphere = createSphere({ id: "sphere-1", name: "Sphere", radius: 1 });
        const cylinder = createCylinder({ id: "cylinder-1", name: "Cylinder", radius: 1, height: 2 });
        const mesh = createMeshImport({ id: "mesh-1", name: "Imported Mesh", uri: "file://mesh.step" });

        expect(isEditorBox(box)).toBe(true);
        expect(isEditorSphere(sphere)).toBe(true);
        expect(isEditorCylinder(cylinder)).toBe(true);
        expect(isEditorMeshImport(mesh)).toBe(true);

        expect(isEditorSphere(box)).toBe(false);
        expect(isEditorCylinder(sphere)).toBe(false);
        expect(isEditorMeshImport(cylinder)).toBe(false);
        expect(isEditorBox(mesh)).toBe(false);
    });

    it("returns user-facing entity labels", () => {
        expect(
            getEditorEntityLabel(createBox({ id: "box-1", name: "Shield", size: { x: 1, y: 1, z: 1 } })),
        ).toBe("Box: Shield");
        expect(getEditorEntityLabel(createSphere({ id: "sphere-1", name: "Detector", radius: 1 }))).toBe(
            "Sphere: Detector",
        );
        expect(
            getEditorEntityLabel(createCylinder({ id: "cylinder-1", name: "Tube", radius: 1, height: 2 })),
        ).toBe("Cylinder: Tube");
        expect(getEditorEntityLabel(createMeshImport({ id: "mesh-1", name: "CAD", uri: "file://cad.step" }))).toBe(
            "Mesh: CAD",
        );
    });

    it("detects material assignment", () => {
        expect(
            hasMaterial(
                createBox({ id: "box-1", name: "With Material", materialId: "mat-1", size: { x: 1, y: 1, z: 1 } }),
            ),
        ).toBe(true);
        expect(
            hasMaterial(createBox({ id: "box-2", name: "Without Material", size: { x: 1, y: 1, z: 1 } })),
        ).toBe(false);
    });

    it("treats visible and unlocked entities as renderable", () => {
        expect(
            isRenderableEntity(createBox({ id: "box-1", name: "Renderable", size: { x: 1, y: 1, z: 1 } })),
        ).toBe(true);
        expect(
            isRenderableEntity(createBox({ id: "box-2", name: "Hidden", visible: false, size: { x: 1, y: 1, z: 1 } })),
        ).toBe(false);
        expect(
            isRenderableEntity(createBox({ id: "box-3", name: "Locked", locked: true, size: { x: 1, y: 1, z: 1 } })),
        ).toBe(false);
    });

    it("validates simple primitive dimensions", () => {
        expect(
            hasValidEntityDimensions(createBox({ id: "box-1", name: "Valid Box", size: { x: 1, y: 2, z: 3 } })),
        ).toBe(true);
        expect(
            hasValidEntityDimensions(createBox({ id: "box-2", name: "Bad Box", size: { x: 0, y: 2, z: 3 } })),
        ).toBe(false);
        expect(hasValidEntityDimensions(createSphere({ id: "sphere-1", name: "Valid Sphere", radius: 1 }))).toBe(true);
        expect(hasValidEntityDimensions(createSphere({ id: "sphere-2", name: "Bad Sphere", radius: -1 }))).toBe(false);
        expect(
            hasValidEntityDimensions(createCylinder({ id: "cylinder-1", name: "Valid Cylinder", radius: 1, height: 2 })),
        ).toBe(true);
        expect(
            hasValidEntityDimensions(createCylinder({ id: "cylinder-2", name: "Bad Cylinder", radius: 1, height: 0 })),
        ).toBe(false);
    });

    it("validates imported mesh URI presence", () => {
        expect(hasValidEntityDimensions(createMeshImport({ id: "mesh-1", name: "CAD", uri: "file://cad.step" }))).toBe(
            true,
        );
        expect(hasValidEntityDimensions(createMeshImport({ id: "mesh-2", name: "Missing CAD", uri: "   " }))).toBe(
            false,
        );
    });
});