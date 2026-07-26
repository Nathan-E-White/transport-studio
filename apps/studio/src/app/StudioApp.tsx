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
import {ModeSwitcher} from "../components/project-tree/ModeSwitcher/ModeSwitcher";
import {SHELL_PANEL_IDS, ShellPanelControls} from "../components/ShellPanelControls";
import {InspectorPanel} from "../panels/InspectorPanel";
import {RunPanel} from "../panels/RunPanel";
import {TransportViewport} from "../viewport/TransportViewport";
import {
    EditorStateRoot,
    EditorEntityRef,
    getPrimarySelection,
    getEditorModeBehavior,
    getModeEditingDisabledReason,
    selectVisibility,
    useEditorStore,
    type EditorMode as StoreEditorMode,
} from "../state/editor";
import {
    createRunSessionStore,
    selectCurrentRunSession,
    selectRenderableTracks,
    selectRenderableTallies,
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
import {
    createEditorFailureJournal,
    type EditorFailureJournal,
} from "./editorFailureJournal";

export type EditorMode = StoreEditorMode;

export interface StudioAppProps {
    readonly failureJournal?: EditorFailureJournal;
}

export function StudioApp({failureJournal: injectedFailureJournal}: StudioAppProps = {}) {
    const [ownedFailureJournal] = useState(() => createEditorFailureJournal());
    const failureJournal = injectedFailureJournal ?? ownedFailureJournal;
    return <EditorStateRoot initialProject={createInitialProject()} failureJournal={failureJournal}>
        <StudioWorkbench failureJournal={failureJournal}/>
    </EditorStateRoot>;
}

function StudioWorkbench({failureJournal}: {readonly failureJournal: EditorFailureJournal}) {

    const {state, dispatch} = useEditorStore();
    const project = state.scene.project!;
    const selectedEntityId = getPrimarySelection(state.selection)?.id;
    const visibility = selectVisibility(state);
    const runSessionStoreRef = useRef<RunSessionStore | null>(null);
    if (runSessionStoreRef.current === null) {
        runSessionStoreRef.current = createRunSessionStore({initialProject: project});
    }
    const runSessionStore = runSessionStoreRef.current;
    const tracks = useRunSessionSelector(runSessionStore, selectRenderableTracks);
    const tallies = useRunSessionSelector(runSessionStore, selectRenderableTallies);
    const runDiagnostics = useRunSessionSelector(runSessionStore, selectRunDiagnostics);
    const runSession = useRunSessionSelector(runSessionStore, selectCurrentRunSession);
    const runBackend = useRunSessionSelector(runSessionStore, selectRunBackend);
    const freshness = useRunSessionSelector(runSessionStore, selectRunFreshness);
    const renderingBlock = useRunSessionSelector(runSessionStore, selectRenderingBlock);
    const resultView = useRunSessionSelector(runSessionStore, selectResultView);
    const submittedProject = useRunSessionSelector(runSessionStore, selectSubmittedProject);
    const editorFailures = useSyncExternalStore(
        failureJournal.subscribe,
        failureJournal.getSnapshot,
        failureJournal.getSnapshot,
    );
    const [compileDiagnostics, setCompileDiagnostics] = useState<readonly Diagnostic[]>([]);
    const [runStarting, setRunStarting] = useState(false);
    const [cancellationRequested, setCancellationRequested] = useState(false);
    const runActivationInProgress = useRef(false);
    const [showTracks, setShowTracks] = useState(true);
    const [showTallies, setShowTallies] = useState(true);
    const [showAxes, setShowAxes] = useState(true);
    const [selectedResultTallyId, setSelectedResultTallyId] = useState<string | undefined>();
    const mode = state.shell.activeMode;
    const modeBehavior = getEditorModeBehavior(mode);
    const {leftPanelOpen, rightPanelOpen, bottomDockOpen} = state.shell;

    const diagnostics = useMemo<readonly Diagnostic[]>(() => [
        ...validateProject(project),
        ...compileDiagnostics,
        ...runDiagnostics,
        ...editorFailures.diagnostics,
    ], [project, compileDiagnostics, runDiagnostics, editorFailures.diagnostics]);
    const tallyDiagnostics = useMemo(
        () => runDiagnostics.filter((diagnostic) => diagnostic.code?.startsWith("run.tally.")),
        [runDiagnostics],
    );
    const runConfiguration = useMemo(() => ({
        ...project.runConfiguration,
        backend: runBackend,
    }), [project.runConfiguration, runBackend]);
    const presentationProject = resultView === "submitted" && renderingBlock && submittedProject
        ? submittedProject
        : project;
    const presentationSelectedEntityId = resultView === "submitted" && selectedResultTallyId
        ? selectedResultTallyId
        : selectedEntityId;
    const selectedEntity = presentationProject.scene.entities.find((entity) => entity.id === presentationSelectedEntityId);
    const inspectorEntityId = state.selection.inspectorFocus?.id;
    const inspectorEntity = presentationProject.scene.entities.find((entity) => entity.id === inspectorEntityId);
    const sceneStats = useMemo(() => getSceneStats(presentationProject.scene.entities), [presentationProject]);
    const escapedCount = tracks.filter((track) => track.events.at(-1)?.type === "escape").length;
    const absorbedCount = tracks.filter((track) => track.events.at(-1)?.type === "absorb").length;
    const runBusy = runStarting || runSession?.status === "prepared" || runSession?.status === "running";
    const canCancel = runSessionStore.canCancel();

    useEffect(() => {
        void runSessionStore.updateEditableScene(project);
    }, [project, runSessionStore]);

    useEffect(() => {
        if (!runBusy && cancellationRequested) setCancellationRequested(false);
    }, [runBusy, cancellationRequested]);

    useEffect(() => {
        if (resultView !== "current") return;
        const selected = project.scene.entities.find((entity) => entity.id === selectedEntityId);
        setSelectedResultTallyId(selected?.kind === "tally" ? selected.id : undefined);
    }, [project.scene.entities, resultView, selectedEntityId]);

    async function runDemo() {
        await startCompiledRun(createToyExecutionAdapter({
            visibleHistoryBudget: project.runConfiguration.visibleHistoryBudget,
        }));
    }

    async function runNative() {
        await startCompiledRun(createNativeExecutionAdapter(createTauriNativePhotonSmokeBridge()));
    }

    async function startCompiledRun(adapter: ReturnType<typeof createToyExecutionAdapter>) {
        if (runActivationInProgress.current) return;
        runActivationInProgress.current = true;
        setRunStarting(true);
        try {
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
            if (!result.started && "diagnostic" in result) {
                setCompileDiagnostics((current) => [...current, result.diagnostic]);
                dispatch({type: "set-bottom-dock-tab", tab: "diagnostics"});
            } else if (runSessionStore.getSnapshot().current?.status === "failed") {
                dispatch({type: "set-bottom-dock-tab", tab: "diagnostics"});
            }
        } finally {
            runActivationInProgress.current = false;
            setRunStarting(false);
        }
    }

    async function cancelRun() {
        setCancellationRequested(true);
        const result = await runSessionStore.cancel();
        if (!result.cancelled) setCancellationRequested(false);
    }

    function clearResults() {
        runSessionStore.clear();
        setCompileDiagnostics([]);
        dispatch({type: "set-bottom-dock-tab", tab: "run"});
    }

    function selectEntity(entityId: string | undefined, toggle = false) {
        const presentationEntity = presentationProject.scene.entities.find((candidate) => candidate.id === entityId);
        setSelectedResultTallyId(presentationEntity?.kind === "tally" ? presentationEntity.id : undefined);
        const entity = project.scene.entities.find((candidate) => candidate.id === entityId);
        if (!entity) {
            dispatch({type: "clear-selection"});
            return;
        }
        const ref: EditorEntityRef = {kind: entity.kind, id: entity.id};
        dispatch(toggle ? {type: "toggle-selected", ref} : {type: "select-one", ref});
    }

    return (

        <div
            className="studio-shell"
            data-left-panel-open={leftPanelOpen}
            data-right-panel-open={rightPanelOpen}
            data-bottom-panel-open={bottomDockOpen}
        >
            <header className="toolbar">
                <div className="brand-lockup">
                    <div className="brand-mark">τ</div>
                    <div>
                        <div className="brand">Transport Studio</div>
                        <div className="brand-subtitle">visual Monte Carlo workbench</div>
                    </div>
                </div>

                <button className="viewport-focus-shortcut" type="button"
                    onClick={() => document.getElementById("transport-viewport")?.focus()}>Focus viewport</button>

                <ModeSwitcher/>

                <div className="toolbar-actions">
                    <StyleSelectorBoundary/>
                    <button className="primary-button" disabled={runBusy} onClick={() => void runDemo()}>▶ Run Toy Photons</button>
                    <button disabled={runBusy} onClick={() => void runNative()}>Run Native Rust</button>
                    <button disabled={runBusy} onClick={clearResults}>Clear</button>
                    {(canCancel || cancellationRequested) && <button disabled={cancellationRequested} onClick={() => void cancelRun()}>
                        {cancellationRequested ? "Cancelling run…" : "Cancel run"}
                    </button>}
                    {runBusy && <p className="run-progress" role="status" aria-label="Run progress">{describeRunProgress(runStarting, cancellationRequested, runSession)}</p>}
                </div>
            </header>

            <aside id={SHELL_PANEL_IDS.projectTree} className="left-panel" hidden={!leftPanelOpen}>
                <ProjectTree
                    diagnostics={diagnostics}
                    failureJournal={failureJournal}
                />
            </aside>

            <main className="viewport-region">
                <ShellPanelControls/>
                <TransportViewport
                    project={presentationProject}
                    tracks={showTracks ? tracks : []}
                    tallies={tallies}
                    tallyDiagnostics={tallyDiagnostics}
                    selectedEntityId={presentationSelectedEntityId}
                    selectedEntityIds={state.selection.selected.map((ref) => ref.id)}
                    hoveredEntityId={state.selection.hovered?.id}
                    onSelect={selectEntity}
                    onHover={(entityId) => {
                        const entity = project.scene.entities.find((candidate) => candidate.id === entityId);
                        dispatch({type: "set-hovered", ref: entity ? {kind: entity.kind, id: entity.id} : null});
                    }}
                    showTallies={showTallies}
                    showAxes={showAxes}
                    mode={mode}
                    visibility={visibility}
                />
                <div className="viewport-hud top-left">
                    <span className="hud-kicker">{mode.toUpperCase()} MODE</span>
                    <strong>{selectedEntity?.name ?? "No entity selected"}</strong>
                    <span>{modeBehavior.description}</span>
                    <span>Emphasis: {modeBehavior.viewportEmphasis}</span>
                    <span>{tracks.length} sampled tracks · {escapedCount} escaped · {absorbedCount} absorbed</span>
                </div>
                <div className="viewport-hud bottom-right">
                    <label><input type="checkbox" checked={showTracks}
                                  onChange={(event) => setShowTracks(event.target.checked)}/> Tracks</label>
                    <label><input type="checkbox" checked={showTallies}
                                  onChange={(event) => setShowTallies(event.target.checked)}/> Tallies</label>
                    <label><input type="checkbox" checked={showAxes}
                                  onChange={(event) => setShowAxes(event.target.checked)}/> Axes</label>
                </div>
            </main>

            <aside id={SHELL_PANEL_IDS.inspector} className="right-panel" hidden={!rightPanelOpen}>
                <InspectorPanel entity={inspectorEntity} diagnostics={diagnostics} tracks={tracks}
                                project={presentationProject}
                                editDiagnostics={state.inspectorEditDiagnostics}
                                editingDisabledReason={resultView === "submitted"
                                    ? "Submitted run snapshots are read-only. Return to the current scene to edit."
                                    : getModeEditingDisabledReason(mode)}
                                onEntityChange={(baseline, candidate) => dispatch({type: "apply-inspector-edit", baseline, candidate})}/>
            </aside>

            <footer id={SHELL_PANEL_IDS.runDock} className="bottom-panel" hidden={!bottomDockOpen}>
                <RunPanel
                    config={runConfiguration}
                    project={presentationProject}
                    diagnostics={diagnostics}
                    tracks={tracks}
                    tallies={tallies}
                    selectedTallyId={selectedEntity?.kind === "tally" ? selectedEntity.id : undefined}
                    sceneStats={sceneStats}
                    freshness={freshness}
                    renderingBlock={renderingBlock}
                    resultView={resultView}
                    session={runSession}
                    editorConsoleEntries={editorFailures.consoleEntries}
                    onTallySelect={(tallyId) => selectEntity(tallyId)}
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

function describeRunProgress(starting: boolean, cancelling: boolean, session: ReturnType<typeof selectCurrentRunSession>): string {
    if (cancelling) return "Cancelling run";
    if (starting && !session) return "Starting run";
    if (!session) return "Starting run";
    const progress = session.progress;
    const progressText = progress ? ` · ${progress.completedHistories.toLocaleString()} / ${progress.totalHistories.toLocaleString()}` : "";
    return `Run ${session.phase.replaceAll("-", " ")}${progressText}`;
}
