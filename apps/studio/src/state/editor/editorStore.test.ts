import {describe, expect, it} from "vitest";
import {createInitialProject} from "../../app/createInitialProject";
import {compileTransportProblem} from "@transport/domain/compile/CompileTransportProblem";
import {createEditorStoreState, editorStoreReducer, selectVisibility} from "./editorStore";

describe("Editable Scene authoritative store", () => {
    it("propagates authoring facts once while preserving independent visibility and compile inclusion", () => {
        const initial = editorStoreReducer(
            createEditorStoreState(createInitialProject()),
            {type: "set-validation-result", diagnostics: []},
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
        expect(hidden.validation.diagnostics).toEqual([]);
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

    it("rejects non-selectable selection while preserving hidden, locked, and helper eligibility", () => {
        const project = createInitialProject();
        const [material, geometry, source, tally] = project.scene.entities;
        const ref = (entity: typeof material) => ({kind: entity.kind, id: entity.id});
        const initial = createEditorStoreState(project, {
            [`${material.kind}:${material.id}`]: {visible: true, selectable: false, locked: false, includedInCompile: true, helperOnly: false},
            [`${geometry.kind}:${geometry.id}`]: {visible: true, selectable: true, locked: false, includedInCompile: false, helperOnly: true},
            [`${source.kind}:${source.id}`]: {visible: false, selectable: true, locked: false, includedInCompile: true, helperOnly: false},
            [`${tally.kind}:${tally.id}`]: {visible: true, selectable: true, locked: true, includedInCompile: true, helperOnly: false},
        });

        expect(initial.selection.selected).toEqual([ref(geometry)]);
        expect(editorStoreReducer(initial, {type: "select-one", ref: ref(material)})).toBe(initial);

        const hiddenSelected = editorStoreReducer(initial, {type: "select-one", ref: ref(source)});
        expect(hiddenSelected.selection.selected).toEqual([ref(source)]);
        const lockedSelected = editorStoreReducer(hiddenSelected, {type: "select-one", ref: ref(tally)});
        expect(lockedSelected.selection.selected).toEqual([ref(tally)]);

        const madeIneligible = editorStoreReducer(lockedSelected, {type: "set-selectable", ref: ref(tally), selectable: false});
        expect(madeIneligible.selection.selected).toEqual([]);
        expect(selectVisibility(madeIneligible)[`${tally.kind}:${tally.id}`].selectable).toBe(false);
    });

    it("reconciles initial helper-only exclusion into the project compiled by the app", () => {
        const project = createInitialProject();
        const tally = project.scene.entities.find((entity) => entity.kind === "tally")!;
        const initial = createEditorStoreState(project, {
            [`${tally.kind}:${tally.id}`]: {
                visible: true,
                selectable: true,
                locked: false,
                includedInCompile: false,
                helperOnly: true,
            },
        });

        expect(initial.scene.project!.scene.entities.find((entity) => entity.id === tally.id)?.includedInCompile).toBe(false);
        const compiled = compileTransportProblem(initial.scene.project!);
        expect(compiled.ok).toBe(true);
        expect(compiled.value?.tallies.some((candidate) => candidate.id === tally.id)).toBe(false);
    });
});
