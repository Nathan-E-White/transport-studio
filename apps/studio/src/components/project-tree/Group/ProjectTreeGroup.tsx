import type {FormEvent} from "react";
import type {ProjectTreeNode} from "../../../state/editor";
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
  readonly onCancelDraft: () => void;
}

export function ProjectTreeGroup({
  node,
  editingEntityId,
  getDraftForNode,
  onDraftChange,
  onSaveDraft,
  onCancelDraft,
}: Readonly<ProjectTreeGroupProps>) {
  const children = node.children ?? [];

  return (
    <section className="project-tree-group" role="group" aria-label={node.label}>
      <h3 className="project-tree-group__heading">
        <ProjectTreeIcons node={node}/>
        <span>{node.label}</span>
        <em>{children.length}</em>
      </h3>

      <div className="project-tree-group__rows">
        {children.map((child) => {
          const isEditing = child.entityRef?.id === editingEntityId;
          const draft = getDraftForNode(child);

          return (
            <div className="project-tree-group__row-shell" key={child.id}>
              <ProjectTreeEntityRow node={child}/>
              {isEditing ? (
                <form
                  className="project-tree-edit"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    onSaveDraft(child);
                  }}
                >
                  <label>
                    <span>Name</span>
                    <input
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
                    <button type="button" onClick={onCancelDraft}>Cancel</button>
                  </div>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
