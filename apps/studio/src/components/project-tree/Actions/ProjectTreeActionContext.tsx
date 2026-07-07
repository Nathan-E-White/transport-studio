import { Dispatch, createContext, useContext } from "react";
import { EditorStoreAction } from "../../../state/editor";
import { ProjectTreeActionModel } from "./ProjectTreeActionModels";

export interface ProjectTreeActionContextValue {
    readonly actions: readonly ProjectTreeActionModel[];
    readonly dispatch: Dispatch<EditorStoreAction>;
    readonly dispatchAction: (action: ProjectTreeActionModel) => void;
}

export const ProjectTreeActionContext =
    createContext<ProjectTreeActionContextValue | null>(null);

// noinspection JSUnusedGlobalSymbols
export function useProjectTreeActions(): ProjectTreeActionContextValue {
    const value = useContext(ProjectTreeActionContext);

    if (!value) {
        throw new Error("useProjectTreeActions must be used inside ProjectTreeActionProvider");
    }

    return value;
}