import { useMemo, useState } from "react";
import type { Diagnostic, Project, SceneEntity, TrackSample } from "@transport/domain";
import { runToyPhotonTransport } from "@transport/transport-visual";
import { validateProject } from "@transport/validation";
import { createInitialProject } from "./createInitialProject";
import { ProjectTree } from "../panels/ProjectTree";
import { InspectorPanel } from "../panels/InspectorPanel";
import { RunPanel } from "../panels/RunPanel";
import { TransportViewport } from "../viewport/TransportViewport";

export type EditorMode = "design" | "probe" | "run" | "analyze" | "debug";
export type BottomTab = "run" | "tallies" | "tracks" | "diagnostics" | "console";

const modes: readonly EditorMode[] = ["design", "probe", "run", "analyze", "debug"];

export function StudioApp() {
    const [project] = useState<Project>(() => createInitialProject());
    const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>(project.scene.entities[1]?.id);
    const [tracks, setTracks] = useState<readonly TrackSample[]>([]);
    const [mode, setMode] = useState<EditorMode>("design");
    const [bottomTab, setBottomTab] = useState<BottomTab>("run");
    const [showTracks, setShowTracks] = useState(true);
    const [showTallies, setShowTallies] = useState(true);
    const [showDiagnostics, setShowDiagnostics] = useState(true);

    const diagnostics = useMemo<readonly Diagnostic[]>(() => validateProject(project), [project]);
    const selectedEntity = project.scene.entities.find((entity) => entity.id === selectedEntityId);
    const sceneStats = useMemo(() => getSceneStats(project.scene.entities), [project]);
    const escapedCount = tracks.filter((track) => track.events.at(-1)?.type === "escape").length;
    const absorbedCount = tracks.filter((track) => track.events.at(-1)?.type === "absorb").length;

    function runDemo() {
        const result = runToyPhotonTransport(project, project.runConfiguration);
        setTracks(result.tracks);
        setMode("run");
        setBottomTab("run");
    }

    function clearResults() {
        setTracks([]);
        setBottomTab("run");
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
                    <button className="primary-button" onClick={runDemo}>▶ Run Toy Photons</button>
                    <button onClick={clearResults}>Clear</button>
                </div>
            </header>

            <aside className="left-panel">
                <ProjectTree project={project} selectedEntityId={selectedEntityId} onSelect={setSelectedEntityId} stats={sceneStats} />
            </aside>

            <main className="viewport-region">
                <TransportViewport
                    project={project}
                    tracks={showTracks ? tracks : []}
                    selectedEntityId={selectedEntityId}
                    onSelect={setSelectedEntityId}
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
                    <label><input type="checkbox" checked={showTracks} onChange={(event) => setShowTracks(event.target.checked)} /> Tracks</label>
                    <label><input type="checkbox" checked={showTallies} onChange={(event) => setShowTallies(event.target.checked)} /> Tallies</label>
                    <label><input type="checkbox" checked={showDiagnostics} onChange={(event) => setShowDiagnostics(event.target.checked)} /> Diagnostics</label>
                </div>
            </main>

            <aside className="right-panel">
                <InspectorPanel entity={selectedEntity} diagnostics={diagnostics} tracks={tracks} project={project} />
            </aside>

            <footer className="bottom-panel">
                <RunPanel
                    config={project.runConfiguration}
                    diagnostics={diagnostics}
                    tracks={tracks}
                    activeTab={bottomTab}
                    onTabChange={setBottomTab}
                    sceneStats={sceneStats}
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
