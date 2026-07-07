

import { Component, ErrorInfo, PropsWithChildren, ReactNode } from "react";

export interface ProjectTreeIconsBoundaryProps extends PropsWithChildren {
  readonly fallback?: ReactNode;
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ProjectTreeIconsBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

export class ProjectTreeIconsBoundary extends Component<
  ProjectTreeIconsBoundaryProps,
  ProjectTreeIconsBoundaryState
> {
  public state: ProjectTreeIconsBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ProjectTreeIconsBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
    console.error("Project tree icons crashed", error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <span
            className="project-tree-icon project-tree-icon--unknown project-tree-icon--error"
            aria-label="Project tree icon unavailable"
            title={this.state.error?.message ?? "Project tree icon failed to render."}
          >
            •
          </span>
        )
      );
    }

    return this.props.children;
  }
}