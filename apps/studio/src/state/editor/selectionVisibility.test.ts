import {describe, expect, it} from "vitest";
import {
    EMPTY_SELECTION_STATE,
    isSelected,
    removeEntityFromSelection,
    selectMany,
} from "./selection";
import {
    DEFAULT_ENTITY_VIEW_FLAGS,
    HELPER_ENTITY_VIEW_FLAGS,
} from "./visibility";

const first = {kind: "geometry", id: "first"} as const;
const second = {kind: "material", id: "second"} as const;
const missing = {kind: "source", id: "missing"} as const;

describe("editor selection and visibility invariants", () => {
    it("uses any matching selected entity and removes only the requested reference", () => {
        const selected = selectMany(EMPTY_SELECTION_STATE, [first, second, first]);

        expect(selected.selected).toEqual([first, second]);
        expect(isSelected(selected, first)).toBe(true);
        expect(isSelected(selected, second)).toBe(true);
        expect(isSelected(selected, missing)).toBe(false);

        const withHover = {...selected, hovered: first};
        const removed = removeEntityFromSelection(withHover, first);
        expect(removed.selected).toEqual([second]);
        expect(removed.hovered).toBeNull();
        expect(removed.inspectorFocus).toEqual(second);
    });

    it("keeps ordinary entities selectable and compilable while helpers stay excluded", () => {
        expect(DEFAULT_ENTITY_VIEW_FLAGS).toEqual({
            visible: true,
            selectable: true,
            locked: false,
            includedInCompile: true,
            helperOnly: false,
        });
        expect(HELPER_ENTITY_VIEW_FLAGS).toEqual({
            visible: true,
            selectable: true,
            locked: false,
            includedInCompile: false,
            helperOnly: true,
        });
    });
});
