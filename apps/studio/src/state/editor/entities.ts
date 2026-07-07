// apps/studio/src/state/editor/entities.ts

export type EditorEntityKind =
    | "geometry"
    | "region"
    | "surface"
    | "material"
    | "source"
    | "tally"
    | "transform"
    | "annotation"
    | "label"
    | "visual-helper"
    | "imported-asset";

export type EditorEntityId = string;

export interface EditorEntityRef {
    readonly kind: EditorEntityKind;
    readonly id: EditorEntityId;
}

export interface EditorEntityMetadata {
    readonly id: EditorEntityId;
    readonly kind: EditorEntityKind;
    readonly name: string;
    readonly description?: string;
    readonly tags?: readonly string[];
    readonly createdAt?: string;
    readonly updatedAt?: string;
}

export function entityKey(ref: EditorEntityRef): string {
    return `${ref.kind}:${ref.id}`;
}

export function sameEntityRef(a: EditorEntityRef | null | undefined, b: EditorEntityRef | null | undefined): boolean {
    return !!a && !!b && a.kind === b.kind && a.id === b.id;
}