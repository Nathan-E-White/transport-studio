
import React, {
    Component, ErrorInfo, PropsWithChildren, ReactNode
} from "react";
import {
    captureEditorBoundaryFailure,
    type EditorFailureConsoleEntry,
    type EditorFailureJournal,
} from "../../app/editorFailureJournal";

export interface EditorStoreBoundaryProps extends PropsWithChildren {
    readonly fallback?: ReactNode;
    readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
    readonly failureJournal: EditorFailureJournal;
}

interface EditorStoreBoundaryState {
    readonly hasError: boolean;
    readonly error: Error | null;
    readonly entry: EditorFailureConsoleEntry | null;
}

export class EditorStoreBoundary extends Component <
    EditorStoreBoundaryProps,
    EditorStoreBoundaryState
> {
    public state: EditorStoreBoundaryState = {
        hasError: false,
        error: null,
        entry: null,
    };

    public static getDerivedStateFromError(error: Error): EditorStoreBoundaryState {
        return {
            hasError: true,
            error,
            entry: null,
        };
    }

    public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        const entry = captureEditorBoundaryFailure(this.props.failureJournal, {
            surface: "editor-state",
            error,
            componentStack: errorInfo.componentStack,
        }, () => this.props.onError?.(error, errorInfo));
        this.setState({entry});
    }

    private readonly retry = () => {
        this.setState({hasError: false, error: null, entry: null});
    };

    public render(): ReactNode {
        if (this.state.hasError) {
            const entry = this.state.entry;
            return (
                this.props.fallback ?? (
                    <div role="alert" style={{padding: "1rem"}}>
                        <h2>Editor state crashed</h2>
                        <p>The editor shell hit a recoverable state error.</p>
                        {entry && <>
                            <section aria-label="Editor failure diagnostic">
                                <strong>{entry.classification}</strong>
                                <p>{entry.errorName}: {entry.message}</p>
                            </section>
                            <section aria-label="Editor failure Console event">
                                <strong>Console event</strong>
                                <p>{entry.surface} · {entry.recoverability} · {entry.message}</p>
                                <time dateTime={entry.observedAt}>{entry.observedAt}</time>
                            </section>
                        </>}
                        <button type="button" onClick={this.retry}>Retry editor</button>
                    </div>
                )
            );
        }

        return this.props.children;
    }
}
