import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {Diagnostic, Project, SceneEntity} from "@transport/domain";
import {
  EditorDiagnostic,
  EditorEntityMetadata,
  EditorEntityRef,
  EditorStateRoot,
  VisibilityTable,
  buildProjectTree,
  getEntityViewFlags,
  useEditorStore,
} from "../../state/editor";
import {ProjectTreeBadgesScope} from "./Badges/ProjectTreeBadgesScope";
import {ProjectTreeEmptyState} from "./EmptyState/ProjectTreeEmptyState";
import {ProjectTreeGroup, ProjectTreeMetadataDraft} from "./Group/ProjectTreeGroup";
import {ProjectTreeIconsScope} from "./Icons/ProjectTreeIconsScope";
import {ProjectTreeBoundary} from "./ProjectTreeBoundary";
import {ProjectTreeProvider} from "./ProjectTreeProvider";

export interface ProjectTreeProps {
  readonly project: Project;
  readonly selectedEntityId?: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly stats?: {readonly geometry: number; readonly materials: number; readonly sources: number; readonly tallies: number};
  readonly onSelect: (entityId: string | undefined) => void;
  readonly onCreateEntity: (kind: SceneEntity["kind"]) => void;
  readonly onUpdateEntityMetadata: (
    entityId: string,
    patch: {readonly name?: string; readonly description?: string; readonly tags?: readonly string[]},
  ) => void;
  readonly onDuplicateEntity: (entityId: string) => void;
  readonly onDeleteEntity: (entityId: string) => void;
  readonly onSetEntityVisible: (entityId: string, visible: boolean) => void;
  readonly onSetEntityLocked: (entityId: string, locked: boolean) => void;
}

const CREATE_KINDS: readonly SceneEntity["kind"][] = ["geometry", "material", "source", "tally"];

export function ProjectTree(props: Readonly<ProjectTreeProps>) {
  return (
    <ProjectTreeBoundary>
      <EditorStateRoot>
        <ProjectTreeInner {...props}/>
      </EditorStateRoot>
    </ProjectTreeBoundary>
  );
}

function ProjectTreeInner({
  project,
  selectedEntityId,
  diagnostics,
  onSelect,
  onCreateEntity,
  onUpdateEntityMetadata,
  onDuplicateEntity,
  onDeleteEntity,
  onSetEntityVisible,
  onSetEntityLocked,
}: Readonly<ProjectTreeProps>) {
  const {state, dispatch} = useEditorStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingEntityId, setEditingEntityId] = useState<string | undefined>();
  const [drafts, setDrafts] = useState<Record<string, ProjectTreeMetadataDraft>>({});
  const visibilityRef = useRef(state.visibility);

  useEffect(() => {
    visibilityRef.current = state.visibility;
  }, [state.visibility]);

  const entitiesById = useMemo(
    () => new Map<string, SceneEntity>(project.scene.entities.map((entity) => [entity.id, entity])),
    [project.scene.entities],
  );

  useEffect(() => {
    const visibility: VisibilityTable = Object.fromEntries(
      project.scene.entities.map((entity) => {
        const ref = entityRefForEntity(entity);
        const current = getEntityViewFlags(visibilityRef.current, ref);

        return [
          `${entity.kind}:${entity.id}`,
          {
            ...current,
            visible: entity.visible,
            locked: entity.locked,
          },
        ];
      }),
    );

    dispatch({
      type: "hydrate-project-tree",
      entities: project.scene.entities.map(entityToMetadata),
      visibility,
    });
  }, [dispatch, project.scene.entities]);

  useEffect(() => {
    const errors: EditorDiagnostic[] = [];
    const warnings: EditorDiagnostic[] = [];

    for (const diagnostic of diagnostics) {
      const normalized = normalizeDiagnostic(diagnostic, project.scene.entities);
      if (!normalized) {
        continue;
      }

      if (normalized.severity === "error") {
        errors.push(normalized);
      } else if (normalized.severity === "warning") {
        warnings.push(normalized);
      }
    }

    dispatch({type: "set-validation-result", errors, warnings});
  }, [diagnostics, dispatch, project.scene.entities]);

  useEffect(() => {
    const selected = selectedEntityId ? entitiesById.get(selectedEntityId) : undefined;

    if (!selected) {
      dispatch({type: "clear-selection"});
      return;
    }

    dispatch({type: "select-one", ref: entityRefForEntity(selected)});
  }, [dispatch, entitiesById, selectedEntityId]);

  const filteredMetadata = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const metadata = Object.values(state.scene.entities);

    if (!query) {
      return metadata;
    }

    return metadata.filter((entity) => matchesSearch(entity, query));
  }, [searchQuery, state.scene.entities]);

  const groups = useMemo(
    () => buildProjectTree({entities: filteredMetadata, visibility: state.visibility}),
    [filteredMetadata, state.visibility],
  );

  const stats = useMemo(() => getSceneStats(project.scene.entities), [project.scene.entities]);
  const visibleRows = groups.reduce((count, group) => count + (group.children?.length ?? 0), 0);

  const selectEntity = useCallback((ref: EditorEntityRef) => {
    onSelect(ref.id);
  }, [onSelect]);

  const requestEdit = useCallback((ref: EditorEntityRef) => {
    const entity = entitiesById.get(ref.id);
    if (!entity) {
      return;
    }

    setEditingEntityId(ref.id);
    setDrafts((current) => ({
      ...current,
      [ref.id]: draftForEntity(entity),
    }));
  }, [entitiesById]);

  const saveDraft = useCallback((node: {readonly entityRef?: EditorEntityRef}) => {
    const ref = node.entityRef;
    if (!ref) {
      return;
    }

    const draft = drafts[ref.id];
    if (!draft) {
      return;
    }

    onUpdateEntityMetadata(ref.id, {
      name: draft.name.trim() || "Untitled Entity",
      description: draft.description.trim(),
      tags: parseTags(draft.tags),
    });
    setEditingEntityId(undefined);
  }, [drafts, onUpdateEntityMetadata]);

  const deleteEntity = useCallback((ref: EditorEntityRef) => {
    const deletedIndex = project.scene.entities.findIndex((entity) => entity.id === ref.id);
    const nextSelection = project.scene.entities[deletedIndex + 1]
      ?? project.scene.entities[deletedIndex - 1]
      ?? project.scene.entities.find((entity) => entity.id !== ref.id);

    onDeleteEntity(ref.id);
    onSelect(nextSelection?.id);
  }, [onDeleteEntity, onSelect, project.scene.entities]);

  return (
    <ProjectTreeProvider
      selectedEntityId={selectedEntityId}
      editingEntityId={editingEntityId}
      onSelect={selectEntity}
      onRequestEdit={requestEdit}
      onDuplicate={(ref) => onDuplicateEntity(ref.id)}
      onDelete={deleteEntity}
      onVisibleChange={(ref, visible) => onSetEntityVisible(ref.id, visible)}
      onLockedChange={(ref, locked) => onSetEntityLocked(ref.id, locked)}
      onCompileInclusionChange={() => undefined}
      onCreateEntity={onCreateEntity}
      allowDelete
    >
      <ProjectTreeIconsScope>
        <ProjectTreeBadgesScope>
          <section className="panel project-panel" aria-label="Project tree">
            <div className="panel-header">
              <div>
                <h2>{project.name}</h2>
                <p className="muted compact">{project.metadata.physicsModelVersion}</p>
              </div>
              <button className="icon-button" type="button" title="Project settings">⚙</button>
            </div>

            <div className="stat-grid">
              <Stat label="geom" value={stats.geometry}/>
              <Stat label="mat" value={stats.materials}/>
              <Stat label="src" value={stats.sources}/>
              <Stat label="tally" value={stats.tallies}/>
            </div>

            <div className="project-tree-create" aria-label="Create entities">
              {CREATE_KINDS.map((kind) => (
                <button key={kind} type="button" onClick={() => onCreateEntity(kind)}>
                  + {labelForKind(kind)}
                </button>
              ))}
            </div>

            <label className="asset-search">
              <span>Search entities</span>
              <input
                value={searchQuery}
                placeholder="Name, kind, tag, description"
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>

            <div className="project-tree__groups" role="tree" aria-label="Project entities">
              {visibleRows === 0 ? (
                <ProjectTreeEmptyState searchQuery={searchQuery}/>
              ) : (
                groups
                  .filter((group) => !searchQuery.trim() || (group.children?.length ?? 0) > 0)
                  .map((group) => (
                    <ProjectTreeGroup
                      key={group.id}
                      node={group}
                      editingEntityId={editingEntityId}
                      getDraftForNode={(node) => {
                        const ref = node.entityRef;
                        const entity = ref ? entitiesById.get(ref.id) : undefined;
                        return ref ? drafts[ref.id] ?? (entity ? draftForEntity(entity) : EMPTY_DRAFT) : EMPTY_DRAFT;
                      }}
                      onDraftChange={(node, draft) => {
                        const ref = node.entityRef;
                        if (!ref) {
                          return;
                        }
                        setDrafts((current) => ({...current, [ref.id]: draft}));
                      }}
                      onSaveDraft={saveDraft}
                      onCancelDraft={() => setEditingEntityId(undefined)}
                    />
                  ))
              )}
            </div>
          </section>
        </ProjectTreeBadgesScope>
      </ProjectTreeIconsScope>
    </ProjectTreeProvider>
  );
}

function Stat({label, value}: {readonly label: string; readonly value: number}) {
  return <div className="stat-card"><strong>{value}</strong><span>{label}</span></div>;
}

function getSceneStats(entities: readonly SceneEntity[]) {
  return {
    geometry: entities.filter((entity) => entity.kind === "geometry").length,
    materials: entities.filter((entity) => entity.kind === "material").length,
    sources: entities.filter((entity) => entity.kind === "source").length,
    tallies: entities.filter((entity) => entity.kind === "tally").length,
  };
}

function entityToMetadata(entity: SceneEntity): EditorEntityMetadata {
  return {
    id: entity.id,
    kind: entity.kind,
    name: entity.name,
    description: getDescription(entity),
    tags: entity.tags,
  };
}

function entityRefForEntity(entity: SceneEntity): EditorEntityRef {
  return {
    id: entity.id,
    kind: entity.kind,
  };
}

function normalizeDiagnostic(
  diagnostic: Diagnostic,
  entities: readonly SceneEntity[],
): EditorDiagnostic | null {
  const entity = diagnostic.entityId
    ? entities.find((candidate) => candidate.id === diagnostic.entityId)
    : undefined;

  return {
    id: `${diagnostic.severity}:${diagnostic.entityId ?? "project"}:${diagnostic.message}`,
    severity: diagnostic.severity,
    message: diagnostic.message,
    entity: entity ? entityRefForEntity(entity) : undefined,
  };
}

function matchesSearch(entity: EditorEntityMetadata, query: string): boolean {
  return [
    entity.name,
    entity.kind,
    entity.description ?? "",
    ...(entity.tags ?? []),
  ].some((value) => value.toLowerCase().includes(query));
}

function draftForEntity(entity: SceneEntity): ProjectTreeMetadataDraft {
  return {
    name: entity.name,
    description: getDescription(entity),
    tags: entity.tags.join(", "),
  };
}

function getDescription(entity: SceneEntity): string {
  const description = entity.metadata?.description;
  return typeof description === "string" ? description : "";
}

function parseTags(value: string): readonly string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function labelForKind(kind: SceneEntity["kind"]): string {
  switch (kind) {
    case "geometry":
      return "Geometry";
    case "material":
      return "Material";
    case "source":
      return "Source";
    case "tally":
      return "Tally";
  }
}

const EMPTY_DRAFT: ProjectTreeMetadataDraft = {
  name: "",
  description: "",
  tags: "",
};
