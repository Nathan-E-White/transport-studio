// apps/studio/src/state/editor/editorStore.ts

import {
    EditorEntityId,
    EditorEntityKind,
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
import {VisibilityTable} from "./visibility";
import type {Project, SceneEntity} from "@transport/domain";
import {
    addEntity,
    deleteEntity,
    duplicateEntity,
    setEntityIncludedInCompile,
    setEntityLocked,
    setEntityVisible,
    updateEntityMetadata,
} from "../../app/projectMutations";

export interface EditorSceneState {
    readonly project: Project | null;
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

    | { readonly type: "create-project-entity"; readonly kind: SceneEntity["kind"] }
    | { readonly type: "update-project-entity-metadata"; readonly ref: EditorEntityRef; readonly patch: {readonly name?: string; readonly description?: string; readonly tags?: readonly string[]} }
    | { readonly type: "duplicate-project-entity"; readonly ref: EditorEntityRef }
    | { readonly type: "delete-project-entity"; readonly ref: EditorEntityRef }

    | { readonly type: "select-one"; readonly ref: EditorEntityRef }
    | { readonly type: "select-many"; readonly refs: readonly EditorEntityRef[] }
    | { readonly type: "toggle-selected"; readonly ref: EditorEntityRef }
    | { readonly type: "clear-selection" }
    | { readonly type: "set-hovered"; readonly ref: EditorEntityRef | null }
    | { readonly type: "set-inspector-focus"; readonly ref: EditorEntityRef | null }

    | { readonly type: "set-visible"; readonly ref: EditorEntityRef; readonly visible: boolean }
    | { readonly type: "set-locked"; readonly ref: EditorEntityRef; readonly locked: boolean }
    | { readonly type: "set-included-in-compile"; readonly ref: EditorEntityRef; readonly includedInCompile: boolean }

    | { readonly type: "set-validation-result"; readonly errors: readonly EditorDiagnostic[]; readonly warnings: readonly EditorDiagnostic[] }
    | { readonly type: "mark-validated" }
    | { readonly type: "mark-compiled" }
    | { readonly type: "mark-run-results-fresh" }
    | { readonly type: "mark-scene-clean" }
    | { readonly type: "mark-scene-dirty"; readonly reason: EditorDirtyReason }

    | { readonly type: "set-run-status"; readonly status: EditorRunStatus; readonly runId?: string | null };

export const initialEditorStoreState: EditorStoreState = {
    shell: {
        activeMode: DEFAULT_EDITOR_MODE,
        bottomDockTab: "run",
        leftPanelOpen: true,
        rightPanelOpen: true,
        bottomDockOpen: true,
    },
    scene: {
        project: null,
    },
    selection: EMPTY_SELECTION_STATE,
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

export function createEditorStoreState(project: Project): EditorStoreState {
    const state = syncProject(initialEditorStoreState, project);
    const initialSelection = project.scene.entities[1];
    return initialSelection ? {
        ...state,
        selection: selectOne(state.selection, {kind: initialSelection.kind, id: initialSelection.id}),
    } : state;
}

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

        case "create-project-entity": {
            const project = requireProject(state);
            const next = addEntity(project, action.kind);
            const created = next.scene.entities.at(-1);
            return markProjectChanged(syncProject(state, next), dirtyReasonForEntityKind(action.kind), created);
        }

        case "update-project-entity-metadata": {
            const project = requireProject(state);
            const current = project.scene.entities.find((entity) => entity.id === action.ref.id);
            if (!current) return state;
            return markProjectChanged(
                syncProject(state, updateEntityMetadata(project, action.ref.id, action.patch)),
                dirtyReasonForEntityKind(current.kind),
            );
        }

        case "duplicate-project-entity": {
            const project = requireProject(state);
            const current = project.scene.entities.find((entity) => entity.id === action.ref.id);
            if (!current) return state;
            const next = duplicateEntity(project, action.ref.id);
            return markProjectChanged(syncProject(state, next), dirtyReasonForEntityKind(current.kind), next.scene.entities.at(-1));
        }

        case "delete-project-entity": {
            const project = requireProject(state);
            const current = project.scene.entities.find((entity) => entity.id === action.ref.id);
            if (!current) return state;
            const changed = markProjectChanged(syncProject(state, deleteEntity(project, action.ref.id)), dirtyReasonForEntityKind(current.kind));
            return {...changed, selection: removeEntityFromSelection(changed.selection, action.ref)};
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
            return markProjectChanged({
                ...state,
                scene: state.scene.project ? {...state.scene, project: setEntityVisible(state.scene.project, action.ref.id, action.visible)} : state.scene,
            }, "visibility-changed");

        case "set-locked":
            return markProjectChanged({
                ...state,
                scene: state.scene.project ? {...state.scene, project: setEntityLocked(state.scene.project, action.ref.id, action.locked)} : state.scene,
            }, "unknown");

        case "set-included-in-compile":
            return markProjectChanged({
                ...state,
                scene: state.scene.project ? {...state.scene, project: setEntityIncludedInCompile(state.scene.project, action.ref.id, action.includedInCompile)} : state.scene,
            }, "compile-inclusion-changed");

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

        default:
            return assertNever(action);
    }
}

function syncProject(state: EditorStoreState, project: Project): EditorStoreState {
    return {
        ...state,
        scene: {project},
    };
}

function markProjectChanged(state: EditorStoreState, reason: EditorDirtyReason, selected?: SceneEntity): EditorStoreState {
    return {
        ...state,
        selection: selected ? selectOne(state.selection, {kind: selected.kind, id: selected.id}) : state.selection,
        stale: markSceneDirty(state.stale, reason),
    };
}

function requireProject(state: EditorStoreState): Project {
    if (!state.scene.project) throw new Error("Editable Scene store has no project");
    return state.scene.project;
}

export function selectProjectTreeMetadata(state: EditorStoreState) {
    return (state.scene.project?.scene.entities ?? []).map((entity) => ({
        id: entity.id, kind: entity.kind, name: entity.name,
        description: typeof entity.metadata?.description === "string" ? entity.metadata.description : undefined,
        tags: entity.tags,
    }));
}

export function selectVisibility(state: EditorStoreState): VisibilityTable {
    return Object.fromEntries((state.scene.project?.scene.entities ?? []).map((entity) => [
        entityKey({kind: entity.kind, id: entity.id}),
        {visible: entity.visible, locked: entity.locked, selectable: true, includedInCompile: entity.includedInCompile ?? true, helperOnly: false},
    ]));
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
