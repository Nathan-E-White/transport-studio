// apps/studio/src/components/BottomDockTabs.tsx

import {
    EditorBottomDockTab,
    useEditorStore,
} from "../../state/editor";
import {useRef, type KeyboardEvent} from "react";

const TABS: readonly EditorBottomDockTab[] = [
    "run",
    "tallies",
    "tracks",
    "diagnostics",
    "console",
];

export function BottomDockTabs() {
    const { state, dispatch } = useEditorStore();
    const tabRefs = useRef<Partial<Record<EditorBottomDockTab, HTMLButtonElement | null>>>({});

    function activate(tab: EditorBottomDockTab, moveFocus = false) {
        dispatch({type: "set-bottom-dock-tab", tab});
        if (moveFocus) {
            tabRefs.current[tab]?.focus();
        }
    }

    function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentTab: EditorBottomDockTab) {
        const currentIndex = TABS.indexOf(currentTab);
        let nextIndex: number | undefined;

        switch (event.key) {
            case "ArrowRight":
                nextIndex = (currentIndex + 1) % TABS.length;
                break;
            case "ArrowLeft":
                nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
                break;
            case "Home":
                nextIndex = 0;
                break;
            case "End":
                nextIndex = TABS.length - 1;
                break;
            default:
                return;
        }

        event.preventDefault();
        activate(TABS[nextIndex]!, true);
    }

    return (
        <div className="bottom-tabs" role="tablist" aria-label="Run details">
            {TABS.map((tab) => (
                <button
                    key={tab}
                    type="button"
                    id={bottomDockTabId(tab)}
                    role="tab"
                    ref={(node) => { tabRefs.current[tab] = node; }}
                    className={state.shell.bottomDockTab === tab ? "active" : ""}
                    aria-selected={state.shell.bottomDockTab === tab}
                    aria-controls={bottomDockPanelId(tab)}
                    tabIndex={state.shell.bottomDockTab === tab ? 0 : -1}
                    onClick={() => activate(tab)}
                    onKeyDown={(event) => handleKeyDown(event, tab)}
                >
                    {tab}
                </button>
            ))}
        </div>
    );
}

export function bottomDockTabId(tab: EditorBottomDockTab): string {
    return `bottom-dock-tab-${tab}`;
}

export function bottomDockPanelId(tab: EditorBottomDockTab): string {
    return `bottom-dock-panel-${tab}`;
}
