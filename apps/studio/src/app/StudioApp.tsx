import { useMemo, useState } from "react";
import type { Diagnostic, Project, TrackSample } from "@transport/domain";
import { runToyPhotonTransport } from "@transport/transport-visual";
import { validateProject } from "@transport/validation";
import { createInitialProject } from "./createInitialProject";
import { ProjectTree } from "../panels/ProjectTree";
import { InspectorPanel } from "../panels/InspectorPanel";
import { RunPanel } from "../panels/RunPanel";
import { TransportViewport } from "../viewport/TransportViewport";

export function StudioApp() {
  const [project] = useState<Project>(() => createInitialProject());
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>();
  const [tracks, setTracks] = useState<readonly TrackSample[]>([]);
  const diagnostics = useMemo<readonly Diagnostic[]>(() => validateProject(project), [project]);

  const selectedEntity = project.scene.entities.find((entity) => entity.id === selectedEntityId);

  function runDemo() {
    const result = runToyPhotonTransport(project, project.runConfiguration);
    setTracks(result.tracks);
  }

  function clearResults() {
    setTracks([]);
  }

  return (
    <div className="studio-shell">
      <header className="toolbar">
        <div className="brand">Transport Studio</div>
        <button onClick={runDemo}>Run Toy Photons</button>
        <button onClick={clearResults}>Clear Tracks</button>
        <span className="status-pill">{tracks.length} visible histories</span>
      </header>

      <aside className="left-panel">
        <ProjectTree project={project} selectedEntityId={selectedEntityId} onSelect={setSelectedEntityId} />
      </aside>

      <main className="viewport-region">
        <TransportViewport project={project} tracks={tracks} selectedEntityId={selectedEntityId} onSelect={setSelectedEntityId} />
      </main>

      <aside className="right-panel">
        <InspectorPanel entity={selectedEntity} diagnostics={diagnostics} />
      </aside>

      <footer className="bottom-panel">
        <RunPanel config={project.runConfiguration} diagnostics={diagnostics} tracks={tracks} />
      </footer>
    </div>
  );
}
