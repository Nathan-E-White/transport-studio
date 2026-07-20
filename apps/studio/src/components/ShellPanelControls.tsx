import {useEditorStore} from "../state/editor";

export const SHELL_PANEL_IDS = {
  projectTree: "studio-project-tree-panel",
  inspector: "studio-inspector-panel",
  runDock: "studio-run-dock-panel",
} as const;

export function ShellPanelControls() {
  const {state, dispatch} = useEditorStore();
  const {leftPanelOpen, rightPanelOpen, bottomDockOpen} = state.shell;

  return (
    <div className="shell-panel-controls" role="group" aria-label="Studio panels">
      <PanelToggle
        label="Project Tree"
        controls={SHELL_PANEL_IDS.projectTree}
        expanded={leftPanelOpen}
        onToggle={() => dispatch({type: "set-left-panel-open", open: !leftPanelOpen})}
      />
      <PanelToggle
        label="Inspector"
        controls={SHELL_PANEL_IDS.inspector}
        expanded={rightPanelOpen}
        onToggle={() => dispatch({type: "set-right-panel-open", open: !rightPanelOpen})}
      />
      <PanelToggle
        label="Run Dock"
        controls={SHELL_PANEL_IDS.runDock}
        expanded={bottomDockOpen}
        onToggle={() => dispatch({type: "set-bottom-dock-open", open: !bottomDockOpen})}
      />
    </div>
  );
}

function PanelToggle({
  label,
  controls,
  expanded,
  onToggle,
}: {
  readonly label: string;
  readonly controls: string;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={expanded ? "shell-panel-toggle active" : "shell-panel-toggle"}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
    >
      {label}
    </button>
  );
}
