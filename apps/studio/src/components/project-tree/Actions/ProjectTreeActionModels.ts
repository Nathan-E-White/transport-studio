import { EditorEntityRef } from "../../../state/editor";

export type ProjectTreeActionKind =
  | "select"
  | "edit-metadata"
  | "toggle-visible"
  | "toggle-locked"
  | "toggle-included-in-compile"
  | "duplicate"
  | "delete";

export type ProjectTreeActionTone =
  | "default"
  | "selection"
  | "visibility"
  | "lock"
  | "compile"
  | "danger";

export interface ProjectTreeActionModel {
  readonly kind: ProjectTreeActionKind;
  readonly label: string;
  readonly title: string;
  readonly glyph: string;
  readonly tone: ProjectTreeActionTone;
  readonly className: string;
  readonly disabled: boolean;
  readonly pressed?: boolean;
  readonly ref: EditorEntityRef;
}

export interface BuildProjectTreeActionsInput {
  readonly ref: EditorEntityRef;
  readonly visible: boolean;
  readonly selectable: boolean;
  readonly locked: boolean;
  readonly includedInCompile: boolean;
  readonly helperOnly: boolean;
  readonly allowDelete?: boolean;
}

// noinspection JSUnusedGlobalSymbols
export function buildProjectTreeActions(
  input: BuildProjectTreeActionsInput,
): readonly ProjectTreeActionModel[] {
  const allowDelete = input.allowDelete ?? true;

  return [
    buildProjectTreeAction({
      kind: "select",
      label: "Select",
      title: input.selectable ? "Select this entity" : "This entity is not selectable",
      glyph: "↦",
      tone: "selection",
      disabled: !input.selectable,
      ref: input.ref,
    }),
    buildProjectTreeAction({
      kind: "edit-metadata",
      label: "Edit",
      title: input.locked ? "Locked entities cannot be edited" : "Edit entity metadata",
      glyph: "✎",
      tone: "default",
      disabled: input.locked,
      ref: input.ref,
    }),
    buildProjectTreeAction({
      kind: "toggle-visible",
      label: input.visible ? "Hide" : "Show",
      title: input.visible
        ? "Hide this entity in the viewport"
        : "Show this entity in the viewport",
      glyph: input.visible ? "👁" : "◌",
      tone: "visibility",
      disabled: false,
      pressed: input.visible,
      ref: input.ref,
    }),
    buildProjectTreeAction({
      kind: "toggle-locked",
      label: input.locked ? "Unlock" : "Lock",
      title: input.locked
        ? "Unlock this entity for editing"
        : "Lock this entity against editing",
      glyph: input.locked ? "🔒" : "🔓",
      tone: "lock",
      disabled: false,
      pressed: input.locked,
      ref: input.ref,
    }),
    buildProjectTreeAction({
      kind: "toggle-included-in-compile",
      label: input.includedInCompile ? "Exclude" : "Include",
      title: getCompileInclusionActionTitle(input),
      glyph: input.includedInCompile ? "Σ" : "–",
      tone: "compile",
      disabled: input.helperOnly,
      pressed: input.includedInCompile,
      ref: input.ref,
    }),
    buildProjectTreeAction({
      kind: "duplicate",
      label: "Duplicate",
      title: "Duplicate this entity",
      glyph: "⧉",
      tone: "default",
      disabled: false,
      ref: input.ref,
    }),
    buildProjectTreeAction({
      kind: "delete",
      label: "Delete",
      title: input.locked ? "Locked entities cannot be deleted" : "Delete this entity",
      glyph: "×",
      tone: "danger",
      disabled: input.locked || !allowDelete,
      ref: input.ref,
    }),
  ];
}

// noinspection JSUnusedGlobalSymbols
export function getVisibleProjectTreeActions(
  actions: readonly ProjectTreeActionModel[],
): readonly ProjectTreeActionModel[] {
  return actions.filter((action) => action.kind !== "select");
}

export function getProjectTreeActionClassName(
  action: Pick<ProjectTreeActionModel, "kind" | "tone" | "disabled" | "pressed">,
): string {
  return [
    "project-tree-action",
    `project-tree-action--${action.kind}`,
    `project-tree-action--${action.tone}`,
    action.disabled ? "project-tree-action--disabled" : null,
    action.pressed ? "project-tree-action--pressed" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function getCompileInclusionActionTitle(input: BuildProjectTreeActionsInput): string {
  if (input.helperOnly) {
    return "Helper-only entities cannot be included in the compiled problem";
  }

  if (input.includedInCompile) {
    return "Exclude this entity from the compiled transport problem";
  }

  return "Include this entity in the compiled transport problem";
}

export interface BuildProjectTreeActionInput {
  readonly kind: ProjectTreeActionKind;
  readonly label: string;
  readonly title: string;
  readonly glyph: string;
  readonly tone: ProjectTreeActionTone;
  readonly disabled: boolean;
  readonly pressed?: boolean;
  readonly ref: EditorEntityRef;
}

export function buildProjectTreeAction(input: BuildProjectTreeActionInput): ProjectTreeActionModel {
  return {
    ...input,
    className: getProjectTreeActionClassName(input),
  };
}
