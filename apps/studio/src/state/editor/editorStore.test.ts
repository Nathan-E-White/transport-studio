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

    it("updates modeled project settings as one immutable transaction", () => {
        const initial = createEditorStoreState(createInitialProject());
        const originalProject = initial.scene.project!;
        const changed = editorStoreReducer(initial, {
            type: "update-project-settings",
            settings: {
                name: "Updated Project",
                histories: 250,
                batchSize: 25,
                seed: 17,
                visibleHistoryBudget: 20,
            },
        });

        expect(changed.scene.project).not.toBe(originalProject);
        expect(changed.scene.project).toMatchObject({
            name: "Updated Project",
            runConfiguration: {histories: 250, batchSize: 25, seed: 17, visibleHistoryBudget: 20},
        });
        expect(originalProject.name).not.toBe("Updated Project");
        expect(changed.stale.reasons).toContain("run-settings-changed");
    });

    it("rejects invalid project settings at the store boundary without dirtying or mutating the project", () => {
        const initial = createEditorStoreState(createInitialProject());
        const rejected = editorStoreReducer(initial, {
            type: "update-project-settings",
            settings: {
                name: " ",
                histories: 0,
                batchSize: Number.NaN,
                seed: -1,
                visibleHistoryBudget: 0,
            },
        });

        expect(rejected.scene.project).toBe(initial.scene.project);
        expect(rejected.stale).toBe(initial.stale);
        expect(rejected.projectSettingsErrors).toEqual([
            "Project name is required.",
            "Histories must be a positive integer.",
            "Batch size must be a positive integer.",
            "Seed must be a positive integer.",
            "Visible history budget must be a positive integer.",
        ]);
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

    it("atomically merges Inspector fields, preserves Tree changes, and rejects conflicts or locks", () => {
        const initial = createEditorStoreState(createInitialProject());
        const geometry = initial.scene.project!.scene.entities.find((entity) => entity.kind === "geometry")!;
        const changedEntity = {...geometry, transform: {...geometry.transform, position: {x: 9, y: 0, z: 0}}};
        const ref = {kind: geometry.kind, id: geometry.id};

        const hidden = editorStoreReducer(initial, {type: "set-visible", ref, visible: false});
        const changed = editorStoreReducer(hidden, {type: "apply-inspector-edit", baseline: geometry, candidate: changedEntity});
        expect(changed.scene.project!.scene.entities.find((entity) => entity.id === geometry.id)?.transform.position.x).toBe(9);
        expect(changed.scene.project!.scene.entities.find((entity) => entity.id === geometry.id)?.visible).toBe(false);
        expect(initial.scene.project!.scene.entities.find((entity) => entity.id === geometry.id)?.transform.position.x).toBe(0);

        const locked = editorStoreReducer(initial, {type: "set-locked", ref, locked: true});
        const lockedResult = editorStoreReducer(locked, {type: "apply-inspector-edit", baseline: geometry, candidate: changedEntity});
        expect(lockedResult.scene.project).toBe(locked.scene.project);
        expect(lockedResult.inspectorEditDiagnostics[0]?.code).toBe("inspector.entity.locked");

        const concurrentEntity = {...geometry, transform: {...geometry.transform, position: {x: 5, y: 0, z: 0}}};
        const concurrent = editorStoreReducer(initial, {type: "apply-inspector-edit", baseline: geometry, candidate: concurrentEntity});
        const conflict = editorStoreReducer(concurrent, {type: "apply-inspector-edit", baseline: geometry, candidate: changedEntity});
        expect(conflict.scene.project!.scene.entities.find((entity) => entity.id === geometry.id)?.transform.position.x).toBe(5);
        expect(conflict.inspectorEditDiagnostics[0]?.code).toBe("inspector.entity.conflict");

        const source = initial.scene.project!.scene.entities.find((entity) => entity.kind === "source")!;
        const selectedElsewhere = editorStoreReducer(conflict, {type: "select-one", ref: {kind: source.kind, id: source.id}});
        expect(selectedElsewhere.inspectorEditDiagnostics).toEqual([]);
    });
});
