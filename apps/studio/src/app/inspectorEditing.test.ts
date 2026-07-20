import {describe, expect, it} from "vitest";
import type {SceneEntity} from "@transport/domain";
import type {EntityId} from "@transport/shared";
import {createInitialProject} from "./createInitialProject";
import {commitInspectorCandidate} from "./inspectorEditing";

describe("Inspector edit transaction", () => {
  it("immutably accepts a valid transform and kind-specific edit", () => {
    const project = createInitialProject();
    const source = project.scene.entities.find((entity) => entity.kind === "source")!;
    const candidate = {
      ...source,
      transform: {...source.transform, position: {x: 4, y: 5, z: 6}},
      energy: 2.5,
      strength: 3,
    } satisfies SceneEntity;

    const result = commitInspectorCandidate(project, candidate);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project).not.toBe(project);
    expect(project.scene.entities.find((entity) => entity.id === source.id)).toBe(source);
    expect(result.project.scene.entities.find((entity) => entity.id === source.id)).toMatchObject({
      energy: 2.5,
      strength: 3,
      transform: {position: {x: 4, y: 5, z: 6}},
    });
  });

  it("rejects invalid values without returning a partially changed project", () => {
    const project = createInitialProject();
    const source = project.scene.entities.find((entity) => entity.kind === "source")!;
    const candidate = {...source, energy: -1, strength: Number.NaN} satisfies SceneEntity;

    const result = commitInspectorCandidate(project, candidate);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      "inspector.source.energy.invalid",
      "inspector.source.strength.invalid",
    ]));
    expect(project.scene.entities.find((entity) => entity.id === source.id)).toBe(source);
  });

  it("rejects locked entities with an explanation", () => {
    const project = createInitialProject();
    const geometry = project.scene.entities.find((entity) => entity.kind === "geometry")!;
    const locked = {...geometry, locked: true} satisfies SceneEntity;
    const lockedProject = {
      ...project,
      scene: {...project.scene, entities: project.scene.entities.map((entity) => entity.id === locked.id ? locked : entity)},
    };

    const result = commitInspectorCandidate(lockedProject, {...locked, transform: {...locked.transform, scale: {x: 2, y: 2, z: 2}}});

    expect(result).toMatchObject({ok: false, diagnostics: [{code: "inspector.entity.locked"}]});
  });

  it("rejects candidates for a different kind or missing selection", () => {
    const project = createInitialProject();
    const geometry = project.scene.entities.find((entity) => entity.kind === "geometry")!;

    expect(commitInspectorCandidate(project, {...geometry, id: "missing" as SceneEntity["id"]})).toMatchObject({
      ok: false,
      diagnostics: [{code: "inspector.entity.missing"}],
    });
  });

  it("does not let an identical error on another entity mask a new domain error", () => {
    const project = createInitialProject();
    const geometry = project.scene.entities.find((entity) => entity.kind === "geometry")!;
    const missingMaterialId = "material-missing" as EntityId;
    const firstInvalid = {...geometry, name: "Repeated Geometry", materialId: missingMaterialId};
    const second = {...geometry, id: "geometry-2" as EntityId, name: "Repeated Geometry"};
    const baselineProject = {
      ...project,
      scene: {
        ...project.scene,
        entities: project.scene.entities
          .map((entity) => entity.id === geometry.id ? firstInvalid : entity)
          .concat(second),
      },
    };

    const result = commitInspectorCandidate(baselineProject, {...second, materialId: missingMaterialId});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "entity.material.invalid",
      entityId: second.id,
    }));
  });
});
