// apps/studio/src/state/editor/editorStore.ts

import {
    EditorEntityId,
    EditorEntityKind,
    EditorEntityMetadata,
    EditorEntityRef,
    entityKey,
} from "./entities";
import {
    DEFAULT_EDITOR_MODE,
    EditorMode,
} from "./modes";
import {
    CLEAN_STALE_STATE,
    EditorDirtyReason,
    EditorStaleState,
    markCompiled,
    markRunResultsFresh,
    markSceneClean,
    markSceneDirty,
    markValidated,
} from "./stale";
import {
    EMPTY_SELECTION_STATE,
    EditorSelectionState,
    clearSelection,
    removeEntityFromSelection,
    selectMany,
    selectOne,
    setHovered,
    setInspectorFocus,
    toggleSelected,
} from "./selection";
import {
    VisibilityTable,
    removeEntityViewFlags,
    setIncludedInCompile,
    setLocked,
    setSelectable,
    setVisible,
} from "./visibility";

export interface EditorSceneState {
    readonly entities: Readonly<Record<string, EditorEntityMetadata>>;
}

export interface EditorShellState {
    readonly activeMode: EditorMode;
    readonly bottomDockTab: EditorBottomDockTab;
    readonly leftPanelOpen: boolean;
    readonly rightPanelOpen: boolean;
    readonly bottomDockOpen: boolean;
}

export type EditorBottomDockTab =
    | "run"
    | "tallies"
    | "tracks"
    | "diagnostics"
    | "console";

export interface EditorValidationState {
    readonly hasErrors: boolean;
    readonly hasWarnings: boolean;
    readonly errors: readonly EditorDiagnostic[];
    readonly warnings: readonly EditorDiagnostic[];
}

export interface EditorDiagnostic {
    readonly id: string;
    readonly severity: "error" | "warning" | "info";
    readonly message: string;
    readonly entity?: EditorEntityRef;
    readonly code?: string;
}

export interface EditorRunResultState {
    readonly status: EditorRunStatus;
    readonly activeRunId: string | null;
    readonly lastCompletedRunId: string | null;
}

export type EditorRunStatus =
    | "idle"
    | "validating"
    | "compiling"
    | "running"
    | "paused"
    | "completed"
    | "cancelled"
    | "failed";

export interface EditorStoreState {
    readonly shell: EditorShellState;
    readonly scene: EditorSceneState;
    readonly selection: EditorSelectionState;
    readonly visibility: VisibilityTable;
    readonly validation: EditorValidationState;
    readonly stale: EditorStaleState;
    readonly run: EditorRunResultState;
}

export type EditorStoreAction =
    | { readonly type: "set-mode"; readonly mode: EditorMode }
    | { readonly type: "set-bottom-dock-tab"; readonly tab: EditorBottomDockTab }
    | { readonly type: "set-left-panel-open"; readonly open: boolean }
    | { readonly type: "set-right-panel-open"; readonly open: boolean }
    | { readonly type: "set-bottom-dock-open"; readonly open: boolean }

    | { readonly type: "upsert-entity"; readonly entity: EditorEntityMetadata; readonly dirtyReason?: EditorDirtyReason }
    | { readonly type: "remove-entity"; readonly ref: EditorEntityRef; readonly dirtyReason?: EditorDirtyReason }

    | { readonly type: "select-one"; readonly ref: EditorEntityRef }
    | { readonly type: "select-many"; readonly refs: readonly EditorEntityRef[] }
    | { readonly type: "toggle-selected"; readonly ref: EditorEntityRef }
    | { readonly type: "clear-selection" }
    | { readonly type: "set-hovered"; readonly ref: EditorEntityRef | null }
    | { readonly type: "set-inspector-focus"; readonly ref: EditorEntityRef | null }

    | { readonly type: "set-visible"; readonly ref: EditorEntityRef; readonly visible: boolean }
    | { readonly type: "set-locked"; readonly ref: EditorEntityRef; readonly locked: boolean }
    | { readonly type: "set-selectable"; readonly ref: EditorEntityRef; readonly selectable: boolean }
    | { readonly type: "set-included-in-compile"; readonly ref: EditorEntityRef; readonly includedInCompile: boolean }

    | { readonly type: "set-validation-result"; readonly errors: readonly EditorDiagnostic[]; readonly warnings: readonly EditorDiagnostic[] }
    | { readonly type: "mark-validated" }
    | { readonly type: "mark-compiled" }
    | { readonly type: "mark-run-results-fresh" }
    | { readonly type: "mark-scene-clean" }
    | { readonly type: "mark-scene-dirty"; readonly reason: EditorDirtyReason }

    | { readonly type: "set-run-status"; readonly status: EditorRunStatus; readonly runId?: string | null }
    | { readonly type: "hydrate-project-tree"; readonly entities: readonly EditorEntityMetadata[]; readonly visibility: VisibilityTable };

export const initialEditorStoreState: EditorStoreState = {
    shell: {
        activeMode: DEFAULT_EDITOR_MODE,
        bottomDockTab: "run",
        leftPanelOpen: true,
        rightPanelOpen: true,
        bottomDockOpen: true,
    },
    scene: {
        entities: {},
    },
    selection: EMPTY_SELECTION_STATE,
    visibility: {},
    validation: {
        hasErrors: false,
        hasWarnings: false,
        errors: [],
        warnings: [],
    },
    stale: CLEAN_STALE_STATE,
    run: {
        status: "idle",
        activeRunId: null,
        lastCompletedRunId: null,
    },
};

export function editorStoreReducer(
    state: EditorStoreState,
    action: EditorStoreAction,
): EditorStoreState {
    switch (action.type) {
        case "set-mode":
            return {
                ...state,
                shell: {
                    ...state.shell,
                    activeMode: action.mode,
                },
            };

        case "set-bottom-dock-tab":
            return {
                ...state,
                shell: {
                    ...state.shell,
                    bottomDockTab: action.tab,
                    bottomDockOpen: true,
                },
            };

        case "set-left-panel-open":
            return {
                ...state,
                shell: {
                    ...state.shell,
                    leftPanelOpen: action.open,
                },
            };

        case "set-right-panel-open":
            return {
                ...state,
                shell: {
                    ...state.shell,
                    rightPanelOpen: action.open,
                },
            };

        case "set-bottom-dock-open":
            return {
                ...state,
                shell: {
                    ...state.shell,
                    bottomDockOpen: action.open,
                },
            };

        case "upsert-entity": {
            const ref: EditorEntityRef = {
                kind: action.entity.kind,
                id: action.entity.id,
            };

            return {
                ...state,
                scene: {
                    ...state.scene,
                    entities: {
                        ...state.scene.entities,
                        [entityKey(ref)]: action.entity,
                    },
                },
                stale: markSceneDirty(state.stale, action.dirtyReason ?? dirtyReasonForEntityKind(action.entity.kind)),
            };
        }

        case "remove-entity": {
            const key = entityKey(action.ref);

            if (!(key in state.scene.entities)) {
                return state;
            }

            const entities = { ...state.scene.entities };
            delete entities[key];

            return {
                ...state,
                scene: {
                    ...state.scene,
                    entities,
                },
                selection: removeEntityFromSelection(state.selection, action.ref),
                visibility: removeEntityViewFlags(state.visibility, action.ref),
                stale: markSceneDirty(state.stale, action.dirtyReason ?? dirtyReasonForEntityKind(action.ref.kind)),
            };
        }

        case "select-one":
            return {
                ...state,
                selection: selectOne(state.selection, action.ref),
            };

        case "select-many":
            return {
                ...state,
                selection: selectMany(state.selection, action.refs),
            };

        case "toggle-selected":
            return {
                ...state,
                selection: toggleSelected(state.selection, action.ref),
            };

        case "clear-selection":
            return {
                ...state,
                selection: clearSelection(state.selection),
            };

        case "set-hovered":
            return {
                ...state,
                selection: setHovered(state.selection, action.ref),
            };

        case "set-inspector-focus":
            return {
                ...state,
                selection: setInspectorFocus(state.selection, action.ref),
            };

        case "set-visible":
            return {
                ...state,
                visibility: setVisible(state.visibility, action.ref, action.visible),
            };

        case "set-locked":
            return {
                ...state,
                visibility: setLocked(state.visibility, action.ref, action.locked),
            };

        case "set-selectable":
            return {
                ...state,
                visibility: setSelectable(state.visibility, action.ref, action.selectable),
            };

        case "set-included-in-compile":
            return {
                ...state,
                visibility: setIncludedInCompile(
                    state.visibility,
                    action.ref,
                    action.includedInCompile,
                ),
                stale: markSceneDirty(state.stale, "compile-inclusion-changed"),
            };

        case "set-validation-result":
            return {
                ...state,
                validation: {
                    hasErrors: action.errors.length > 0,
                    hasWarnings: action.warnings.length > 0,
                    errors: action.errors,
                    warnings: action.warnings,
                },
                stale: markValidated(state.stale),
            };

        case "mark-validated":
            return {
                ...state,
                stale: markValidated(state.stale),
            };

        case "mark-compiled":
            return {
                ...state,
                stale: markCompiled(state.stale),
            };

        case "mark-run-results-fresh":
            return {
                ...state,
                stale: markRunResultsFresh(state.stale),
            };

        case "mark-scene-clean":
            return {
                ...state,
                stale: markSceneClean(state.stale),
            };

        case "mark-scene-dirty":
            return {
                ...state,
                stale: markSceneDirty(state.stale, action.reason),
            };

        case "set-run-status":
            return applyRunStatus(state, action.status, action.runId);

        case "hydrate-project-tree":
            return {
                ...state,
                scene: {
                    ...state.scene,
                    entities: Object.fromEntries(
                        action.entities.map((entity) => [
                            entityKey({kind: entity.kind, id: entity.id}),
                            entity,
                        ]),
                    ),
                },
                visibility: action.visibility,
            };

        default:
            return assertNever(action);
    }
}

function dirtyReasonForEntityKind(kind: EditorEntityKind): EditorDirtyReason {
    switch (kind) {
        case "geometry":
        case "region":
        case "surface":
        case "transform":
            return "geometry-changed";

        case "material":
            return "material-changed";

        case "source":
            return "source-changed";

        case "tally":
            return "tally-changed";

        case "annotation":
        case "label":
        case "visual-helper":
        case "imported-asset":
            return "unknown";

        default:
            return "unknown";
    }
}

function applyRunStatus(
    state: EditorStoreState,
    status: EditorRunStatus,
    runId?: string | null,
): EditorStoreState {
    const activeRunId =
        status === "running" || status === "paused" || status === "validating" || status === "compiling"
            ? runId ?? state.run.activeRunId
            : status === "idle"
                ? null
                : state.run.activeRunId;

    const lastCompletedRunId =
        status === "completed"
            ? runId ?? state.run.activeRunId
            : state.run.lastCompletedRunId;

    return {
        ...state,
        run: {
            status,
            activeRunId,
            lastCompletedRunId,
        },
    };
}

function assertNever(value: never): never {
    throw new Error(`Unhandled editor store action: ${JSON.stringify(value)}`);
}
