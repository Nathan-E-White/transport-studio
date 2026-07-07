import {EDITOR_MODES, EditorMode, useEditorStore} from "../../../state/editor";

export function ModeSwitcher() {

    const {state, dispatch} = useEditorStore();
    const activeMode = state.shell.activeMode;

    function setMode(mode: EditorMode) {
        dispatch({type: "set-mode", mode});
    }

    return <div className="mode-switcher">
        {EDITOR_MODES.map((mode) => (
            <button key={mode}
                    type="button"
                    aria-pressed={activeMode === mode}
                    onClick={() => setMode(mode)}
            >
                {mode}
            </button>
        ))}
    </div>
}