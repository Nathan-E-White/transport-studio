import {KeyboardEvent} from "react";
import {ProjectTreeNode} from "../../../state/editor";
import {ProjectTreeBadges} from "../Badges/ProjectTreeBadges";
import {ProjectTreeEntityRowScope} from "./ProjectTreeEntityRowScope";
import {useProjectTreeEntityRow} from "./ProjectTreeEntityRowContext";

import {ProjectTreeAction} from "../Actions/ProjectTreeAction";
import {ProjectTreeActionScope} from "../Actions/ProjectTreeActionScope";
import {useProjectTree} from "../ProjectTreeProvider";

export interface ProjectTreeEntityRowProps {
    readonly node: ProjectTreeNode;
    readonly allowDelete?: boolean;
}

// noinspection JSUnusedGlobalSymbols
export function ProjectTreeEntityRow({node, allowDelete}: Readonly<ProjectTreeEntityRowProps>) {
    return (
        <ProjectTreeEntityRowScope node={node} allowDelete={allowDelete}>
            <ProjectTreeEntityRowInner/>
        </ProjectTreeEntityRowScope>
    );
}

function ProjectTreeEntityRowInner() {
    const {node, row, dispatch} = useProjectTreeEntityRow();
    const projectTree = useProjectTree();

    function selectRow(): void {
        if (!row.selectable) {
            return;
        }

        dispatch({
            type: "select-one",
            ref: row.ref,
        });
    }

    function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }

        event.preventDefault();
        selectRow();
    }

    return <div
        role="treeitem"
        tabIndex={row.selectable ? 0 : -1}
        aria-selected={row.selected}
        aria-label={row.ariaLabel}
        className={row.className}
        data-entity-kind={row.ref.kind}
        data-entity-id={row.ref.id}
        data-selected={row.selected || undefined}
        data-hovered={row.hovered || undefined}
        data-focused={row.focused || undefined}
        data-visible={row.visible}
        data-selectable={row.selectable}
        data-locked={row.locked}
        data-included-in-compile={row.includedInCompile}
        data-helper-only={row.helperOnly || undefined}
        onClick={selectRow}
        onKeyDown={handleRowKeyDown}
        onMouseEnter={() => {
            dispatch({
                type: "set-hovered",
                ref: row.ref,
            });
        }}
        onMouseLeave={() => {
            dispatch({
                type: "set-hovered",
                ref: null,
            });
        }}
        onFocus={() => {
            dispatch({
                type: "set-inspector-focus",
                ref: row.ref,
            });
        }}
    >
    <span className="project-tree-entity-row__icon" aria-hidden="true">
      {getEntityRowGlyph(row.ref.kind)}
    </span>

        <span className="project-tree-entity-row__label">{row.label}</span>

        <ProjectTreeBadges node={node}/>

        <ProjectTreeActionScope
            refForActions={row.ref}
            visible={row.visible}
            selectable={row.selectable}
            locked={row.locked}
            includedInCompile={row.includedInCompile}
            helperOnly={row.helperOnly}
            allowDelete={projectTree.allowDelete}
        >
            <ProjectTreeAction/>
        </ProjectTreeActionScope>
    </div>;
}

function getEntityRowGlyph(kind: ProjectTreeNode["entityKind"]): string {
    switch (kind) {
        case "geometry":
            return "◇";
        case "region":
            return "▣";
        case "surface":
            return "╱";
        case "material":
            return "⬢";
        case "source":
            return "↯";
        case "tally":
            return "∫";
        case "transform":
            return "⤢";
        case "annotation":
            return "✎";
        case "label":
            return "⌗";
        case "visual-helper":
            return "·";
        case "imported-asset":
            return "▤";
        default:
            return "•";
    }
}
