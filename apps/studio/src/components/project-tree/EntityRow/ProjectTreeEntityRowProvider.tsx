import { PropsWithChildren, useMemo } from "react";
import { ProjectTreeNode, selectVisibility, useEditorStore } from "../../../state/editor";
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
  const visibility = useMemo(() => selectVisibility(state), [state.scene.project]);

  const row = useMemo(
    () =>
      buildProjectTreeEntityRowModel({
        node,
        selection: state.selection,
        visibility,
      }),
    [node, state.selection, visibility],
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
