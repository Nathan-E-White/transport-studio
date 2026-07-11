import {afterEach, describe, expect, it, vi} from "vitest";
import {createInitialProject} from "./createInitialProject";
import {
  addEntity,
  deleteEntity,
  duplicateEntity,
  updateEntityMetadata,
  setEntityIncludedInCompile,
  setEntityLocked,
  setEntityVisible,
} from "./projectMutations";

describe("projectMutations", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates metadata on canonical scene entities", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T00:00:00.000Z"));
    const project = createInitialProject();
    const entity = project.scene.entities[1];

    vi.setSystemTime(new Date("2026-06-27T00:01:00.000Z"));
    const nextProject = updateEntityMetadata(project, entity.id, {
      name: "Shield Plate",
      description: "front slab",
      tags: ["shield", "primary"],
    });

    expect(nextProject.scene.entities[1]).toMatchObject({
      id: entity.id,
      name: "Shield Plate",
      tags: ["shield", "primary"],
      metadata: {
        description: "front slab",
      },
    });
    expect(nextProject.metadata.modifiedAt).toBe("2026-06-27T00:01:00.000Z");
  });

  it("updates visibility and lock flags on canonical scene entities", () => {
    const project = createInitialProject();
    const entity = project.scene.entities[1];

    const hiddenProject = setEntityVisible(project, entity.id, false);
    const lockedProject = setEntityLocked(hiddenProject, entity.id, true);
    const updatedEntity = lockedProject.scene.entities.find((candidate) => candidate.id === entity.id);

    expect(updatedEntity).toMatchObject({
      visible: false,
      locked: true,
    });
  });

  it("updates compile inclusion without changing viewport visibility", () => {
    const project = createInitialProject();
    const entity = project.scene.entities[1];

    const nextProject = setEntityIncludedInCompile(project, entity.id, false);
    const updatedEntity = nextProject.scene.entities.find((candidate) => candidate.id === entity.id);

    expect(updatedEntity).toMatchObject({
      visible: entity.visible,
      includedInCompile: false,
    });
  });

  it("duplicates an entity and selects a fresh id", () => {
    const project = createInitialProject();
    const entity = project.scene.entities[1];

    const nextProject = duplicateEntity(project, entity.id);
    const duplicated = nextProject.scene.entities.at(-1);

    expect(duplicated).toMatchObject({
      name: `${entity.name} Copy`,
      kind: entity.kind,
    });
    expect(duplicated?.id).not.toBe(entity.id);
  });

  it("creates entity shells for existing editor kinds", () => {
    const project = createInitialProject();

    const nextProject = addEntity(project, "source");
    const source = nextProject.scene.entities.at(-1);

    expect(source).toMatchObject({
      kind: "source",
      name: "New Source",
      visible: true,
      locked: false,
    });
  });

  it("deletes entities from the canonical project", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T00:00:00.000Z"));
    const project = createInitialProject();
    const entity = project.scene.entities[1];

    vi.setSystemTime(new Date("2026-06-27T00:01:00.000Z"));
    const nextProject = deleteEntity(project, entity.id);

    expect(nextProject.scene.entities.some((candidate) => candidate.id === entity.id)).toBe(false);
    expect(nextProject.metadata.modifiedAt).toBe("2026-06-27T00:01:00.000Z");
  });
});
