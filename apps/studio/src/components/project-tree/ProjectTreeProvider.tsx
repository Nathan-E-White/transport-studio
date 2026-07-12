import {PropsWithChildren, createContext, useContext, useMemo} from "react";
import type {EditorEntityRef} from "../../state/editor";

export interface ProjectTreeContextValue {
  readonly selectedEntityId?: string;
  readonly editingEntityId?: string;
  readonly onRequestEdit: (ref: EditorEntityRef) => void;
  readonly allowDelete: boolean;
}

export interface ProjectTreeProviderProps extends PropsWithChildren, ProjectTreeContextValue {}

const ProjectTreeContext = createContext<ProjectTreeContextValue | null>(null);

export function ProjectTreeProvider({
  selectedEntityId,
  editingEntityId,
  onRequestEdit,
  allowDelete,
  children,
}: Readonly<ProjectTreeProviderProps>) {
  const value = useMemo<ProjectTreeContextValue>(
    () => ({
      selectedEntityId,
      editingEntityId,
      onRequestEdit,
      allowDelete,
    }),
    [
      allowDelete,
      editingEntityId,
      onRequestEdit,
      selectedEntityId,
    ],
  );

  return <ProjectTreeContext.Provider value={value}>{children}</ProjectTreeContext.Provider>;
}

export function useProjectTree(): ProjectTreeContextValue {
  const value = useContext(ProjectTreeContext);

  if (!value) {
    throw new Error("useProjectTree must be used inside ProjectTreeProvider");
  }

  return value;
}
