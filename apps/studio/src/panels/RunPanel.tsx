import type { Diagnostic, RunConfiguration, TrackSample } from "@transport/domain";
import type {ReactNode} from "react";
import type {
  RunRenderingBlock,
  RunResultView,
  RunSessionFreshness,
  RunSessionState,
} from "../app/runSession";
import {
  BottomDockTabs,
  bottomDockPanelId,
  bottomDockTabId,
} from "../components/BottomDock/BottomDockTabs";
import {useEditorStore, type EditorBottomDockTab} from "../state/editor";
import {RunSessionDetails} from "./RunSessionDetails";

interface RunPanelProps {
  readonly config: RunConfiguration;
  readonly diagnostics: readonly Diagnostic[];
  readonly tracks: readonly TrackSample[];
  readonly sceneStats: { geometry: number; materials: number; sources: number; tallies: number };
  readonly freshness: RunSessionFreshness;
  readonly renderingBlock: RunRenderingBlock | null;
  readonly resultView: RunResultView;
  readonly session: RunSessionState | null;
  readonly onResultViewChange: (view: RunResultView) => void;
}

export function RunPanel({
  config,
  diagnostics,
  tracks,
  sceneStats,
  freshness,
  renderingBlock,
  resultView,
  session,
  onResultViewChange,
}: RunPanelProps) {
  const {state} = useEditorStore();
  const activeTab = state.shell.bottomDockTab;
  const sessionTracks = session?.tracks ?? tracks;
  const runDiagnostics = session?.diagnostics ?? diagnostics;
  const submittedConfig = session?.input.submittedScene.project.runConfiguration ?? config;
  const submittedHistories = session?.input.problem.settings.histories ?? config.histories;
  const capturedEscaped = sessionTracks.filter((track) => track.events.at(-1)?.type === "escape").length;
  const capturedAbsorbed = sessionTracks.filter((track) => track.events.at(-1)?.type === "absorb").length;
  const renderableEscaped = tracks.filter((track) => track.events.at(-1)?.type === "escape").length;
  const renderableAbsorbed = tracks.filter((track) => track.events.at(-1)?.type === "absorb").length;

  return (
    <section className="run-dock">
      <BottomDockTabs/>
      <DockPanel tab="run" activeTab={activeTab}>
        <RunSessionDetails session={session}/>
        <div className="run-metrics">
            <Metric label="backend" value={session?.adapterMetadata.id ?? config.backend} />
            <Metric label="histories" value={submittedHistories.toLocaleString()} />
            <Metric label="batch" value={submittedConfig.batchSize.toLocaleString()} />
            <Metric label={session ? "sampled" : "visible"} value={sessionTracks.length} />
            <Metric label="escaped" value={capturedEscaped} />
            <Metric label="absorbed" value={capturedAbsorbed} />
            <Metric label="diagnostics" value={runDiagnostics.length} />
            <Metric label="results" value={freshness === "fresh" ? "current" : freshness} />
            {renderingBlock && (
              <div className="dock-copy" role="status">
                {renderingBlock.message}
                {resultView === "current" ? (
                  <button type="button" onClick={() => onResultViewChange("submitted")}>View submitted scene</button>
                ) : (
                  <button type="button" onClick={() => onResultViewChange("current")}>Return to current scene</button>
                )}
              </div>
            )}
        </div>
      </DockPanel>
      <DockPanel tab="tallies" activeTab={activeTab}>
        <div className="dock-copy">{sceneStats.tallies} tally entities are available. MVP visualization uses detector glyphs and a placeholder heat overlay.</div>
      </DockPanel>
      <DockPanel tab="tracks" activeTab={activeTab}>
        <div className="dock-copy">Showing {tracks.length} sampled histories. Final event mix: {renderableEscaped} escaped, {renderableAbsorbed} absorbed.</div>
      </DockPanel>
      <DockPanel tab="diagnostics" activeTab={activeTab}>
        <div className="diagnostic-list-horizontal">
            {diagnostics.length === 0 ? <span className="muted">No diagnostics.</span> : diagnostics.map((diagnostic, index) => <span key={index} className={`diagnostic-pill ${diagnostic.severity}`}>{diagnostic.message}</span>)}
        </div>
      </DockPanel>
      <DockPanel tab="console" activeTab={activeTab}>
        <div className="console-line">{getConsoleStatus(session, config, diagnostics)}</div>
      </DockPanel>
    </section>
  );
}

function DockPanel({
  tab,
  activeTab,
  children,
}: {
  readonly tab: EditorBottomDockTab;
  readonly activeTab: EditorBottomDockTab;
  readonly children: ReactNode;
}) {
  const active = tab === activeTab;
  return (
    <div
      className="bottom-content"
      id={bottomDockPanelId(tab)}
      role="tabpanel"
      aria-labelledby={bottomDockTabId(tab)}
      hidden={!active}
      tabIndex={active ? 0 : -1}
    >
      {children}
    </div>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string | number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function getConsoleStatus(session: RunSessionState | null, config: RunConfiguration, diagnostics: readonly Diagnostic[]): string {
  if (session) {
    const histories = session.input.problem.settings.histories;
    const terminal = session.status === "failed"
      ? session.terminalFailure?.code ?? "run.session.failed"
      : `${session.status} · ${session.phase}`;

    return [
      `${session.adapterMetadata.id} ${terminal}`,
      `${session.tracks.length} tracks`,
      `${histories.toLocaleString()} requested histories`,
      `${session.diagnostics.length} run diagnostics`,
    ].join(" · ");
  }

  if (config.backend === "native") {
    const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
    return `tauri://run_photon_smoke idle · ${config.histories.toLocaleString()} configured histories · ${warnings.length} project warnings`;
  }
  return "transport-worker:// idle · visual-ts backend armed · project graph clean";
}
