

import { PropsWithChildren } from "react";
import { EditorStoreBoundary } from "./EditorStoreBoundary";
import { EditorStoreProvider } from "./EditorStoreProvider";
import type {Project} from "@transport/domain";
import type {EditorFailureJournal} from "../../app/editorFailureJournal";

export interface EditorStateRootProps extends PropsWithChildren {
    readonly initialProject?: Project;
    readonly failureJournal: EditorFailureJournal;
}

export function EditorStateRoot({children, initialProject, failureJournal}: EditorStateRootProps) {
    return (
        <EditorStoreBoundary failureJournal={failureJournal}>
            <EditorStoreProvider initialProject={initialProject}>{children}</EditorStoreProvider>
        </EditorStoreBoundary>
    );
}
