import { ErrorInfo, PropsWithChildren, ReactNode } from "react";
import { ProjectTreeNode } from "../../../state/editor";
import { ProjectTreeEntityRowBoundary } from "./ProjectTreeEntityRowBoundary";
import { ProjectTreeEntityRowProvider } from "./ProjectTreeEntityRowProvider";

export interface ProjectTreeEntityRowScopeProps extends PropsWithChildren {
  readonly node: ProjectTreeNode;
  readonly allowDelete?: boolean;
  readonly fallback?: ReactNode;
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

export function ProjectTreeEntityRowScope({
  node,
  allowDelete,
  fallback,
  onError,
  children,
}: Readonly<ProjectTreeEntityRowScopeProps>) {
  return (
    <ProjectTreeEntityRowBoundary fallback={fallback} onError={onError}>
      <ProjectTreeEntityRowProvider node={node} allowDelete={allowDelete}>
        {children}
      </ProjectTreeEntityRowProvider>
    </ProjectTreeEntityRowBoundary>
  );
}