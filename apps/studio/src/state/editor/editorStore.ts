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
    getEditorModeBehavior,
    isEntityKindSelectableInMode,
} from "./modes";
import {
    CLEAN_STALE_STATE,
    EditorDirtyReason,
    EditorStaleState,
    markCompiled,
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
    getEntityViewFlags,
    removeEntityViewFlags,
    setEntityViewFlags,
    setIncludedInCompile as setViewIncludedInCompile,
    setLocked as setViewLocked,
    setSelectable as setViewSelectable,
    setVisible as setViewVisible,
} from "./visibility";
import type {Project, SceneEntity} from "@transport/domain";
import {
    addEntity,
    deleteEntity,
    duplicateEntity,
    setEntityIncludedInCompile,
    setEntityLocked,
    setEntityVisible,
    updateProjectSettings,
    validateProjectSettings,
    type EditableProjectSettings,
    updateEntityMetadata,
} from "../../app/projectMutations";
import {commitInspectorCandidate, type InspectorEditDiagnostic} from "../../app/inspectorEditing";

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
    readonly diagnostics: readonly EditorDiagnostic[];
}

export interface EditorDiagnostic {
    readonly id: string;
    readonly severity: "error" | "warning" | "info";
    readonly message: string;
    readonly entity?: EditorEntityRef;
    readonly code?: string;
}

export interface EditorStoreState {
    readonly shell: EditorShellState;
    readonly scene: EditorSceneState;
    readonly visibility: VisibilityTable;
    readonly selection: EditorSelectionState;
    readonly validation: EditorValidationState;
    readonly stale: EditorStaleState;
    readonly inspectorEditDiagnostics: readonly InspectorEditDiagnostic[];
    readonly projectSettingsErrors: readonly string[];
}

export type EditorStoreAction =
    | { readonly type: "set-mode"; readonly mode: EditorMode }
    | { readonly type: "set-bottom-dock-tab"; readonly tab: EditorBottomDockTab }
    | { readonly type: "set-left-panel-open"; readonly open: boolean }
    | { readonly type: "set-right-panel-open"; readonly open: boolean }
    | { readonly type: "set-bottom-dock-open"; readonly open: boolean }

    | { readonly type: "create-project-entity"; readonly kind: SceneEntity["kind"] }
    | { readonly type: "update-project-settings"; readonly settings: EditableProjectSettings }
    | { readonly type: "update-project-entity-metadata"; readonly ref: EditorEntityRef; readonly patch: {readonly name?: string; readonly description?: string; readonly tags?: readonly string[]} }
    | { readonly type: "apply-inspector-edit"; readonly baseline: SceneEntity; readonly candidate: SceneEntity }
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
    | { readonly type: "set-selectable"; readonly ref: EditorEntityRef; readonly selectable: boolean }
    | { readonly type: "set-helper-only"; readonly ref: EditorEntityRef; readonly helperOnly: boolean }

    | { readonly type: "set-validation-result"; readonly diagnostics: readonly EditorDiagnostic[] }
    | { readonly type: "mark-validated" }
    | { readonly type: "mark-compiled" }
    | { readonly type: "mark-scene-clean" }
    | { readonly type: "mark-scene-dirty"; readonly reason: EditorDirtyReason };

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
    visibility: {},
    selection: EMPTY_SELECTION_STATE,
    validation: {
        hasErrors: false,
        hasWarnings: false,
        diagnostics: [],
    },
    stale: CLEAN_STALE_STATE,
    inspectorEditDiagnostics: [],
    projectSettingsErrors: [],
};

export function createEditorStoreState(project: Project, initialVisibility: VisibilityTable = {}): EditorStoreState {
    const visibility = createVisibility(project, initialVisibility);
    const state = {
        ...syncProject(initialEditorStoreState, reconcileProjectViewFlags(project, visibility)),
        visibility,
    };
    const preferredSelection = project.scene.entities[1];
    const initialSelection = preferredSelection && isSelectable(state, {kind: preferredSelection.kind, id: preferredSelection.id})
        ? preferredSelection
        : project.scene.entities.find((entity) => isSelectable(state, {kind: entity.kind, id: entity.id}));
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
        case "set-mode": {
            const selection = selectMany(
                state.selection,
                state.selection.selected.filter((ref) => isEntityKindSelectableInMode(action.mode, ref.kind)),
            );
            return {
                ...state,
                shell: {
                    ...state.shell,
                    activeMode: action.mode,
                },
                selection: selection.hovered && !isEntityKindSelectableInMode(action.mode, selection.hovered.kind)
                    ? setHovered(selection, null)
                    : selection,
                inspectorEditDiagnostics: [],
            };
        }

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
            if (!canEditScene(state)) return state;
            const project = requireProject(state);
            const next = addEntity(project, action.kind);
            const created = next.scene.entities.at(-1);
            return markProjectChanged(syncProject(state, next), dirtyReasonForEntityKind(action.kind), created);
        }

        case "update-project-settings": {
            if (!canEditScene(state)) return state;
            const errors = validateProjectSettings(action.settings);
            if (errors.length > 0) return {...state, projectSettingsErrors: errors};
            return markProjectChanged({
                ...syncProject(state, updateProjectSettings(requireProject(state), action.settings)),
                projectSettingsErrors: [],
            },
                "run-settings-changed",
            );
        }

        case "update-project-entity-metadata": {
            if (!canEditScene(state)) return state;
            const project = requireProject(state);
            const current = project.scene.entities.find((entity) => entity.id === action.ref.id);
            if (!current) return state;
            return markProjectChanged(
                syncProject(state, updateEntityMetadata(project, action.ref.id, action.patch)),
                dirtyReasonForEntityKind(current.kind),
            );
        }

        case "apply-inspector-edit": {
            if (!canEditScene(state)) return state;
            const project = requireProject(state);
            const result = commitInspectorCandidate(project, action.candidate, action.baseline);
            if (!result.ok) return {...state, inspectorEditDiagnostics: result.diagnostics};
            return markProjectChanged({
                ...syncProject(state, result.project),
                inspectorEditDiagnostics: [],
            }, dirtyReasonForEntityKind(action.candidate.kind));
        }

        case "duplicate-project-entity": {
            if (!canEditScene(state)) return state;
            const project = requireProject(state);
            const current = project.scene.entities.find((entity) => entity.id === action.ref.id);
            if (!current) return state;
            const next = duplicateEntity(project, action.ref.id);
            const duplicate = next.scene.entities.at(-1);
            if (!duplicate) return state;
            const sourceFlags = getEntityViewFlags(state.visibility, action.ref);
            const duplicateRef = {kind: duplicate.kind, id: duplicate.id};
            const withVisibility = {
                ...syncProject(state, next),
                visibility: setEntityViewFlags(state.visibility, duplicateRef, {
                    ...sourceFlags,
                    visible: duplicate.visible && sourceFlags.visible,
                    locked: duplicate.locked || sourceFlags.locked,
                    includedInCompile: sourceFlags.helperOnly ? false : sourceFlags.includedInCompile,
                }),
            };
            return markProjectChanged(
                withVisibility,
                dirtyReasonForEntityKind(current.kind),
                sourceFlags.selectable ? duplicate : undefined,
            );
        }

        case "delete-project-entity": {
            if (!canEditScene(state)) return state;
            const project = requireProject(state);
            const current = project.scene.entities.find((entity) => entity.id === action.ref.id);
            if (!current) return state;
            const changed = markProjectChanged(syncProject(state, deleteEntity(project, action.ref.id)), dirtyReasonForEntityKind(current.kind));
            return {
                ...changed,
                visibility: removeEntityViewFlags(changed.visibility, action.ref),
                selection: removeEntityFromSelection(changed.selection, action.ref),
            };
        }

        case "select-one":
            if (!isSelectable(state, action.ref) || !isEntityKindSelectableInMode(state.shell.activeMode, action.ref.kind)) return state;
            return {
                ...state,
                selection: selectOne(state.selection, action.ref),
                inspectorEditDiagnostics: [],
            };

        case "select-many":
            return {
                ...state,
                selection: selectMany(state.selection, action.refs.filter((ref) => isSelectable(state, ref)
                    && isEntityKindSelectableInMode(state.shell.activeMode, ref.kind))),
                inspectorEditDiagnostics: [],
            };

        case "toggle-selected":
            if (!isSelectable(state, action.ref) || !isEntityKindSelectableInMode(state.shell.activeMode, action.ref.kind)) return state;
            return {
                ...state,
                selection: toggleSelected(state.selection, action.ref),
                inspectorEditDiagnostics: [],
            };

        case "clear-selection":
            return {
                ...state,
                selection: clearSelection(state.selection),
                inspectorEditDiagnostics: [],
            };

        case "set-hovered":
            if (action.ref && !isEntityKindSelectableInMode(state.shell.activeMode, action.ref.kind)) return state;
            return {
                ...state,
                selection: setHovered(state.selection, action.ref),
            };

        case "set-inspector-focus":
            if (action.ref && !isEntityKindSelectableInMode(state.shell.activeMode, action.ref.kind)) return state;
            return {
                ...state,
                selection: setInspectorFocus(state.selection, action.ref),
            };

        case "set-visible":
            if (!canEditScene(state)) return state;
            return markProjectChanged({
                ...state,
                scene: state.scene.project ? {...state.scene, project: setEntityVisible(state.scene.project, action.ref.id, action.visible)} : state.scene,
                visibility: setViewVisible(state.visibility, action.ref, action.visible),
            }, "visibility-changed");

        case "set-locked":
            if (!canEditScene(state)) return state;
            return markProjectChanged({
                ...state,
                scene: state.scene.project ? {...state.scene, project: setEntityLocked(state.scene.project, action.ref.id, action.locked)} : state.scene,
                visibility: setViewLocked(state.visibility, action.ref, action.locked),
            }, "unknown");

        case "set-included-in-compile":
            if (!canEditScene(state)) return state;
            if (getEntityViewFlags(state.visibility, action.ref).helperOnly && action.includedInCompile) return state;
            return markProjectChanged({
                ...state,
                scene: state.scene.project ? {...state.scene, project: setEntityIncludedInCompile(state.scene.project, action.ref.id, action.includedInCompile)} : state.scene,
                visibility: setViewIncludedInCompile(state.visibility, action.ref, action.includedInCompile),
            }, "compile-inclusion-changed");

        case "set-selectable": {
            if (!canEditScene(state)) return state;
            const visibility = setViewSelectable(state.visibility, action.ref, action.selectable);
            return action.selectable
                ? {...state, visibility}
                : {...state, visibility, selection: removeEntityFromSelection(state.selection, action.ref)};
        }

        case "set-helper-only": {
            if (!canEditScene(state)) return state;
            const visibility = setEntityViewFlags(state.visibility, action.ref, {
                helperOnly: action.helperOnly,
                includedInCompile: action.helperOnly ? false : getEntityViewFlags(state.visibility, action.ref).includedInCompile,
            });
            const scene = action.helperOnly && state.scene.project
                ? {...state.scene, project: setEntityIncludedInCompile(state.scene.project, action.ref.id, false)}
                : state.scene;
            return markProjectChanged({...state, scene, visibility}, "compile-inclusion-changed");
        }

        case "set-validation-result":
            return {
                ...state,
                validation: {
                    hasErrors: action.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
                    hasWarnings: action.diagnostics.some((diagnostic) => diagnostic.severity === "warning"),
                    diagnostics: action.diagnostics,
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

function canEditScene(state: EditorStoreState): boolean {
    return getEditorModeBehavior(state.shell.activeMode).editingEnabled;
}

export function selectProjectTreeMetadata(state: EditorStoreState) {
    return (state.scene.project?.scene.entities ?? []).map((entity) => ({
        id: entity.id, kind: entity.kind, name: entity.name,
        description: typeof entity.metadata?.description === "string" ? entity.metadata.description : undefined,
        tags: entity.tags,
    }));
}

export function selectVisibility(state: EditorStoreState): VisibilityTable {
    return state.visibility;
}

function createVisibility(project: Project, initial: VisibilityTable): VisibilityTable {
    return Object.fromEntries(project.scene.entities.map((entity) => {
        const ref = {kind: entity.kind, id: entity.id};
        const supplied = getEntityViewFlags(initial, ref);
        return [entityKey(ref), {
            ...supplied,
            visible: supplied.visible && entity.visible,
            locked: supplied.locked || entity.locked,
            includedInCompile: supplied.helperOnly ? false : supplied.includedInCompile && (entity.includedInCompile ?? true),
        }];
    }));
}

function reconcileProjectViewFlags(project: Project, visibility: VisibilityTable): Project {
    return {
        ...project,
        scene: {
            ...project.scene,
            entities: project.scene.entities.map((entity) => {
                const flags = getEntityViewFlags(visibility, {kind: entity.kind, id: entity.id});
                return {
                    ...entity,
                    visible: flags.visible,
                    locked: flags.locked,
                    includedInCompile: flags.includedInCompile ? entity.includedInCompile : false,
                };
            }),
        },
    };
}

function isSelectable(state: EditorStoreState, ref: EditorEntityRef): boolean {
    const exists = state.scene.project?.scene.entities.some((entity) => entity.id === ref.id && entity.kind === ref.kind) ?? false;
    return exists && getEntityViewFlags(state.visibility, ref).selectable;
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

function assertNever(value: never): never {
    throw new Error(`Unhandled editor store action: ${JSON.stringify(value)}`);
}
