import {describe, expect, it, vi} from "vitest";
import type {SceneEntity} from "@transport/domain";
import {IDENTITY_TRANSFORM} from "@transport/shared";
import {getViewportEntityPresentation, pickViewportEntity} from "./viewportEntityPresentation";

const geometry: SceneEntity = {
  id: "geometry-1" as SceneEntity["id"],
  kind: "geometry",
  name: "Helper plane",
  tags: [],
  visible: true,
  locked: false,
  transform: IDENTITY_TRANSFORM,
  primitive: "box",
  parameters: {width: 1, height: 1, depth: 1},
};

describe("viewport entity presentation", () => {
  it("keeps hidden and non-selectable independent from locked and helper-only state", () => {
    expect(getViewportEntityPresentation(geometry, {
      "geometry:geometry-1": {
        visible: false,
        selectable: false,
        locked: true,
        includedInCompile: false,
        helperOnly: true,
      },
    })).toEqual({visible: false, selectable: false, locked: true, helperOnly: true});
  });

  it("keeps a visible helper selectable under the modeled helper defaults", () => {
    const presentation = getViewportEntityPresentation(geometry, {
      "geometry:geometry-1": {
        visible: true,
        selectable: true,
        locked: false,
        includedInCompile: false,
        helperOnly: true,
      },
    });
    expect(presentation).toEqual({visible: true, selectable: true, locked: false, helperOnly: true});
    const onSelect = vi.fn();
    expect(pickViewportEntity(geometry, presentation, onSelect)).toBe(true);
    expect(onSelect).toHaveBeenCalledWith(geometry.id);
  });

  it("refuses viewport picks for hidden or non-selectable entities", () => {
    const onSelect = vi.fn();
    expect(pickViewportEntity(geometry, {visible: true, selectable: false, locked: false, helperOnly: false}, onSelect)).toBe(false);
    expect(pickViewportEntity(geometry, {visible: false, selectable: true, locked: false, helperOnly: false}, onSelect)).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
