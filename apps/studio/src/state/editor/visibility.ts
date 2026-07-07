// apps/studio/src/state/editor/visibility.ts

import { EditorEntityRef, entityKey } from "./entities";

export interface EditorEntityViewFlags {
    readonly visible: boolean;
    readonly selectable: boolean;
    readonly locked: boolean;
    readonly includedInCompile: boolean;
    readonly helperOnly: boolean;
}

export type VisibilityTable = Readonly<Record<string, EditorEntityViewFlags>>;

export const DEFAULT_ENTITY_VIEW_FLAGS: EditorEntityViewFlags = {
    visible: true,
    selectable: true,
    locked: false,
    includedInCompile: true,
    helperOnly: false,
};

export const HELPER_ENTITY_VIEW_FLAGS: EditorEntityViewFlags = {
    visible: true,
    selectable: true,
    locked: false,
    includedInCompile: false,
    helperOnly: true,
};

export function getEntityViewFlags(
    table: VisibilityTable,
    ref: EditorEntityRef,
): EditorEntityViewFlags {
    return table[entityKey(ref)] ?? DEFAULT_ENTITY_VIEW_FLAGS;
}

export function setEntityViewFlags(
    table: VisibilityTable,
    ref: EditorEntityRef,
    flags: Partial<EditorEntityViewFlags>,
): VisibilityTable {
    const key = entityKey(ref);
    const current = table[key] ?? DEFAULT_ENTITY_VIEW_FLAGS;

    return {
        ...table,
        [key]: {
            ...current,
            ...flags,
        },
    };
}

export function setVisible(
    table: VisibilityTable,
    ref: EditorEntityRef,
    visible: boolean,
): VisibilityTable {
    return setEntityViewFlags(table, ref, { visible });
}

export function setLocked(
    table: VisibilityTable,
    ref: EditorEntityRef,
    locked: boolean,
): VisibilityTable {
    return setEntityViewFlags(table, ref, { locked });
}

export function setSelectable(
    table: VisibilityTable,
    ref: EditorEntityRef,
    selectable: boolean,
): VisibilityTable {
    return setEntityViewFlags(table, ref, { selectable });
}

export function setIncludedInCompile(
    table: VisibilityTable,
    ref: EditorEntityRef,
    includedInCompile: boolean,
): VisibilityTable {
    return setEntityViewFlags(table, ref, { includedInCompile });
}

export function removeEntityViewFlags(
    table: VisibilityTable,
    ref: EditorEntityRef,
): VisibilityTable {
    const key = entityKey(ref);

    if (!(key in table)) {
        return table;
    }

    const next = { ...table };
    delete next[key];
    return next;
}