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
    initialEditorStoreState
} from "./editorStore";

interface EditorStoreContextValue {
    readonly state: EditorStoreState;
    readonly dispatch: Dispatch<EditorStoreAction>;
}

const EditorStoreContext = createContext<EditorStoreContextValue | null>(null);

export function EditorStoreProvider({children}: PropsWithChildren) {

    const [state, dispatch] = useReducer(editorStoreReducer, initialEditorStoreState);

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