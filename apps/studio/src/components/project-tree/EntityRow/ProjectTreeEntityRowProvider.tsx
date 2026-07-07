import { PropsWithChildren, useMemo } from "react";
import { ProjectTreeNode, useEditorStore } from "../../../state/editor";
import { ProjectTreeEntityRowContext } from "./ProjectTreeEntityRowContext";

import { buildProjectTreeEntityRowModel } from "./ProjectTreeEntityRowModels";

export interface ProjectTreeEntityRowProviderProps extends PropsWithChildren {
  readonly node: ProjectTreeNode;
  readonly allowDelete?: boolean;
}

export function ProjectTreeEntityRowProvider({
  node,
  children,
}: Readonly<ProjectTreeEntityRowProviderProps>) {
  const { state, dispatch } = useEditorStore();

  const row = useMemo(
    () =>
      buildProjectTreeEntityRowModel({
        node,
        selection: state.selection,
        visibility: state.visibility,
      }),
    [node, state.selection, state.visibility],
  );

  const value = useMemo(() => {
    if (!row) {
      return null;
    }

    return {
      node,
      row,
      dispatch,
    };
  }, [dispatch, node, row]);

  if (!value) {
    return null;
  }

  return (
    <ProjectTreeEntityRowContext.Provider value={value}>
      {children}
    </ProjectTreeEntityRowContext.Provider>
  );
}