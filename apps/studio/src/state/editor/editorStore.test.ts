import {describe, expect, it} from "vitest";
import {createInitialProject} from "../../app/createInitialProject";
import {createEditorStoreState, editorStoreReducer, selectVisibility} from "./editorStore";

describe("Editable Scene authoritative store", () => {
    it("propagates authoring facts once while preserving independent visibility and compile inclusion", () => {
        const initial = editorStoreReducer(
            editorStoreReducer(createEditorStoreState(createInitialProject()), {type: "mark-run-results-fresh"}),
            {type: "set-validation-result", errors: [], warnings: []},
        );
        const entity = initial.scene.project!.scene.entities[0];
        const ref = {kind: entity.kind, id: entity.id};

        const hidden = editorStoreReducer(initial, {type: "set-visible", ref, visible: false});

        expect(hidden.scene.project!.scene.entities[0].visible).toBe(false);
        expect(hidden.scene.project!.scene.entities[0].includedInCompile).toBe(entity.includedInCompile);
        expect(selectVisibility(hidden)[`${entity.kind}:${entity.id}`]).toMatchObject({
            visible: false,
            includedInCompile: entity.includedInCompile ?? true,
        });
        expect(hidden.validation.errors).toEqual([]);
        expect(hidden.stale).toMatchObject({
            validationStale: true,
            compiledProblemStale: true,
            runResultsStale: true,
        });
    });

    it("keeps prior run identity when a later authoring change marks results stale", () => {
        const initial = createEditorStoreState(createInitialProject());
        const completed = editorStoreReducer(
            editorStoreReducer(initial, {type: "set-run-status", status: "completed", runId: "run-32"}),
            {type: "mark-run-results-fresh"},
        );
        const entity = completed.scene.project!.scene.entities[0];
        const changed = editorStoreReducer(completed, {
            type: "set-included-in-compile",
            ref: {kind: entity.kind, id: entity.id},
            includedInCompile: false,
        });

        expect(changed.run.lastCompletedRunId).toBe("run-32");
        expect(changed.stale.runResultsStale).toBe(true);
    });

    it("does not stale derived physics when selection changes and clears deleted selection", () => {
        const initial = createEditorStoreState(createInitialProject());
        const entity = initial.scene.project!.scene.entities[0];
        const ref = {kind: entity.kind, id: entity.id};
        const selected = editorStoreReducer(initial, {type: "select-one", ref});

        expect(selected.stale).toEqual(initial.stale);

        const deleted = editorStoreReducer(selected, {type: "delete-project-entity", ref});
        expect(deleted.selection.selected).toEqual([]);
        expect(deleted.scene.project!.scene.entities.some((candidate) => candidate.id === entity.id)).toBe(false);
    });
});
