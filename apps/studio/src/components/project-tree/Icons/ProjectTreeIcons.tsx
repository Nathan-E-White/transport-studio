

import { ProjectTreeNode } from "../../../state/editor";
import {buildProjectTreeIconModel} from "./ProjectTreeIconsModels";

export interface ProjectTreeIconsProps {
  readonly node: ProjectTreeNode;
  readonly decorative?: boolean;
}

// noinspection JSUnusedGlobalSymbols
export function ProjectTreeIcons({
  node,
  decorative = true,
}: Readonly<ProjectTreeIconsProps>) {
  const icon = buildProjectTreeIconModel({node});

  return (
    <span
      className={icon.className}
      title={icon.title}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : icon.label}
      data-icon-kind={icon.kind}
      data-icon-tone={icon.tone}
    >
      {icon.glyph}
    </span>
  );
}
