import {EDITOR_MODES, EditorMode, useEditorStore} from "../../../state/editor";

export function ModeSwitcher() {

    const {state, dispatch} = useEditorStore();
    const activeMode = state.shell.activeMode;

    function setMode(mode: EditorMode) {
        dispatch({type: "set-mode", mode});
    }

    return <nav className="mode-switcher" aria-label="Editor modes">
        {EDITOR_MODES.map((mode) => (
            <button key={mode}
                    type="button"
                    className={activeMode === mode ? "mode-button active" : "mode-button"}
                    aria-pressed={activeMode === mode}
                    onClick={() => setMode(mode)}
            >
                {mode}
            </button>
        ))}
    </nav>
}
