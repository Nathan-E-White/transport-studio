// apps/studio/src/components/BottomDockTabs.tsx

import {
    EditorBottomDockTab,
    useEditorStore,
} from "../../state/editor";

const TABS: readonly EditorBottomDockTab[] = [
    "run",
    "tallies",
    "tracks",
    "diagnostics",
    "console",
];

export function BottomDockTabs() {
    const { state, dispatch } = useEditorStore();

    return (
        <div className="bottom-dock-tabs">
            {TABS.map((tab) => (
                <button
                    key={tab}
                    type="button"
                    aria-pressed={state.shell.bottomDockTab === tab}
                    onClick={() =>
                        dispatch({
                            type: "set-bottom-dock-tab",
                            tab,
                        })
                    }
                >
                    {tab}
                </button>
            ))}
        </div>
    );
}