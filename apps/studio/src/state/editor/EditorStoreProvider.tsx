import {
    Dispatch,
    PropsWithChildren,
    createContext,
    useMemo,
    useReducer, useContext
} from "react";

import {
    EditorStoreAction,
    EditorStoreState,
    editorStoreReducer,
    createEditorStoreState,
    initialEditorStoreState
} from "./editorStore";
import type {Project} from "@transport/domain";

interface EditorStoreContextValue {
    readonly state: EditorStoreState;
    readonly dispatch: Dispatch<EditorStoreAction>;
}

const EditorStoreContext = createContext<EditorStoreContextValue | null>(null);

export interface EditorStoreProviderProps extends PropsWithChildren {
    readonly initialProject?: Project;
}

export function EditorStoreProvider({children, initialProject}: EditorStoreProviderProps) {

    const [state, dispatch] = useReducer(
        editorStoreReducer,
        initialProject ? createEditorStoreState(initialProject) : initialEditorStoreState,
    );

    const value = useMemo(
        () => ({
            state,
            dispatch
        }),
        [state]
    );

    return <EditorStoreContext.Provider value={value}>
        {children}
    </EditorStoreContext.Provider>;
}

export function useEditorStore(): EditorStoreContextValue {
    const value = useContext(EditorStoreContext)

    if(!value) {
        throw new Error("useEditorStore called outside EditorStoreProvider.")
    }

    return value;
}
