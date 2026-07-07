

import { PropsWithChildren } from "react";
import { EditorStoreBoundary } from "./EditorStoreBoundary";
import { EditorStoreProvider } from "./EditorStoreProvider";

export function EditorStateRoot({children}: PropsWithChildren) {
    return (
        <EditorStoreBoundary>
            <EditorStoreProvider>{children}</EditorStoreProvider>
        </EditorStoreBoundary>
    );
}