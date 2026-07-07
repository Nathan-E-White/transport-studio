import {
    EditorEntityRef,
    EditorSelectionState,
    getEntityViewFlags,
    isSelected,
    ProjectTreeNode,
    VisibilityTable,
} from "../../../state/editor";

export type ProjectTreeEntityRowTone =
    | "normal"
    | "selected"
    | "hidden"
    | "locked"
    | "excluded"
    | "helper";

export interface ProjectTreeEntityRowModel {
    readonly id: string;
    readonly label: string;
    readonly ref: EditorEntityRef;
    readonly selected: boolean;
    readonly hovered: boolean;
    readonly focused: boolean;
    readonly visible: boolean;
    readonly selectable: boolean;
    readonly locked: boolean;
    readonly includedInCompile: boolean;
    readonly helperOnly: boolean;
    readonly tone: ProjectTreeEntityRowTone;
    readonly ariaLabel: string;
    readonly className: string;
}

export interface BuildProjectTreeEntityRowModelInput {
    readonly node: ProjectTreeNode;
    readonly selection: EditorSelectionState;
    readonly visibility: VisibilityTable;
}

export function buildProjectTreeEntityRowModel(
    input: BuildProjectTreeEntityRowModelInput,
): ProjectTreeEntityRowModel | null {
    const {node, selection, visibility} = input;

    if (node.entityRef == null) {
        return null;
    }

    const ref = node.entityRef;
    const flags = getEntityViewFlags(visibility, ref);

    const selected = isSelected(selection, ref);
    const hovered = sameEntityRef(selection.hovered, ref);
    const focused = sameEntityRef(selection.inspectorFocus, ref);

    const tone = getEntityRowTone({
        selected,
        visible: flags.visible,
        locked: flags.locked,
        includedInCompile: flags.includedInCompile,
        helperOnly: flags.helperOnly,
    });

    return {
        id: node.id,
        label: node.label,
        ref,
        selected,
        hovered,
        focused,
        visible: flags.visible,
        selectable: flags.selectable,
        locked: flags.locked,
        includedInCompile: flags.includedInCompile,
        helperOnly: flags.helperOnly,
        tone,
        ariaLabel: getEntityRowAriaLabel(node.label, ref, flags),
        className: getProjectTreeEntityRowClassName({
            selected,
            hovered,
            focused,
            visible: flags.visible,
            selectable: flags.selectable,
            locked: flags.locked,
            includedInCompile: flags.includedInCompile,
            helperOnly: flags.helperOnly,
            tone,
        }),
    };
}

export interface EntityRowToneInput {
    readonly selected: boolean;
    readonly visible: boolean;
    readonly locked: boolean;
    readonly includedInCompile: boolean;
    readonly helperOnly: boolean;
}

export function getEntityRowTone(input: EntityRowToneInput): ProjectTreeEntityRowTone {
    if (input.selected) {
        return "selected";
    }

    if (input.helperOnly) {
        return "helper";
    }

    if (!input.includedInCompile) {
        return "excluded";
    }

    if (input.locked) {
        return "locked";
    }

    if (!input.visible) {
        return "hidden";
    }

    return "normal";
}

export interface ProjectTreeEntityRowClassInput {
    readonly selected: boolean;
    readonly hovered: boolean;
    readonly focused: boolean;
    readonly visible: boolean;
    readonly selectable: boolean;
    readonly locked: boolean;
    readonly includedInCompile: boolean;
    readonly helperOnly: boolean;
    readonly tone: ProjectTreeEntityRowTone;
}

export function getProjectTreeEntityRowClassName(
    input: ProjectTreeEntityRowClassInput,
): string {
    const classNames: string[] = [
        "project-tree-entity-row",
        `project-tree-entity-row--${input.tone}`,
    ];

    if (input.selected) {
        classNames.push("project-tree-entity-row--selected");
    }

    if (input.hovered) {
        classNames.push("project-tree-entity-row--hovered");
    }

    if (input.focused) {
        classNames.push("project-tree-entity-row--focused");
    }

    if (!input.visible) {
        classNames.push("project-tree-entity-row--hidden");
    }

    if (!input.selectable) {
        classNames.push("project-tree-entity-row--not-selectable");
    }

    if (input.locked) {
        classNames.push("project-tree-entity-row--locked");
    }

    if (!input.includedInCompile) {
        classNames.push("project-tree-entity-row--excluded");
    }

    if (input.helperOnly) {
        classNames.push("project-tree-entity-row--helper-only");
    }

    return classNames.join(" ");
}

export function getEntityRowAriaLabel(
    label: string,
    ref: EditorEntityRef,
    flags: {
        readonly visible: boolean;
        readonly selectable: boolean;
        readonly locked: boolean;
        readonly includedInCompile: boolean;
        readonly helperOnly: boolean;
    },
): string {
    const modifiers: string[] = [];


    if (!flags.visible) {
        modifiers.push("hidden");
    }

    if (!flags.selectable) {
        modifiers.push("not selectable");
    }

    if (flags.locked) {
        modifiers.push("locked");
    }

    if (!flags.includedInCompile) {
        modifiers.push("excluded from compiled problem");
    }

    if (flags.helperOnly) {
        modifiers.push("editor helper only");
    }

    const suffix = modifiers.length > 0 ? `, ${modifiers.join(", ")}` : "";

    return `${label}, ${ref.kind}${suffix}`;
}

function sameEntityRef(
    a: EditorEntityRef | null | undefined,
    b: EditorEntityRef | null | undefined,
): boolean {
    if (a == null || b == null) {
        return false;
    }

    return a.kind === b.kind && a.id === b.id;
}