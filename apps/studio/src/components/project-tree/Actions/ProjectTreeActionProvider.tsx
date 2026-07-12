

import { PropsWithChildren, useCallback, useMemo } from "react";
import { useEditorStore } from "../../../state/editor";
import { useProjectTree } from "../ProjectTreeProvider";
import { ProjectTreeActionContext } from "./ProjectTreeActionContext";
import { buildProjectTreeActions, ProjectTreeActionModel } from "./ProjectTreeActionModels";

export interface ProjectTreeActionProviderProps extends PropsWithChildren {
  readonly refForActions: ProjectTreeActionModel["ref"];
  readonly visible: boolean;
  readonly selectable: boolean;
  readonly locked: boolean;
  readonly includedInCompile: boolean;
  readonly helperOnly: boolean;
  readonly allowDelete?: boolean;
}

// noinspection JSUnusedGlobalSymbols
export function ProjectTreeActionProvider({
  refForActions,
  visible,
  selectable,
  locked,
  includedInCompile,
  helperOnly,
  allowDelete = true,
  children,
}: Readonly<ProjectTreeActionProviderProps>) {
  const { dispatch } = useEditorStore();
  const projectTree = useProjectTree();

  const actions = useMemo(
    () =>
      buildProjectTreeActions({
        ref: refForActions,
        visible,
        selectable,
        locked,
        includedInCompile,
        helperOnly,
        allowDelete,
      }),
    [allowDelete, helperOnly, includedInCompile, locked, refForActions, selectable, visible],
  );

  const dispatchAction = useCallback(
    (action: ProjectTreeActionModel): void => {
      if (action.disabled) {
        return;
      }

      switch (action.kind) {
        case "select":
          dispatch({
            type: "select-one",
            ref: action.ref,
          });
          return;

        case "edit-metadata":
          projectTree.onRequestEdit(action.ref);
          return;

        case "toggle-visible":
          dispatch({
            type: "set-visible",
            ref: action.ref,
            visible: !action.pressed,
          });
          return;

        case "toggle-locked":
          dispatch({
            type: "set-locked",
            ref: action.ref,
            locked: !action.pressed,
          });
          return;

        case "toggle-included-in-compile":
          dispatch({
            type: "set-included-in-compile",
            ref: action.ref,
            includedInCompile: !action.pressed,
          });
          return;

        case "duplicate":
          dispatch({type: "duplicate-project-entity", ref: action.ref});
          return;

        case "delete":
          dispatch({type: "delete-project-entity", ref: action.ref});
          return;

        default:
          assertNever(action.kind);
      }
    },
    [dispatch, projectTree],
  );

  const value = useMemo(
    () => ({
      actions,
      dispatch,
      dispatchAction,
    }),
    [actions, dispatch, dispatchAction],
  );

  return (
    <ProjectTreeActionContext.Provider value={value}>
      {children}
    </ProjectTreeActionContext.Provider>
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled project tree action case: ${value}`);
}
