import {KeyboardEvent, useMemo} from "react";
import {EditorEntityRef, ProjectTreeNode, getModeEditingDisabledReason, isEntityKindSelectableInMode, selectVisibility, useEditorStore} from "../../../state/editor";
import {ProjectTreeBadges} from "../Badges/ProjectTreeBadges";
import {ProjectTreeAction} from "../Actions/ProjectTreeAction";
import {buildProjectTreeEntityRowModel} from "./ProjectTreeEntityRowModels";
import {buildEntityIconModel} from "../Icons/ProjectTreeIconsModels";

export interface ProjectTreeEntityRowProps {
  readonly node: ProjectTreeNode;
  readonly allowDelete?: boolean;
  readonly onRequestEdit: (ref: EditorEntityRef) => void;
}

export function ProjectTreeEntityRow({node, allowDelete = true, onRequestEdit}: Readonly<ProjectTreeEntityRowProps>) {
  const {state, dispatch} = useEditorStore();
  const visibility = useMemo(() => selectVisibility(state), [state.visibility]);
  const row = useMemo(() => buildProjectTreeEntityRowModel({node, selection: state.selection, visibility}), [node, state.selection, visibility]);
  if (!row) return null;
  const modeSelectable = isEntityKindSelectableInMode(state.shell.activeMode, row.ref.kind);
  const selectable = row.selectable && modeSelectable;
  const modeEditingDisabledReason = getModeEditingDisabledReason(state.shell.activeMode);
  const icon = buildEntityIconModel(row.ref.kind);
  const selectRow = () => { if (selectable) dispatch({type: "select-one", ref: row.ref}); };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => { if (event.key === "Enter" || event.key === " ") {event.preventDefault(); selectRow();} };

  return <div role="treeitem" tabIndex={selectable ? 0 : -1} aria-selected={row.selected} aria-disabled={!selectable}
    aria-label={`${row.ariaLabel}${modeSelectable ? "" : `, unavailable in ${state.shell.activeMode} mode`}`}
    className={`${row.className}${selectable ? "" : " project-tree-entity-row--not-selectable"}`} data-entity-kind={row.ref.kind}
    data-entity-id={row.ref.id} data-selected={row.selected || undefined}
    data-hovered={row.hovered || undefined} data-focused={row.focused || undefined}
    data-visible={row.visible} data-selectable={selectable} data-locked={row.locked}
    data-included-in-compile={row.includedInCompile} data-helper-only={row.helperOnly || undefined}
    onClick={selectRow} onKeyDown={onKeyDown}
    onMouseEnter={() => dispatch({type: "set-hovered", ref: row.ref})}
    onMouseLeave={() => dispatch({type: "set-hovered", ref: null})}
    onFocus={() => dispatch({type: "set-inspector-focus", ref: row.ref})}>
    <span className="project-tree-entity-row__icon" aria-hidden="true">{icon.glyph}</span>
    <span className="project-tree-entity-row__label">{row.label}</span>
    <ProjectTreeBadges node={node}/>
    <ProjectTreeAction refForActions={row.ref} visible={row.visible} selectable={selectable}
      locked={row.locked} includedInCompile={row.includedInCompile} helperOnly={row.helperOnly}
      allowDelete={allowDelete} onRequestEdit={onRequestEdit} manipulationDisabledReason={modeEditingDisabledReason}/>
  </div>;
}
