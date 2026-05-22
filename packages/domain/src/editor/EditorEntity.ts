import type { EntityId, MaterialId, EditorTransform } from "./EditorScene";
import type { Vec3 } from '@transport/shared';

import { identityTransform } from "./EditorScene";

// noinspection JSUnusedGlobalSymbols
export type EditorEntityKind = "box" | "sphere" | "cylinder" | "mesh-import";

/**
 * @interface EditorEntityBase
 */
export interface EditorEntityBase {
    readonly id: EntityId;
    readonly name: string;
    readonly transform: EditorTransform;
    readonly materialId?: MaterialId;
    readonly visible: boolean;
    readonly locked: boolean;
    readonly tags?: readonly string[];
}

/**
 * @interface EditorBox
 * @extends EditorEntityBase
 */
export interface EditorBox extends EditorEntityBase {
    readonly kind: "box";
    readonly size: Vec3;
}

/**
 * @interface EditorSphere
 * @extends EditorEntityBase
 */
export interface EditorSphere extends EditorEntityBase {
    readonly kind: "sphere";
    readonly radius: number;
}

export interface EditorCylinder extends EditorEntityBase {
    readonly kind: "cylinder";
    readonly radius: number;
    readonly height: number;
}

export interface EditorMeshImport extends EditorEntityBase {
    readonly kind: "mesh-import";
    readonly uri: string;
}

export type EditorEntity = EditorBox | EditorSphere | EditorCylinder | EditorMeshImport;

export interface CreateEntityBaseOptions {
    readonly id: EntityId;
    readonly name: string;
    readonly materialId?: MaterialId;
    readonly transform?: EditorTransform;
    readonly visible?: boolean;
    readonly locked?: boolean;
    readonly tags?: readonly string[];
}

export interface CreateBoxOptions extends CreateEntityBaseOptions {
    readonly size: Vec3;
}

export interface CreateSphereOptions extends CreateEntityBaseOptions {
    readonly radius: number;
}

export interface CreateCylinderOptions extends CreateEntityBaseOptions {
    readonly radius: number;
    readonly height: number;
}

export interface CreateMeshImportOptions extends CreateEntityBaseOptions {
    readonly uri: string;
}

export function createBox(options: CreateBoxOptions): EditorBox {
    return {
        ...createEntityBase(options),
        kind: "box",
        size: options.size,
    };
}

export function createSphere(options: CreateSphereOptions): EditorSphere {
    return {
        ...createEntityBase(options),
        kind: "sphere",
        radius: options.radius,
    };
}

export function createCylinder(options: CreateCylinderOptions): EditorCylinder {
    return {
        ...createEntityBase(options),
        kind: "cylinder",
        radius: options.radius,
        height: options.height,
    };
}

export function createMeshImport(options: CreateMeshImportOptions): EditorMeshImport {
    return {
        ...createEntityBase(options),
        kind: "mesh-import",
        uri: options.uri,
    };
}

export function isEditorBox(entity: EditorEntity): entity is EditorBox {
    return entity.kind === "box";
}

export function isEditorSphere(entity: EditorEntity): entity is EditorSphere {
    return entity.kind === "sphere";
}

export function isEditorCylinder(entity: EditorEntity): entity is EditorCylinder {
    return entity.kind === "cylinder";
}

export function isEditorMeshImport(entity: EditorEntity): entity is EditorMeshImport {
    return entity.kind === "mesh-import";
}

export function getEditorEntityLabel(entity: EditorEntity): string {
    switch (entity.kind) {
        case "box":
            return `Box: ${entity.name}`;
        case "sphere":
            return `Sphere: ${entity.name}`;
        case "cylinder":
            return `Cylinder: ${entity.name}`;
        case "mesh-import":
            return `Mesh: ${entity.name}`;
    }
}

export function hasMaterial(entity: EditorEntity): boolean {
    return typeof entity.materialId === "string" && entity.materialId.length > 0;
}

export function isRenderableEntity(entity: EditorEntity): boolean {
    return entity.visible && !entity.locked;
}

export function hasValidEntityDimensions(entity: EditorEntity): boolean {
    switch (entity.kind) {
        case "box":
            return isPositiveFinite(entity.size.x) && isPositiveFinite(entity.size.y) && isPositiveFinite(entity.size.z);
        case "sphere":
            return isPositiveFinite(entity.radius);
        case "cylinder":
            return isPositiveFinite(entity.radius) && isPositiveFinite(entity.height);
        case "mesh-import":
            return entity.uri.trim().length > 0;
    }
}

function createEntityBase(options: CreateEntityBaseOptions): EditorEntityBase {
    return {
        id: options.id,
        name: options.name,
        materialId: options.materialId,
        transform: options.transform ?? identityTransform(),
        visible: options.visible ?? true,
        locked: options.locked ?? false,
        tags: options.tags,
    };
}

function isPositiveFinite(value: number): boolean {
    return Number.isFinite(value) && value > 0;
}
