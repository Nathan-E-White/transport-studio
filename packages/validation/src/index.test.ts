import {describe, expect, it} from "vitest";
import type {Project, SceneEntity} from "@transport/domain";
import {validateProject} from "./index";

function projectWith(entities: readonly SceneEntity[]): Project {
  return {scene: {entities}} as Project;
}

describe("validateProject", () => {
  it("reports missing run inputs and geometry material assignments", () => {
    expect(validateProject(projectWith([]))).toEqual([
      {severity: "warning", message: "No source has been defined."},
      {
        severity: "warning",
        message: "No tally has been defined. The run will produce tracks but no aggregate score.",
      },
    ]);

    const geometry = {
      kind: "geometry",
      id: "shield",
      name: "Shield",
    } as SceneEntity;
    const source = {kind: "source", id: "beam", name: "Beam"} as SceneEntity;
    const tally = {kind: "tally", id: "flux", name: "Flux"} as SceneEntity;

    expect(validateProject(projectWith([tally]))).toEqual([
      {severity: "warning", message: "No source has been defined."},
    ]);
    expect(validateProject(projectWith([source]))).toEqual([
      {
        severity: "warning",
        message: "No tally has been defined. The run will produce tracks but no aggregate score.",
      },
    ]);

    expect(validateProject(projectWith([geometry, source, tally]))).toEqual([
      {
        severity: "warning",
        message: "Geometry 'Shield' has no material assigned.",
        entityId: "shield",
      },
    ]);
    expect(
      validateProject(projectWith([{...geometry, materialId: "water"} as SceneEntity, source, tally])),
    ).toEqual([]);
  });
});
