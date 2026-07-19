import type {Project, SceneEntity, EntityKind} from "@transport/domain";
import {IDENTITY_TRANSFORM} from "@transport/shared";

export interface EntityMetadataPatch {
  readonly name?: string;
  readonly tags?: readonly string[];
  readonly description?: string;
}

export interface EditableProjectSettings {
  readonly name: string;
  readonly histories: number;
  readonly batchSize: number;
  readonly seed: number;
  readonly visibleHistoryBudget: number;
}

export function validateProjectSettings(settings: EditableProjectSettings): readonly string[] {
  const errors: string[] = [];
  if (!settings.name.trim()) errors.push("Project name is required.");
  for (const [label, value] of [
    ["Histories", settings.histories],
    ["Batch size", settings.batchSize],
    ["Seed", settings.seed],
    ["Visible history budget", settings.visibleHistoryBudget],
  ] as const) {
    if (!Number.isInteger(value) || value <= 0) errors.push(`${label} must be a positive integer.`);
  }
  return errors;
}

export function updateProjectSettings(project: Project, settings: EditableProjectSettings): Project {
  return {
    ...project,
    name: settings.name,
    runConfiguration: {
      ...project.runConfiguration,
      histories: settings.histories,
      batchSize: settings.batchSize,
      seed: settings.seed,
      visibleHistoryBudget: settings.visibleHistoryBudget,
    },
    metadata: {...project.metadata, modifiedAt: new Date().toISOString()},
  };
}

export function addEntity(project: Project, kind: SceneEntity["kind"]): Project {
  return updateProjectEntities(project, [...project.scene.entities, createDefaultEntity(kind)]);
}

export function updateEntityMetadata(
  project: Project,
  entityId: string,
  patch: EntityMetadataPatch,
): Project {
  return updateProjectEntities(
    project,
    project.scene.entities.map((entity) => {
      if (entity.id !== entityId) {
        return entity;
      }

      return {
        ...entity,
        name: patch.name ?? entity.name,
        tags: patch.tags ?? entity.tags,
        metadata: {
          ...entity.metadata,
          description: patch.description ?? getEntityDescription(entity),
        },
      } as SceneEntity;
    }),
  );
}

export function duplicateEntity(project: Project, entityId: string): Project {
  const entity = project.scene.entities.find((candidate) => candidate.id === entityId);

  if (!entity) {
    return project;
  }

  const copy = {
    ...entity,
    id: createEntityId(entity.kind),
    name: `${entity.name} Copy`,
  } as SceneEntity;

  return updateProjectEntities(project, [...project.scene.entities, copy]);
}

export function deleteEntity(project: Project, entityId: string): Project {
  return updateProjectEntities(
    project,
    project.scene.entities.filter((entity) => entity.id !== entityId),
  );
}

export function replaceEntity(project: Project, candidate: SceneEntity): Project {
  const current = project.scene.entities.find((entity) => entity.id === candidate.id);
  if (!current || current.kind !== candidate.kind) return project;
  return updateProjectEntities(
    project,
    project.scene.entities.map((entity) => entity.id === candidate.id ? candidate : entity),
  );
}

export function setEntityVisible(project: Project, entityId: string, visible: boolean): Project {
  return updateProjectEntities(
    project,
    project.scene.entities.map((entity) =>
      entity.id === entityId ? ({...entity, visible} as SceneEntity) : entity,
    ),
  );
}

export function setEntityIncludedInCompile(
  project: Project,
  entityId: string,
  includedInCompile: boolean,
): Project {
  return updateProjectEntities(
    project,
    project.scene.entities.map((entity) =>
      entity.id === entityId ? ({...entity, includedInCompile} as SceneEntity) : entity,
    ),
  );
}

export function setEntityLocked(project: Project, entityId: string, locked: boolean): Project {
  return updateProjectEntities(
    project,
    project.scene.entities.map((entity) =>
      entity.id === entityId ? ({...entity, locked} as SceneEntity) : entity,
    ),
  );
}

export function getEntityDescription(entity: SceneEntity): string {
  const description = entity.metadata?.description;
  return typeof description === "string" ? description : "";
}

export function createEntityId(kind: EntityKind): SceneEntity["id"] {
  return `${kind}_${crypto.randomUUID()}` as SceneEntity["id"];
}

function updateProjectEntities(project: Project, entities: readonly SceneEntity[]): Project {
  return {
    ...project,
    scene: {
      ...project.scene,
      entities,
    },
    metadata: {
      ...project.metadata,
      modifiedAt: new Date().toISOString(),
    },
  };
}

function createDefaultEntity(kind: SceneEntity["kind"]): SceneEntity {
  switch (kind) {
    case "geometry":
      return {
        id: createEntityId(kind),
        kind,
        name: "New Geometry",
        tags: [],
        visible: true,
        includedInCompile: true,
        locked: false,
        transform: IDENTITY_TRANSFORM,
        primitive: "box",
        parameters: {width: 1, height: 1, depth: 1},
      };

    case "material":
      return {
        id: createEntityId(kind),
        kind,
        name: "New Material",
        tags: [],
        visible: true,
        includedInCompile: true,
        locked: false,
        transform: IDENTITY_TRANSFORM,
        color: "#7aa2ff",
        attenuationCoefficient: 0.25,
        scatterProbability: 0.15,
        absorptionProbability: 0.1,
        anisotropy: 0,
      };

    case "source":
      return {
        id: createEntityId(kind),
        kind,
        name: "New Source",
        tags: [],
        visible: true,
        includedInCompile: true,
        locked: false,
        transform: IDENTITY_TRANSFORM,
        sourceKind: "pencil-beam",
        particleType: "photon",
        energy: 1,
        strength: 1,
        direction: {x: 1, y: 0, z: 0},
      };

    case "tally":
      return {
        id: createEntityId(kind),
        kind,
        name: "New Tally",
        tags: [],
        visible: true,
        includedInCompile: true,
        locked: false,
        transform: IDENTITY_TRANSFORM,
        tallyKind: "detector-hit",
        particleTypes: ["photon"],
      };
  }
}
