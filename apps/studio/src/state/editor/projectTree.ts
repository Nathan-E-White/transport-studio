// apps/studio/src/state/editor/projectTree.ts

import { EditorEntityKind, EditorEntityMetadata, EditorEntityRef } from "./entities";
import { VisibilityTable, getEntityViewFlags } from "./visibility";

export interface ProjectTreeNode {
    readonly id: string;
    readonly label: string;
    readonly kind: "group" | "entity";
    readonly entityKind?: EditorEntityKind;
    readonly entityRef?: EditorEntityRef;
    readonly children?: readonly ProjectTreeNode[];
    readonly visible?: boolean;
    readonly locked?: boolean;
    readonly includedInCompile?: boolean;
}

export interface ProjectTreeInput {
    readonly entities: readonly EditorEntityMetadata[];
    readonly visibility: VisibilityTable;
}

export function buildProjectTree(input: ProjectTreeInput): readonly ProjectTreeNode[] {
    const groups = groupEntitiesByKind(input.entities);
    const orderedKinds: readonly EditorEntityKind[] = ["geometry", "material", "source", "tally"];
    const remainingKinds = Object.keys(groups).filter(
        (kind): kind is EditorEntityKind => !orderedKinds.includes(kind as EditorEntityKind),
    );

    return [...orderedKinds, ...remainingKinds].map((kind) => ({
        id: `group:${kind}`,
        label: labelForKind(kind),
        kind: "group" as const,
        entityKind: kind,
        children: (groups[kind] ?? []).map((entity) => {
            const ref: EditorEntityRef = {
                kind: entity.kind,
                id: entity.id,
            };

            const flags = getEntityViewFlags(input.visibility, ref);

            return {
                id: `entity:${entity.kind}:${entity.id}`,
                label: entity.name,
                kind: "entity" as const,
                entityKind: entity.kind,
                entityRef: ref,
                visible: flags.visible,
                locked: flags.locked,
                includedInCompile: flags.includedInCompile,
            };
        }),
    }));
}

function groupEntitiesByKind(
    entities: readonly EditorEntityMetadata[],
): Record<string, EditorEntityMetadata[]> {
    return entities.reduce<Record<string, EditorEntityMetadata[]>>((acc, entity) => {
        acc[entity.kind] ??= [];
        acc[entity.kind].push(entity);
        return acc;
    }, {});
}

function labelForKind(kind: EditorEntityKind): string {
    switch (kind) {
        case "geometry":
            return "Geometry";
        case "region":
            return "Regions";
        case "surface":
            return "Surfaces";
        case "material":
            return "Materials";
        case "source":
            return "Sources";
        case "tally":
            return "Tallies";
        case "transform":
            return "Transforms";
        case "annotation":
            return "Annotations";
        case "label":
            return "Labels";
        case "visual-helper":
            return "Visual Helpers";
        case "imported-asset":
            return "Imported Assets";
        default:
            return kind;
    }
}
