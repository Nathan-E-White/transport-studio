import { Dispatch, createContext, useContext } from "react";
import { EditorStoreAction, ProjectTreeNode } from "../../../state/editor";


import { ProjectTreeEntityRowModel } from "./ProjectTreeEntityRowModels";

export interface ProjectTreeEntityRowContextValue {
  readonly node: ProjectTreeNode;
  readonly row: ProjectTreeEntityRowModel;
  readonly dispatch: Dispatch<EditorStoreAction>;
}

export const ProjectTreeEntityRowContext =
  createContext<ProjectTreeEntityRowContextValue | null>(null);

export function useProjectTreeEntityRow(): ProjectTreeEntityRowContextValue {
  const value = useContext(ProjectTreeEntityRowContext);

  if (!value) {
    throw new Error(
      "useProjectTreeEntityRow must be used inside ProjectTreeEntityRowProvider",
    );
  }

  return value;
}