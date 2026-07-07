

import { KeyboardEvent, MouseEvent } from "react";
import { getVisibleProjectTreeActions } from "./ProjectTreeActionModels";
import { useProjectTreeActions } from "./ProjectTreeActionContext";

export interface ProjectTreeActionProps {
  readonly hideSelectAction?: boolean;
}


// noinspection JSUnusedGlobalSymbols
export function ProjectTreeAction({ hideSelectAction = true }: Readonly<ProjectTreeActionProps>) {

  const { actions, dispatchAction } = useProjectTreeActions();
  const visibleActions = hideSelectAction ? getVisibleProjectTreeActions(actions) : actions;

  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <span className="project-tree-actions" aria-label="Project tree actions">
      {visibleActions.map((action) => (
        <button
          key={action.kind}
          type="button"
          className={action.className}
          title={action.title}
          aria-label={action.title}
          aria-pressed={action.pressed}
          disabled={action.disabled}
          data-action-kind={action.kind}
          data-action-tone={action.tone}
          onClick={(event) => {
            handleActionClick(event, () => dispatchAction(action));
          }}
          onKeyDown={(event) => {
            handleActionKeyDown(event);
          }}
          

        >
          <span className="project-tree-action__glyph" aria-hidden="true">
            {action.glyph}
          </span>
          <span className="project-tree-action__label">{action.label}</span>
        </button>
      ))}
    </span>
  );
}

function handleActionClick(
  event: MouseEvent<HTMLButtonElement>,
  dispatchAction: () => void,
): void {
  event.stopPropagation();
  dispatchAction();
}

function handleActionKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
  event.stopPropagation();
}