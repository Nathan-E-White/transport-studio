import type { Diagnostic, RunConfiguration, TrackSample } from "@transport/domain";
import type {ReactNode} from "react";
import type {
  RunRenderingBlock,
  RunResultView,
  RunSessionFreshness,
} from "../app/runSession";
import {
  BottomDockTabs,
  bottomDockPanelId,
  bottomDockTabId,
} from "../components/BottomDock/BottomDockTabs";
import {useEditorStore, type EditorBottomDockTab} from "../state/editor";

interface RunPanelProps {
  readonly config: RunConfiguration;
  readonly diagnostics: readonly Diagnostic[];
  readonly tracks: readonly TrackSample[];
  readonly sceneStats: { geometry: number; materials: number; sources: number; tallies: number };
  readonly freshness: RunSessionFreshness;
  readonly renderingBlock: RunRenderingBlock | null;
  readonly resultView: RunResultView;
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
  onResultViewChange,
}: RunPanelProps) {
  const {state} = useEditorStore();
  const activeTab = state.shell.bottomDockTab;
  const escaped = tracks.filter((track) => track.events.at(-1)?.type === "escape").length;
  const absorbed = tracks.filter((track) => track.events.at(-1)?.type === "absorb").length;

  return (
    <section className="run-dock">
      <BottomDockTabs/>
      <DockPanel tab="run" activeTab={activeTab}>
        <div className="run-metrics">
            <Metric label="backend" value={config.backend} />
            <Metric label="histories" value={config.histories.toLocaleString()} />
            <Metric label="batch" value={config.batchSize.toLocaleString()} />
            <Metric label="visible" value={tracks.length} />
            <Metric label="escaped" value={escaped} />
            <Metric label="absorbed" value={absorbed} />
            <Metric label="diagnostics" value={diagnostics.length} />
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
        <div className="dock-copy">Showing {tracks.length} sampled histories. Final event mix: {escaped} escaped, {absorbed} absorbed.</div>
      </DockPanel>
      <DockPanel tab="diagnostics" activeTab={activeTab}>
        <div className="diagnostic-list-horizontal">
            {diagnostics.length === 0 ? <span className="muted">No diagnostics.</span> : diagnostics.map((diagnostic, index) => <span key={index} className={`diagnostic-pill ${diagnostic.severity}`}>{diagnostic.message}</span>)}
        </div>
      </DockPanel>
      <DockPanel tab="console" activeTab={activeTab}>
        <div className="console-line">{getConsoleStatus(config.backend, tracks.length, config.histories, diagnostics)}</div>
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

function getConsoleStatus(
  backend: RunConfiguration["backend"],
  trackCount: number,
  histories: number,
  diagnostics: readonly Diagnostic[],
): string {
  if (backend === "native") {
    const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning");

    return [
      `tauri://run_photon_smoke complete`,
      `${trackCount} tracks`,
      `${histories.toLocaleString()} requested histories`,
      warnings.length > 0 ? `${warnings.length} warnings` : "no warnings",
    ].join(" · ");
  }

  return "transport-worker:// idle · visual-ts backend armed · project graph clean";
}
