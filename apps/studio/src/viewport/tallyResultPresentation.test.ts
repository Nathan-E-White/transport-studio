import {describe, expect, it} from "vitest";
import type {SceneEntity, TransportTallyDelta} from "@transport/domain";
import type {EntityId} from "@transport/shared";
import {createTallyResultPresentation} from "./tallyResultPresentation";

const tally = {
  id: "tally-grid" as EntityId,
  kind: "tally",
  name: "Flux Grid",
  tags: [],
  visible: true,
  locked: false,
  transform: {
    position: {x: 0, y: 0, z: 0},
    rotationEuler: {x: 0, y: 0, z: 0},
    scale: {x: 2, y: 1, z: 1},
  },
  tallyKind: "voxel-flux",
  particleTypes: ["photon"],
  bins: [2, 1, 1],
} satisfies SceneEntity;

describe("truthful viewport tally presentation", () => {
  it("renders the selected compatible tally's accumulated bins and replaces values from newer results", () => {
    const first = createTallyResultPresentation(tally, [{tallyId: tally.id, scores: [1, 2]}]);
    const replacement = createTallyResultPresentation(tally, [{tallyId: tally.id, scores: [4, 6]}]);

    expect(first).toMatchObject({status: "ready", kind: "statistical-tally-result", tallyId: tally.id});
    if (first.status !== "ready" || replacement.status !== "ready") return;
    expect(first.cells.map((cell) => cell.value)).toEqual([1, 2]);
    expect(replacement.cells.map((cell) => cell.value)).toEqual([4, 6]);
    expect(replacement.cells).not.toEqual(first.cells);
  });

  it("stays inactive for a non-tally selection and diagnoses an empty selected result", () => {
    const geometry = {...tally, id: "geometry-1" as EntityId, kind: "geometry", primitive: "box", parameters: {width: 1, height: 1, depth: 1}} as SceneEntity;

    expect(createTallyResultPresentation(geometry, [])).toEqual({status: "inactive"});
    expect(createTallyResultPresentation(tally, [])).toMatchObject({
      status: "diagnostic",
      diagnostic: {code: "tally.result.missing", severity: "info"},
    });
  });

  it("diagnoses incompatible and unsupported result shapes without fabricating cells", () => {
    const incompatible: TransportTallyDelta = {tallyId: tally.id, scores: [1, 2, 3]};
    expect(createTallyResultPresentation(tally, [incompatible])).toMatchObject({
      status: "diagnostic",
      diagnostic: {code: "tally.result.shape.incompatible", severity: "warning"},
    });

    const unshaped = {...tally, bins: undefined};
    expect(createTallyResultPresentation(unshaped, [{tallyId: tally.id, scores: [1, 2]}])).toMatchObject({
      status: "diagnostic",
      diagnostic: {code: "tally.result.shape.unsupported", severity: "warning"},
    });
  });

  it("preserves score sign and exposes selected values accessibly", () => {
    const result = createTallyResultPresentation(tally, [{tallyId: tally.id, scores: [-2, 4]}]);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.cells.map((cell) => cell.sign)).toEqual(["negative", "positive"]);
    expect(result.cells.map((cell) => cell.intensity)).toEqual([0.5, 1]);
    expect(result.label).toContain("range -2 to 4");
    expect(result.accessibleLabel).toContain("Values: -2, 4");
  });

  it("diagnoses grids too large for safe viewport presentation", () => {
    const large = {...tally, bins: [5_000, 1, 1] as const};
    const result = createTallyResultPresentation(large, [{tallyId: tally.id, scores: Array(5_000).fill(1)}]);

    expect(result).toMatchObject({
      status: "diagnostic",
      diagnostic: {code: "tally.result.shape.unsupported", severity: "warning"},
    });
  });

  it("preserves the actual suppression diagnostic instead of relabeling malformed data as missing", () => {
    const result = createTallyResultPresentation(tally, [], [{
      severity: "error",
      code: "run.tally.delta_shape_mismatch",
      message: "The tally stream changed shape.",
      entityId: tally.id,
    }]);

    expect(result).toMatchObject({
      status: "diagnostic",
      diagnostic: {code: "run.tally.delta_shape_mismatch", severity: "error"},
    });
  });
});
