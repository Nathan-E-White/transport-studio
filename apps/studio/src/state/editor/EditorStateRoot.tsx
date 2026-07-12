

import { PropsWithChildren } from "react";
import { EditorStoreBoundary } from "./EditorStoreBoundary";
import { EditorStoreProvider } from "./EditorStoreProvider";
import type {Project} from "@transport/domain";

export interface EditorStateRootProps extends PropsWithChildren {
    readonly initialProject?: Project;
}

export function EditorStateRoot({children, initialProject}: EditorStateRootProps) {
    return (
        <EditorStoreBoundary>
            <EditorStoreProvider initialProject={initialProject}>{children}</EditorStoreProvider>
        </EditorStoreBoundary>
    );
}
