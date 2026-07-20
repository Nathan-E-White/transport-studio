import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {Diagnostic, SceneEntity} from "@transport/domain";
import {
  EditorDiagnostic,
  EditorEntityMetadata,
  EditorEntityRef,
  buildProjectTree,
  getEditorModeBehavior,
  getModeEditingDisabledReason,
  getPrimarySelection,
  selectProjectTreeMetadata,
  selectVisibility,
  useEditorStore,
} from "../../state/editor";
import {ProjectTreeEmptyState} from "./EmptyState/ProjectTreeEmptyState";
import {ProjectTreeGroup, ProjectTreeMetadataDraft} from "./Group/ProjectTreeGroup";
import {ProjectTreeBoundary} from "./ProjectTreeBoundary";
import {ProjectSettingsDialog} from "./ProjectSettingsDialog";

export interface ProjectTreeProps {
  readonly diagnostics: readonly Diagnostic[];
}

const CREATE_KINDS: readonly SceneEntity["kind"][] = ["geometry", "material", "source", "tally"];

export function ProjectTree(props: Readonly<ProjectTreeProps>) {
  return (
    <ProjectTreeBoundary>
      <ProjectTreeInner {...props}/>
    </ProjectTreeBoundary>
  );
}

function ProjectTreeInner({
  diagnostics,
}: Readonly<ProjectTreeProps>) {
  const {state, dispatch} = useEditorStore();
  const project = state.scene.project;
  if (!project) throw new Error("Project Tree requires an Editable Scene project");
  const selectedEntityId = getPrimarySelection(state.selection)?.id;
  const modeBehavior = getEditorModeBehavior(state.shell.activeMode);
  const modeEditingDisabledReason = getModeEditingDisabledReason(state.shell.activeMode);
  const visibility = useMemo(() => selectVisibility(state), [state.visibility]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingEntityId, setEditingEntityId] = useState<string | undefined>();
  const [drafts, setDrafts] = useState<Record<string, ProjectTreeMetadataDraft>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    settingsButtonRef.current?.focus();
  }, []);

  const entitiesById = useMemo(
    () => new Map<string, SceneEntity>(project.scene.entities.map((entity) => [entity.id, entity])),
    [project.scene.entities],
  );

  useEffect(() => {
    dispatch({
      type: "set-validation-result",
      diagnostics: diagnostics.map((diagnostic) => normalizeDiagnostic(diagnostic, project.scene.entities)),
    });
  }, [diagnostics, dispatch, project.scene.entities]);

  useEffect(() => {
    if (modeBehavior.editingEnabled) return;
    setEditingEntityId(undefined);
    setDrafts({});
    setSettingsOpen(false);
  }, [modeBehavior.editingEnabled]);

  const filteredMetadata = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const metadata = selectProjectTreeMetadata(state);

    if (!query) {
      return metadata;
    }

    return metadata.filter((entity) => matchesSearch(entity, query));
  }, [searchQuery, state.scene.project]);

  const groups = useMemo(
    () => buildProjectTree({entities: filteredMetadata, visibility}),
    [filteredMetadata, visibility],
  );

  const stats = useMemo(() => getSceneStats(project.scene.entities), [project.scene.entities]);
  const visibleRows = groups.reduce((count, group) => count + (group.children?.length ?? 0), 0);

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

    dispatch({type: "update-project-entity-metadata", ref, patch: {
      name: draft.name.trim() || "Untitled Entity",
      description: draft.description.trim(),
      tags: parseTags(draft.tags),
    }});
    setEditingEntityId(undefined);
  }, [dispatch, drafts]);

  return (
    <>
          <section className="panel project-panel" aria-label="Project tree">
            <div className="panel-header">
              <div>
                <h2>{project.name}</h2>
                <p className="muted compact">{project.metadata.physicsModelVersion}</p>
              </div>
              <button ref={settingsButtonRef} className="icon-button" type="button"
                title={modeEditingDisabledReason ?? "Project settings"}
                aria-label="Project settings" disabled={!modeBehavior.editingEnabled}
                onClick={() => setSettingsOpen(true)}>⚙</button>
            </div>

            <div className="stat-grid">
              <Stat label="geom" value={stats.geometry}/>
              <Stat label="mat" value={stats.materials}/>
              <Stat label="src" value={stats.sources}/>
              <Stat label="tally" value={stats.tallies}/>
            </div>

            <div className="project-tree-create" aria-label="Create entities">
              {CREATE_KINDS.map((kind) => (
                <button key={kind} type="button" disabled={!modeBehavior.editingEnabled}
                  title={modeEditingDisabledReason}
                  onClick={() => dispatch({type: "create-project-entity", kind})}>
                  + {labelForKind(kind)}
                </button>
              ))}
            </div>
            {!modeBehavior.editingEnabled && <p className="mode-action-explanation" role="status">{modeEditingDisabledReason}</p>}

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
                      onRequestEdit={requestEdit}
                    />
                  ))
              )}
            </div>
            {settingsOpen && (
              <ProjectSettingsDialog project={project} onCancel={closeSettings} onSave={(settings) => {
                dispatch({type: "update-project-settings", settings});
                closeSettings();
              }}/>
            )}
          </section>
    </>
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

function entityRefForEntity(entity: SceneEntity): EditorEntityRef {
  return {
    id: entity.id,
    kind: entity.kind,
  };
}

function normalizeDiagnostic(
  diagnostic: Diagnostic,
  entities: readonly SceneEntity[],
): EditorDiagnostic {
  const entity = diagnostic.entityId
    ? entities.find((candidate) => candidate.id === diagnostic.entityId)
    : undefined;

  return {
    id: `${diagnostic.severity}:${diagnostic.entityId ?? "project"}:${diagnostic.message}`,
    severity: diagnostic.severity,
    code: diagnostic.code,
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
