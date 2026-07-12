import {useMemo, useState} from "react";
import type {
    Diagnostic,
    Project,
    SceneEntity,
    TrackSample,
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
import {EditorStateRoot, getPrimarySelection, useEditorStore} from "../state/editor";
import {
    clearRunSession,
    runNativeSession,
    runToySession,
    type RunSessionOutcome,
} from "./runSession";

export type EditorMode = "design" | "probe" | "run" | "analyze" | "debug";
export type BottomTab = "run" | "tallies" | "tracks" | "diagnostics" | "console";

const modes: readonly EditorMode[] = ["design", "probe", "run", "analyze", "debug"];

export function StudioApp() {
    return <EditorStateRoot initialProject={createInitialProject()}><StudioWorkbench/></EditorStateRoot>;
}

function StudioWorkbench() {

    const {state, dispatch} = useEditorStore();
    const project = state.scene.project!;
    const selectedEntityId = getPrimarySelection(state.selection)?.id;
    const [tracks, setTracks] = useState<readonly TrackSample[]>([]);
    const [mode, setMode] = useState<EditorMode>("design");
    const [bottomTab, setBottomTab] = useState<BottomTab>("run");
    const [showTracks, setShowTracks] = useState(true);
    const [showTallies, setShowTallies] = useState(true);
    const [showDiagnostics, setShowDiagnostics] = useState(true);
    const [activeBackend, setActiveBackend] = useState<Project["runConfiguration"]["backend"]>(project.runConfiguration.backend);
    const [nativeDiagnostics, setNativeDiagnostics] = useState<readonly Diagnostic[]>([]);

    const diagnostics = useMemo<readonly Diagnostic[]>(() => [
        ...validateProject(project),
        ...nativeDiagnostics,
    ], [project, nativeDiagnostics]);
    const runConfiguration = useMemo(() => ({
        ...project.runConfiguration,
        backend: activeBackend,
    }), [activeBackend, project.runConfiguration]);
    const selectedEntity = project.scene.entities.find((entity) => entity.id === selectedEntityId);
    const sceneStats = useMemo(() => getSceneStats(project.scene.entities), [project]);
    const escapedCount = tracks.filter((track) => track.events.at(-1)?.type === "escape").length;
    const absorbedCount = tracks.filter((track) => track.events.at(-1)?.type === "absorb").length;

    function runDemo() {
        applyRunSessionOutcome(runToySession(project));
    }

    async function runNative() {
        const compileResult = compileTransportProblem(project);
        applyRunSessionOutcome(await runNativeSession(compileResult, createTauriNativePhotonSmokeBridge()));
    }

    function clearResults() {
        applyRunSessionOutcome(clearRunSession({backend: activeBackend, mode}));
    }

    function applyRunSessionOutcome(outcome: RunSessionOutcome) {
        setTracks(outcome.tracks);
        setNativeDiagnostics(outcome.diagnostics);
        setActiveBackend(outcome.backend);
        setMode(outcome.mode);
        setBottomTab(outcome.bottomTab);
        dispatch({type: "mark-run-results-fresh"});
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
                            onClick={() => setMode(candidateMode)}
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
                    onTabChange={setBottomTab}
                    sceneStats={sceneStats}
                    stale={state.stale}
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
