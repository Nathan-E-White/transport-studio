import {Component, ErrorInfo, PropsWithChildren, ReactNode} from "react";
import {
  captureEditorBoundaryFailure,
  type EditorFailureJournal,
} from "../../app/editorFailureJournal";

export interface ProjectTreeBoundaryProps extends PropsWithChildren {
  readonly fallback?: ReactNode;
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
  readonly failureJournal: EditorFailureJournal;
}

interface ProjectTreeBoundaryState {
  readonly error: Error | null;
}

export class ProjectTreeBoundary extends Component<ProjectTreeBoundaryProps, ProjectTreeBoundaryState> {
  public state: ProjectTreeBoundaryState = {
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ProjectTreeBoundaryState {
    return {error};
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    captureEditorBoundaryFailure(this.props.failureJournal, {
      surface: "project-tree",
      error,
      componentStack: errorInfo.componentStack,
    }, () => this.props.onError?.(error, errorInfo));
  }

  private readonly retry = () => {
    this.setState({error: null});
  };

  public render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback ?? (
        <section className="panel project-panel" role="alert">
          <div className="project-tree__empty">
            <p>Project tree unavailable.</p>
            <p>The failure was retained in Diagnostics and Console.</p>
            <button type="button" onClick={this.retry}>Retry project tree</button>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
