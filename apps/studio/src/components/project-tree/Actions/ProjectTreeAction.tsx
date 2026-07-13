import {KeyboardEvent, MouseEvent, useMemo} from "react";
import {EditorEntityRef, useEditorStore} from "../../../state/editor";
import {buildProjectTreeActions, getVisibleProjectTreeActions, ProjectTreeActionModel} from "./ProjectTreeActionModels";

export interface ProjectTreeActionProps {
  readonly refForActions: EditorEntityRef;
  readonly visible: boolean;
  readonly selectable: boolean;
  readonly locked: boolean;
  readonly includedInCompile: boolean;
  readonly helperOnly: boolean;
  readonly allowDelete?: boolean;
  readonly onRequestEdit: (ref: EditorEntityRef) => void;
}

export function ProjectTreeAction(props: Readonly<ProjectTreeActionProps>) {
  const {dispatch} = useEditorStore();
  const actions = useMemo(() => getVisibleProjectTreeActions(buildProjectTreeActions({
    ref: props.refForActions,
    visible: props.visible,
    selectable: props.selectable,
    locked: props.locked,
    includedInCompile: props.includedInCompile,
    helperOnly: props.helperOnly,
    allowDelete: props.allowDelete ?? true,
  })), [props]);
  if (actions.length === 0) return null;

  function dispatchAction(action: ProjectTreeActionModel): void {
    if (action.disabled) return;
    switch (action.kind) {
      case "select": dispatch({type: "select-one", ref: action.ref}); return;
      case "edit-metadata": props.onRequestEdit(action.ref); return;
      case "toggle-visible": dispatch({type: "set-visible", ref: action.ref, visible: !action.pressed}); return;
      case "toggle-locked": dispatch({type: "set-locked", ref: action.ref, locked: !action.pressed}); return;
      case "toggle-included-in-compile": dispatch({type: "set-included-in-compile", ref: action.ref, includedInCompile: !action.pressed}); return;
      case "duplicate": dispatch({type: "duplicate-project-entity", ref: action.ref}); return;
      case "delete": dispatch({type: "delete-project-entity", ref: action.ref}); return;
    }
  }

  return <span className="project-tree-actions" aria-label="Project tree actions">
    {actions.map((action) => <button key={action.kind} type="button" className={action.className}
      title={action.title} aria-label={action.title} aria-pressed={action.pressed}
      disabled={action.disabled} data-action-kind={action.kind} data-action-tone={action.tone}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {event.stopPropagation(); dispatchAction(action);}}
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => event.stopPropagation()}>
      <span className="project-tree-action__glyph" aria-hidden="true">{action.glyph}</span>
      <span className="project-tree-action__label">{action.label}</span>
    </button>)}
  </span>;
}
