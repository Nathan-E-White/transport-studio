

import { EditorEntityKind, ProjectTreeNode } from "../../../state/editor";

export type ProjectTreeIconKind =
  | EditorEntityKind
  | "group"
  | "unknown";

export type ProjectTreeIconTone =
  | "default"
  | "geometry"
  | "material"
  | "source"
  | "tally"
  | "annotation"
  | "helper"
  | "asset"
  | "group"
  | "unknown";

export interface ProjectTreeIconModel {
  readonly kind: ProjectTreeIconKind;
  readonly glyph: string;
  readonly label: string;
  readonly title: string;
  readonly tone: ProjectTreeIconTone;
  readonly className: string;
}

export interface BuildProjectTreeIconModelInput {
  readonly node: ProjectTreeNode;
}

// noinspection JSUnusedGlobalSymbols
export function buildProjectTreeIconModel({
  node,
}: BuildProjectTreeIconModelInput): ProjectTreeIconModel {
  if (node.kind === "group") {
    return buildIconModel({
      kind: "group",
      glyph: "▾",
      label: `${node.label} group`,
      title: `${node.label} group`,
      tone: "group",
    });
  }

  return buildEntityIconModel(node.entityKind ?? "unknown");
}

export function buildEntityIconModel(kind: ProjectTreeIconKind): ProjectTreeIconModel {
  switch (kind) {
    case "geometry":
      return buildIconModel({
        kind,
        glyph: "◇",
        label: "Geometry",
        title: "Geometry entity",
        tone: "geometry",
      });

    case "region":
      return buildIconModel({
        kind,
        glyph: "▣",
        label: "Region",
        title: "Region entity",
        tone: "geometry",
      });

    case "surface":
      return buildIconModel({
        kind,
        glyph: "╱",
        label: "Surface",
        title: "Surface entity",
        tone: "geometry",
      });

    case "transform":
      return buildIconModel({
        kind,
        glyph: "⤢",
        label: "Transform",
        title: "Transform entity",
        tone: "geometry",
      });

    case "material":
      return buildIconModel({
        kind,
        glyph: "⬢",
        label: "Material",
        title: "Material entity",
        tone: "material",
      });

    case "source":
      return buildIconModel({
        kind,
        glyph: "↯",
        label: "Source",
        title: "Source entity",
        tone: "source",
      });

    case "tally":
      return buildIconModel({
        kind,
        glyph: "∫",
        label: "Tally",
        title: "Tally entity",
        tone: "tally",
      });

    case "annotation":
      return buildIconModel({
        kind,
        glyph: "✎",
        label: "Annotation",
        title: "Annotation entity",
        tone: "annotation",
      });

    case "label":
      return buildIconModel({
        kind,
        glyph: "⌗",
        label: "Label",
        title: "Label entity",
        tone: "annotation",
      });

    case "visual-helper":
      return buildIconModel({
        kind,
        glyph: "·",
        label: "Visual helper",
        title: "Visual helper entity",
        tone: "helper",
      });

    case "imported-asset":
      return buildIconModel({
        kind,
        glyph: "▤",
        label: "Imported asset",
        title: "Imported asset entity",
        tone: "asset",
      });

    case "group":
      return buildIconModel({
        kind,
        glyph: "▾",
        label: "Group",
        title: "Project tree group",
        tone: "group",
      });

    case "unknown":
    default:
      return buildIconModel({
        kind: "unknown",
        glyph: "•",
        label: "Unknown",
        title: "Unknown project tree item",
        tone: "unknown",
      });
  }
}

export function getProjectTreeIconClassName(model: Pick<ProjectTreeIconModel, "kind" | "tone">): string {
  return [
    "project-tree-icon",
    `project-tree-icon--${model.tone}`,
    `project-tree-icon--${model.kind}`,
  ].join(" ");
}

interface BuildIconModelInput {
  readonly kind: ProjectTreeIconKind;
  readonly glyph: string;
  readonly label: string;
  readonly title: string;
  readonly tone: ProjectTreeIconTone;
}

function buildIconModel(input: BuildIconModelInput): ProjectTreeIconModel {
  return {
    ...input,
    className: getProjectTreeIconClassName(input),
  };
}