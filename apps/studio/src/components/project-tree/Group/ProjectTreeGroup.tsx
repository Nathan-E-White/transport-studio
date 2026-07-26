import type {FormEvent, KeyboardEvent} from "react";
import type {EditorEntityRef, ProjectTreeNode} from "../../../state/editor";
import {ProjectTreeEntityRow} from "../EntityRow/ProjectTreeEntityRow";
import {ProjectTreeIcons} from "../Icons/ProjectTreeIcons";

export interface ProjectTreeMetadataDraft {
  readonly name: string;
  readonly description: string;
  readonly tags: string;
}

export interface ProjectTreeGroupProps {
  readonly node: ProjectTreeNode;
  readonly editingEntityId?: string;
  readonly getDraftForNode: (node: ProjectTreeNode) => ProjectTreeMetadataDraft;
  readonly onDraftChange: (node: ProjectTreeNode, draft: ProjectTreeMetadataDraft) => void;
  readonly onSaveDraft: (node: ProjectTreeNode) => void;
  readonly onCancelDraft: (node: ProjectTreeNode) => void;
  readonly onRequestEdit: (ref: EditorEntityRef) => void;
  readonly expanded: boolean;
  readonly rovingRowId?: string;
  readonly onToggleExpanded: () => void;
  readonly onRowFocus: (node: ProjectTreeNode) => void;
  readonly onRowKeyDown: (event: KeyboardEvent<HTMLDivElement>, node: ProjectTreeNode) => void;
  readonly onGroupKeyDown: (event: KeyboardEvent<HTMLButtonElement>, node: ProjectTreeNode) => void;
}

export function ProjectTreeGroup({
  node,
  editingEntityId,
  getDraftForNode,
  onDraftChange,
  onSaveDraft,
  onCancelDraft,
  onRequestEdit,
  expanded,
  rovingRowId,
  onToggleExpanded,
  onRowFocus,
  onRowKeyDown,
  onGroupKeyDown,
}: Readonly<ProjectTreeGroupProps>) {
  const children = node.children ?? [];

  return (
    <section className="project-tree-group" role="group" aria-label={node.label}>
      <h3 className="project-tree-group__heading">
        <button id={`project-tree-group-${node.id}`} type="button" className="project-tree-group__toggle" aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${node.label}`} onClick={onToggleExpanded}
          onKeyDown={(event) => onGroupKeyDown(event, node)}>
          <ProjectTreeIcons node={node}/>
          <span>{node.label}</span>
          <em>{children.length}</em>
        </button>
      </h3>

      {expanded && <div className="project-tree-group__rows">
        {children.map((child) => {
          const isEditing = child.entityRef?.id === editingEntityId;
          const draft = getDraftForNode(child);

          return (
            <div className="project-tree-group__row-shell" key={child.id}>
              <ProjectTreeEntityRow node={child} onRequestEdit={onRequestEdit}
                rovingTabIndex={child.id === rovingRowId ? 0 : -1}
                onRowFocus={onRowFocus} onRowKeyDown={onRowKeyDown}/>
              {isEditing ? (
                <form
                  className="project-tree-edit"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    onSaveDraft(child);
                  }}
                  onKeyDown={(event: KeyboardEvent<HTMLFormElement>) => {
                    if (event.key !== "Escape") return;
                    event.preventDefault();
                    onCancelDraft(child);
                  }}
                >
                  <label>
                    <span>Name</span>
                    <input autoFocus
                      value={draft.name}
                      onChange={(event) =>
                        onDraftChange(child, {...draft, name: event.target.value})
                      }
                    />
                  </label>
                  <label>
                    <span>Description</span>
                    <input
                      value={draft.description}
                      onChange={(event) =>
                        onDraftChange(child, {...draft, description: event.target.value})
                      }
                    />
                  </label>
                  <label>
                    <span>Tags</span>
                    <input
                      value={draft.tags}
                      onChange={(event) =>
                        onDraftChange(child, {...draft, tags: event.target.value})
                      }
                    />
                  </label>
                  <div className="project-tree-edit__actions">
                    <button type="submit">Save</button>
                    <button type="button" onClick={() => onCancelDraft(child)}>Cancel</button>
                  </div>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>}
    </section>
  );
}
