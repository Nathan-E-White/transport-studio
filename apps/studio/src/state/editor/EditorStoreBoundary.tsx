
import React, {
    Component, ErrorInfo, PropsWithChildren, ReactNode
} from "react";

export interface EditorStoreBoundaryProps extends PropsWithChildren {
    readonly fallback?: ReactNode;
    readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface EditorStoreBoundaryState {
    readonly hasError: boolean;
    readonly error: Error | null;
}

export class EditorStoreBoundary extends Component <
    EditorStoreBoundaryProps,
    EditorStoreBoundaryState
> {
    public state: EditorStoreBoundaryState = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): EditorStoreBoundaryState {
        return {
            hasError: true,
            error,
        };
    }

    public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        this.props.onError?.(error, errorInfo);

        // TODO route this into diagnostics/console system
        console.error("Editor store subtree crashed", error, errorInfo);
    }

    public render(): ReactNode {
        if (this.state.hasError) {
            return (
                this.props.fallback ?? (
                    <div role="alert" style={{padding: "1rem"}}>
                        <h2>Editor state crashed</h2>
                        <p>The editor shell hit an unrecoverable state error.</p>
                        {this.state.error && (
                            <pre style={{ whiteSpace: "pre-wrap"}}>
                                {this.state.error.message}
                            </pre>
                        )}
                    </div>
                )
            );
        }

        return this.props.children;
    }
}