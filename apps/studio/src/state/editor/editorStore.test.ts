import {describe, expect, it} from "vitest";
import {createInitialProject} from "../../app/createInitialProject";
import {createEditorStoreState, editorStoreReducer, selectVisibility} from "./editorStore";

describe("Editable Scene authoritative store", () => {
    it("propagates authoring facts once while preserving independent visibility and compile inclusion", () => {
        const initial = editorStoreReducer(
            createEditorStoreState(createInitialProject()),
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
        });
    });

    it("keeps editable-scene staleness separate from Run Session result state", () => {
        const initial = createEditorStoreState(createInitialProject());
        const entity = initial.scene.project!.scene.entities[0];
        const changed = editorStoreReducer(initial, {
            type: "set-included-in-compile",
            ref: {kind: entity.kind, id: entity.id},
            includedInCompile: false,
        });

        expect(changed.stale.compiledProblemStale).toBe(true);
        expect("run" in changed).toBe(false);
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
