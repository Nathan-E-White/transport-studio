

import { Component, ErrorInfo, PropsWithChildren, ReactNode } from "react";

export interface ProjectTreeActionBoundaryProps extends PropsWithChildren {
  readonly fallback?: ReactNode;
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ProjectTreeActionBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

export class ProjectTreeActionBoundary extends Component<
  ProjectTreeActionBoundaryProps,
  ProjectTreeActionBoundaryState
> {
  public state: ProjectTreeActionBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ProjectTreeActionBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
    console.error("Project tree actions crashed", error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <span
            className="project-tree-actions project-tree-actions--error"
            aria-label="Project tree actions unavailable"
            title={this.state.error?.message ?? "Project tree actions failed to render."}
          >
            actions unavailable
          </span>
        )
      );
    }

    return this.props.children;
  }
}