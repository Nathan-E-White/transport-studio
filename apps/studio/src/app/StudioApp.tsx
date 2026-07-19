import {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore} from "react";
import type {
    Diagnostic,
    SceneEntity,
} from "@transport/domain";
import {validateProject} from "@transport/validation";
import {compileTransportProblem} from "@transport/domain/compile/CompileTransportProblem";
import {createInitialProject} from "./createInitialProject";
import {createTauriNativePhotonSmokeBridge} from "./nativePhotonSmokeTauriBridge";
import {ProjectTree} from "../components/project-tree/ProjectTree";
import {StyleSelectorBoundary} from "../components/style-selector/StyleSelectorBoundary";
import {InspectorPanel} from "../panels/InspectorPanel";
import {RunPanel} from "../panels/RunPanel";
import {TransportViewport} from "../viewport/TransportViewport";
import {
    EditorStateRoot,
    getPrimarySelection,
    useEditorStore,
    type EditorBottomDockTab,
    type EditorMode as StoreEditorMode,
} from "../state/editor";
import {
    createRunSessionStore,
    selectRenderableTracks,
    selectRenderingBlock,
    selectResultView,
    selectRunBackend,
    selectRunDiagnostics,
    selectRunFreshness,
    selectSubmittedProject,
    type RunSessionStore,
    type RunSessionStoreSnapshot,
} from "./runSession";
import {createNativeExecutionAdapter, createToyExecutionAdapter} from "./runExecutionAdapters";

export type EditorMode = StoreEditorMode;
export type BottomTab = EditorBottomDockTab;

const modes: readonly EditorMode[] = ["design", "probe", "run", "analyze", "debug"];

export function StudioApp() {
    return <EditorStateRoot initialProject={createInitialProject()}><StudioWorkbench/></EditorStateRoot>;
}

function StudioWorkbench() {

    const {state, dispatch} = useEditorStore();
    const project = state.scene.project!;
    const selectedEntityId = getPrimarySelection(state.selection)?.id;
    const runSessionStoreRef = useRef<RunSessionStore | null>(null);
    if (runSessionStoreRef.current === null) {
        runSessionStoreRef.current = createRunSessionStore({initialProject: project});
    }
    const runSessionStore = runSessionStoreRef.current;
    const tracks = useRunSessionSelector(runSessionStore, selectRenderableTracks);
    const runDiagnostics = useRunSessionSelector(runSessionStore, selectRunDiagnostics);
    const runBackend = useRunSessionSelector(runSessionStore, selectRunBackend);
    const freshness = useRunSessionSelector(runSessionStore, selectRunFreshness);
    const renderingBlock = useRunSessionSelector(runSessionStore, selectRenderingBlock);
    const resultView = useRunSessionSelector(runSessionStore, selectResultView);
    const submittedProject = useRunSessionSelector(runSessionStore, selectSubmittedProject);
    const [compileDiagnostics, setCompileDiagnostics] = useState<readonly Diagnostic[]>([]);
    const [showTracks, setShowTracks] = useState(true);
    const [showTallies, setShowTallies] = useState(true);
    const [showDiagnostics, setShowDiagnostics] = useState(true);
    const mode = state.shell.activeMode;
    const bottomTab = state.shell.bottomDockTab;

    const diagnostics = useMemo<readonly Diagnostic[]>(() => [
        ...validateProject(project),
        ...compileDiagnostics,
        ...runDiagnostics,
    ], [project, compileDiagnostics, runDiagnostics]);
    const runConfiguration = useMemo(() => ({
        ...project.runConfiguration,
        backend: runBackend,
    }), [project.runConfiguration, runBackend]);
    const presentationProject = resultView === "submitted" && renderingBlock && submittedProject
        ? submittedProject
        : project;
    const selectedEntity = presentationProject.scene.entities.find((entity) => entity.id === selectedEntityId);
    const sceneStats = useMemo(() => getSceneStats(presentationProject.scene.entities), [presentationProject]);
    const escapedCount = tracks.filter((track) => track.events.at(-1)?.type === "escape").length;
    const absorbedCount = tracks.filter((track) => track.events.at(-1)?.type === "absorb").length;

    useEffect(() => {
        void runSessionStore.updateEditableScene(project);
    }, [project, runSessionStore]);

    async function runDemo() {
        await startCompiledRun(createToyExecutionAdapter({
            visibleHistoryBudget: project.runConfiguration.visibleHistoryBudget,
        }));
    }

    async function runNative() {
        await startCompiledRun(createNativeExecutionAdapter(createTauriNativePhotonSmokeBridge()));
    }

    async function startCompiledRun(adapter: ReturnType<typeof createToyExecutionAdapter>) {
        await runSessionStore.updateEditableScene(project);
        const compileResult = compileTransportProblem(project);
        setCompileDiagnostics(compileResult.diagnostics.map((item) => ({
            severity: item.level,
            code: item.code,
            message: `${item.code}: ${item.message}`,
            entityId: item.entityId as Diagnostic["entityId"],
        })));
        if (!compileResult.ok || !compileResult.value) {
            dispatch({type: "set-bottom-dock-tab", tab: "diagnostics"});
            return;
        }
        dispatch({type: "set-mode", mode: "run"});
        dispatch({type: "set-bottom-dock-tab", tab: "run"});
        const result = await runSessionStore.start({project, problem: compileResult.value, adapter});
        if (!result.started) {
            setCompileDiagnostics((current) => [...current, result.diagnostic]);
            dispatch({type: "set-bottom-dock-tab", tab: "diagnostics"});
        } else if (runSessionStore.getSnapshot().current?.status === "failed") {
            dispatch({type: "set-bottom-dock-tab", tab: "diagnostics"});
        }
    }

    function clearResults() {
        runSessionStore.clear();
        setCompileDiagnostics([]);
        dispatch({type: "set-bottom-dock-tab", tab: "run"});
    }

    function selectEntity(entityId: string | undefined) {
        const entity = project.scene.entities.find((candidate) => candidate.id === entityId);
        dispatch(entity ? {type: "select-one", ref: {kind: entity.kind, id: entity.id}} : {type: "clear-selection"});
    }

    return (

        <div className="studio-shell">
            <header className="toolbar">
                <div className="brand-lockup">
                    <div className="brand-mark">τ</div>
                    <div>
                        <div className="brand">Transport Studio</div>
                        <div className="brand-subtitle">visual Monte Carlo workbench</div>
                    </div>
                </div>

                <nav className="mode-switcher" aria-label="Editor modes">
                    {modes.map((candidateMode) => (
                        <button
                            key={candidateMode}
                            className={candidateMode === mode ? "mode-button active" : "mode-button"}
                            onClick={() => dispatch({type: "set-mode", mode: candidateMode})}
                        >
                            {candidateMode}
                        </button>
                    ))}
                </nav>

                <div className="toolbar-actions">
                    <StyleSelectorBoundary/>
                    <button className="primary-button" onClick={() => void runDemo()}>▶ Run Toy Photons</button>
                    <button onClick={() => void runNative()}>Run Native Rust</button>
                    <button onClick={clearResults}>Clear</button>
                </div>
            </header>

            <aside className="left-panel">
                <ProjectTree
                    diagnostics={diagnostics}
                />
            </aside>

            <main className="viewport-region">
                <TransportViewport
                    project={presentationProject}
                    tracks={showTracks ? tracks : []}
                    selectedEntityId={selectedEntityId}
                    onSelect={(entityId) => selectEntity(entityId)}
                    showTallies={showTallies}
                    showDiagnostics={showDiagnostics}
                    mode={mode}
                />
                <div className="viewport-hud top-left">
                    <span className="hud-kicker">{mode.toUpperCase()} MODE</span>
                    <strong>{selectedEntity?.name ?? "No entity selected"}</strong>
                    <span>{tracks.length} sampled tracks · {escapedCount} escaped · {absorbedCount} absorbed</span>
                </div>
                <div className="viewport-hud bottom-right">
                    <label><input type="checkbox" checked={showTracks}
                                  onChange={(event) => setShowTracks(event.target.checked)}/> Tracks</label>
                    <label><input type="checkbox" checked={showTallies}
                                  onChange={(event) => setShowTallies(event.target.checked)}/> Tallies</label>
                    <label><input type="checkbox" checked={showDiagnostics}
                                  onChange={(event) => setShowDiagnostics(event.target.checked)}/> Diagnostics</label>
                </div>
            </main>

            <aside className="right-panel">
                <InspectorPanel entity={selectedEntity} diagnostics={diagnostics} tracks={tracks}
                                project={presentationProject}/>
            </aside>

            <footer className="bottom-panel">
                <RunPanel
                    config={runConfiguration}
                    diagnostics={diagnostics}
                    tracks={tracks}
                    activeTab={bottomTab}
                    onTabChange={(tab) => dispatch({type: "set-bottom-dock-tab", tab})}
                    sceneStats={sceneStats}
                    freshness={freshness}
                    renderingBlock={renderingBlock}
                    resultView={resultView}
                    onResultViewChange={(view) => runSessionStore.setResultView(view)}
                />
            </footer>
        </div>
    );
}

function useRunSessionSelector<T>(
    store: RunSessionStore,
    selector: (snapshot: RunSessionStoreSnapshot) => T,
): T {
    const subscribe = useCallback(
        (listener: () => void) => store.subscribeSelector(selector, listener),
        [store, selector],
    );
    const getSnapshot = useCallback(() => selector(store.getSnapshot()), [store, selector]);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function getSceneStats(entities: readonly SceneEntity[]) {
    return {
        geometry: entities.filter((entity) => entity.kind === "geometry").length,
        materials: entities.filter((entity) => entity.kind === "material").length,
        sources: entities.filter((entity) => entity.kind === "source").length,
        tallies: entities.filter((entity) => entity.kind === "tally").length
    };
}
