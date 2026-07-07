// apps/studio/src/state/editor/selection.ts

import { EditorEntityRef, entityKey, sameEntityRef } from "./entities";

export interface EditorSelectionState {
    readonly selected: readonly EditorEntityRef[];
    readonly hovered: EditorEntityRef | null;
    readonly inspectorFocus: EditorEntityRef | null;
}

export const EMPTY_SELECTION_STATE: EditorSelectionState = {
    selected: [],
    hovered: null,
    inspectorFocus: null,
};

export function hasSelection(state: EditorSelectionState): boolean {
    return state.selected.length > 0;
}

export function getPrimarySelection(state: EditorSelectionState): EditorEntityRef | null {
    return state.selected[0] ?? null;
}

export function isSelected(state: EditorSelectionState, ref: EditorEntityRef): boolean {
    return state.selected.some((candidate) => sameEntityRef(candidate, ref));
}

export function selectOne(state: EditorSelectionState, ref: EditorEntityRef): EditorSelectionState {
    return {
        ...state,
        selected: [ref],
        inspectorFocus: ref,
    };
}

export function selectMany(state: EditorSelectionState, refs: readonly EditorEntityRef[]): EditorSelectionState {
    const deduped = dedupeEntityRefs(refs);

    return {
        ...state,
        selected: deduped,
        inspectorFocus: deduped[0] ?? null,
    };
}

export function clearSelection(state: EditorSelectionState): EditorSelectionState {
    return {
        ...state,
        selected: [],
        inspectorFocus: null,
    };
}

export function toggleSelected(state: EditorSelectionState, ref: EditorEntityRef): EditorSelectionState {
    const exists = isSelected(state, ref);

    if (exists) {
        const selected = state.selected.filter((candidate) => !sameEntityRef(candidate, ref));
        return {
            ...state,
            selected,
            inspectorFocus: sameEntityRef(state.inspectorFocus, ref)
                ? selected[0] ?? null
                : state.inspectorFocus,
        };
    }

    const selected = [...state.selected, ref];

    return {
        ...state,
        selected,
        inspectorFocus: state.inspectorFocus ?? ref,
    };
}

export function setHovered(state: EditorSelectionState, ref: EditorEntityRef | null): EditorSelectionState {
    return {
        ...state,
        hovered: ref,
    };
}

export function setInspectorFocus(state: EditorSelectionState, ref: EditorEntityRef | null): EditorSelectionState {
    return {
        ...state,
        inspectorFocus: ref,
    };
}

export function removeEntityFromSelection(
    state: EditorSelectionState,
    ref: EditorEntityRef,
): EditorSelectionState {
    const selected = state.selected.filter((candidate) => !sameEntityRef(candidate, ref));

    return {
        selected,
        hovered: sameEntityRef(state.hovered, ref) ? null : state.hovered,
        inspectorFocus: sameEntityRef(state.inspectorFocus, ref)
            ? selected[0] ?? null
            : state.inspectorFocus,
    };
}

function dedupeEntityRefs(refs: readonly EditorEntityRef[]): readonly EditorEntityRef[] {
    const seen = new Set<string>();
    const out: EditorEntityRef[] = [];

    for (const ref of refs) {
        const key = entityKey(ref);
        if (!seen.has(key)) {
            seen.add(key);
            out.push(ref);
        }
    }

    return out;
}