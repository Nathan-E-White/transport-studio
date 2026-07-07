import { Component, ErrorInfo, PropsWithChildren, ReactNode } from "react";

export interface ProjectTreeEntityRowBoundaryProps extends PropsWithChildren {
  readonly fallback?: ReactNode;
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ProjectTreeEntityRowBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

export class ProjectTreeEntityRowBoundary extends Component<
  ProjectTreeEntityRowBoundaryProps,
  ProjectTreeEntityRowBoundaryState
> {
  public state: ProjectTreeEntityRowBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ProjectTreeEntityRowBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
    console.error("Project tree entity row crashed", error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            role="treeitem"
            aria-selected={false}
            tabIndex={-1}
            className="project-tree-entity-row project-tree-entity-row--error"
            aria-label="Project tree entity row unavailable"
            title={this.state.error?.message ?? "Project tree entity row failed to render."}
          >
            <span className="project-tree-entity-row__label">row unavailable</span>
          </div>
        )
      );
    }

    return this.props.children;
  }
}