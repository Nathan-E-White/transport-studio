import { createContext, useContext } from "react";
import { ProjectTreeNode } from "../../../state/editor";
import { ProjectTreeIconModel } from "./ProjectTreeIconsModels";

export interface ProjectTreeIconsContextValue {
    readonly getIconForNode: (node: ProjectTreeNode) => ProjectTreeIconModel;
}

export const ProjectTreeIconsContext =
    createContext<ProjectTreeIconsContextValue | null>(null);

export function useProjectTreeIcons(): ProjectTreeIconsContextValue {
    const value = useContext(ProjectTreeIconsContext);

    if (!value) {
        throw new Error("useProjectTreeIcons must be used inside ProjectTreeIconsProvider");
    }

    return value;
}