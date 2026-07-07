

import { PropsWithChildren, useMemo } from "react";
import { ProjectTreeNode } from "../../../state/editor";
import { ProjectTreeIconsContext, ProjectTreeIconsContextValue } from "./ProjectTreeIconsContext";
import { buildProjectTreeIconModel } from "./ProjectTreeIconsModels";

export function ProjectTreeIconsProvider({ children }: Readonly<PropsWithChildren>) {
  const value = useMemo<ProjectTreeIconsContextValue>(
    () => ({
      getIconForNode: (node: ProjectTreeNode) => buildProjectTreeIconModel({ node }),
    }),
    [],
  );

  return (
    <ProjectTreeIconsContext.Provider value={value}>
      {children}
    </ProjectTreeIconsContext.Provider>
  );
}