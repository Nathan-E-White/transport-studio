import {describe, expect, it} from "vitest";
import {
  EDITOR_MODES,
  getEditorModeBehavior,
  getModeEditingDisabledReason,
  getModeEntityEmphasis,
  isEntityKindSelectableInMode,
} from "./modes";

describe("editor mode behavior", () => {
  it("documents a distinct interaction and viewport presentation for every public mode", () => {
    const behaviors = EDITOR_MODES.map(getEditorModeBehavior);

    expect(new Set(behaviors.map((behavior) => behavior.description)).size).toBe(EDITOR_MODES.length);
    expect(new Set(behaviors.map((behavior) => behavior.viewportEmphasis)).size).toBe(EDITOR_MODES.length);
    expect(behaviors.every((behavior) => behavior.selectableKinds.length > 0)).toBe(true);
    expect(getEditorModeBehavior("design").editingEnabled).toBe(true);
    expect(EDITOR_MODES.filter((mode) => getEditorModeBehavior(mode).editingEnabled)).toEqual(["design"]);
  });

  it("makes selection policy explicit for representative entity kinds", () => {
    expect(isEntityKindSelectableInMode("design", "material")).toBe(true);
    expect(isEntityKindSelectableInMode("probe", "material")).toBe(false);
    expect(isEntityKindSelectableInMode("run", "source")).toBe(true);
    expect(isEntityKindSelectableInMode("run", "geometry")).toBe(false);
    expect(isEntityKindSelectableInMode("analyze", "tally")).toBe(true);
    expect(isEntityKindSelectableInMode("analyze", "source")).toBe(false);
    expect(isEntityKindSelectableInMode("debug", "material")).toBe(true);
  });

  it("explains read-only modes and gives every mode a distinct emphasis profile", () => {
    expect(getModeEditingDisabledReason("design")).toBeUndefined();
    expect(getModeEditingDisabledReason("probe")).toContain("Switch to Design mode");

    const profiles = EDITOR_MODES.map((mode) => ["geometry", "material", "source", "tally"]
      .map((kind) => getModeEntityEmphasis(mode, kind as "geometry" | "material" | "source" | "tally")).join(","));
    expect(new Set(profiles).size).toBe(EDITOR_MODES.length);
  });
});
