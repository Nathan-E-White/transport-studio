import {Component, ErrorInfo, PropsWithChildren, ReactNode} from "react";

export interface ProjectTreeBoundaryProps extends PropsWithChildren {
  readonly fallback?: ReactNode;
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
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
    this.props.onError?.(error, errorInfo);
    console.error("Project tree crashed", error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback ?? (
        <section className="panel project-panel" role="alert">
          <div className="project-tree__empty" title={this.state.error.message}>
            Project tree unavailable.
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
