

import { ErrorInfo, PropsWithChildren, ReactNode } from "react";
import { ProjectTreeActionModel } from "./ProjectTreeActionModels";
import { ProjectTreeActionBoundary } from "./ProjectTreeActionBoundary";
import { ProjectTreeActionProvider } from "./ProjectTreeActionProvider";

export interface ProjectTreeActionScopeProps extends PropsWithChildren {
  readonly refForActions: ProjectTreeActionModel["ref"];
  readonly visible: boolean;
  readonly selectable: boolean;
  readonly locked: boolean;
  readonly includedInCompile: boolean;
  readonly helperOnly: boolean;
  readonly allowDelete?: boolean;
  readonly fallback?: ReactNode;
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

// noinspection JSUnusedGlobalSymbols
export function ProjectTreeActionScope({
  refForActions,
  visible,
  selectable,
  locked,
  includedInCompile,
  helperOnly,
  allowDelete,
  fallback,
  onError,
  children,
}: Readonly<ProjectTreeActionScopeProps>) {
  return (
    <ProjectTreeActionBoundary fallback={fallback} onError={onError}>
      <ProjectTreeActionProvider
        refForActions={refForActions}
        visible={visible}
        selectable={selectable}
        locked={locked}
        includedInCompile={includedInCompile}
        helperOnly={helperOnly}
        allowDelete={allowDelete}
      >
        {children}
      </ProjectTreeActionProvider>
    </ProjectTreeActionBoundary>
  );
}