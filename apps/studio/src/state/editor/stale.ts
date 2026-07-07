// apps/studio/src/state/editor/stale.ts

export type EditorDirtyReason =
    | "geometry-changed"
    | "material-changed"
    | "source-changed"
    | "tally-changed"
    | "selection-changed"
    | "visibility-changed"
    | "compile-inclusion-changed"
    | "run-settings-changed"
    | "unknown";

export interface EditorStaleState {
    readonly sceneDirty: boolean;
    readonly validationStale: boolean;
    readonly compiledProblemStale: boolean;
    readonly runResultsStale: boolean;
    readonly reasons: readonly EditorDirtyReason[];
}

export const CLEAN_STALE_STATE: EditorStaleState = {
    sceneDirty: false,
    validationStale: false,
    compiledProblemStale: false,
    runResultsStale: false,
    reasons: [],
};

export function markSceneDirty(
    state: EditorStaleState,
    reason: EditorDirtyReason,
): EditorStaleState {
    return {
        sceneDirty: true,
        validationStale: true,
        compiledProblemStale: true,
        runResultsStale: true,
        reasons: appendReason(state.reasons, reason),
    };
}

export function markValidated(state: EditorStaleState): EditorStaleState {
    return {
        ...state,
        validationStale: false,
    };
}

export function markCompiled(state: EditorStaleState): EditorStaleState {
    return {
        ...state,
        compiledProblemStale: false,
    };
}

export function markRunResultsFresh(state: EditorStaleState): EditorStaleState {
    return {
        ...state,
        runResultsStale: false,
    };
}

export function markSceneClean(state: EditorStaleState): EditorStaleState {
    return {
        ...state,
        sceneDirty: false,
        reasons: [],
    };
}

function appendReason(
    reasons: readonly EditorDirtyReason[],
    reason: EditorDirtyReason,
): readonly EditorDirtyReason[] {
    return reasons.includes(reason) ? reasons : [...reasons, reason];
}