import { Component, ErrorInfo, PropsWithChildren, ReactNode } from "react";

export interface ProjectTreeBadgesBoundaryProps extends PropsWithChildren {
  readonly fallback?: ReactNode;
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ProjectTreeBadgesBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

export class ProjectTreeBadgesBoundary extends Component<
  ProjectTreeBadgesBoundaryProps,
  ProjectTreeBadgesBoundaryState
> {
  public state: ProjectTreeBadgesBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ProjectTreeBadgesBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
    console.error("Project tree badges crashed", error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <span
            className="project-tree-badge project-tree-badge--warning"
            title={this.state.error?.message ?? "Project tree badges failed to render."}
          >
            badges unavailable
          </span>
        )
      );
    }

    return this.props.children;
  }
}