

import { ErrorInfo, PropsWithChildren, ReactNode } from "react";
import { ProjectTreeIconsBoundary } from "./ProjectTreeIconsBoundary";
import { ProjectTreeIconsProvider } from "./ProjectTreeIconsProvider";

export interface ProjectTreeIconsScopeProps extends PropsWithChildren {
  readonly fallback?: ReactNode;
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

// noinspection JSUnusedGlobalSymbols
export function ProjectTreeIconsScope({
  fallback,
  onError,
  children,
}: Readonly<ProjectTreeIconsScopeProps>) {
  return (
    <ProjectTreeIconsBoundary fallback={fallback} onError={onError}>
      <ProjectTreeIconsProvider>{children}</ProjectTreeIconsProvider>
    </ProjectTreeIconsBoundary>
  );
}