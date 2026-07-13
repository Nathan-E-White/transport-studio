import {useEffect, useMemo, useReducer, useRef, useState} from "react";
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
    createNativeRunActions,
    createRunSession,
    createToyRunActions,
    reduceRunSession,
    type RunSessionAction,
} from "./runSession";

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
    const [runSession, dispatchRunSession] = useReducer(
        reduceRunSession,
        project.runConfiguration.backend,
        createRunSession,
    );
    const runAttemptSequence = useRef(0);
    const runSessionRef = useRef(runSession);
    const [showTracks, setShowTracks] = useState(true);
    const [showTallies, setShowTallies] = useState(true);
    const [showDiagnostics, setShowDiagnostics] = useState(true);
    const tracks = runSession.tracks;
    const mode = state.shell.activeMode;
    const bottomTab = state.shell.bottomDockTab;

    const diagnostics = useMemo<readonly Diagnostic[]>(() => [
        ...validateProject(project),
        ...runSession.diagnostics,
    ], [project, runSession.diagnostics]);
    const runConfiguration = useMemo(() => ({
        ...project.runConfiguration,
        backend: runSession.backend,
    }), [project.runConfiguration, runSession.backend]);
    const selectedEntity = project.scene.entities.find((entity) => entity.id === selectedEntityId);
    const sceneStats = useMemo(() => getSceneStats(project.scene.entities), [project]);
    const escapedCount = tracks.filter((track) => track.events.at(-1)?.type === "escape").length;
    const absorbedCount = tracks.filter((track) => track.events.at(-1)?.type === "absorb").length;

    useEffect(() => {
        runSessionRef.current = runSession;
    }, [runSession]);

    useEffect(() => {
        dispatchRunSession({type: "scene-changed"});
    }, [project]);

    function runDemo() {
        const attemptId = nextAttemptId(runSession.sceneRevision);
        applyRunActions(createToyRunActions(
            project,
            compileTransportProblem(project),
            runSession.sceneRevision,
            attemptId,
        ));
    }

    async function runNative() {
        const sceneRevision = runSession.sceneRevision;
        const attemptId = nextAttemptId(sceneRevision);
        const starting: RunSessionAction = {
            type: "compilation-started",
            backend: "native",
            sceneRevision,
            attemptId,
        };
        applyRunActions([starting]);
        const compileResult = compileTransportProblem(project);
        const actions = await createNativeRunActions(
            compileResult,
            sceneRevision,
            attemptId,
            createTauriNativePhotonSmokeBridge(),
        );
        applyRunActions(actions);
    }

    function clearResults() {
        dispatchRunSession({type: "clear"});
        dispatch({type: "set-bottom-dock-tab", tab: "run"});
    }

    function nextAttemptId(sceneRevision: number): string {
        runAttemptSequence.current += 1;
        return `${sceneRevision}:${runAttemptSequence.current}`;
    }

    function applyRunActions(actions: readonly RunSessionAction[]) {
        let activeRevision = runSessionRef.current.sceneRevision;
        let activeAttempt = runSessionRef.current.attemptId;
        for (const action of actions) {
            if (action.type === "compilation-started") {
                activeRevision = action.sceneRevision;
                activeAttempt = action.attemptId;
            } else if (
                "attemptId" in action
                && (action.sceneRevision !== activeRevision || action.attemptId !== activeAttempt)
            ) {
                continue;
            }
            dispatchRunSession(action);
            if (action.type === "compilation-started") {
                dispatch({type: "set-mode", mode: "run"});
                dispatch({type: "set-bottom-dock-tab", tab: "run"});
            } else if (
                action.type === "compilation-failed"
                || (action.type === "backend-event" && action.event.type === "runFailed")
            ) {
                dispatch({type: "set-bottom-dock-tab", tab: "diagnostics"});
            }
        }
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
                    <button className="primary-button" onClick={runDemo}>▶ Run Toy Photons</button>
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
                    project={project}
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
                                project={project}/>
            </aside>

            <footer className="bottom-panel">
                <RunPanel
                    config={runConfiguration}
                    diagnostics={diagnostics}
                    tracks={tracks}
                    activeTab={bottomTab}
                    onTabChange={(tab) => dispatch({type: "set-bottom-dock-tab", tab})}
                    sceneStats={sceneStats}
                    freshness={runSession.freshness}
                />
            </footer>
        </div>
    );
}

function getSceneStats(entities: readonly SceneEntity[]) {
    return {
        geometry: entities.filter((entity) => entity.kind === "geometry").length,
        materials: entities.filter((entity) => entity.kind === "material").length,
        sources: entities.filter((entity) => entity.kind === "source").length,
        tallies: entities.filter((entity) => entity.kind === "tally").length
    };
}
