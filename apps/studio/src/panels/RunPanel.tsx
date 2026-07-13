import type { Diagnostic, RunConfiguration, TrackSample } from "@transport/domain";
import type { BottomTab } from "../app/StudioApp";
import type {RunSessionFreshness} from "../app/runSession";

interface RunPanelProps {
  readonly config: RunConfiguration;
  readonly diagnostics: readonly Diagnostic[];
  readonly tracks: readonly TrackSample[];
  readonly activeTab: BottomTab;
  readonly onTabChange: (tab: BottomTab) => void;
  readonly sceneStats: { geometry: number; materials: number; sources: number; tallies: number };
  readonly freshness: RunSessionFreshness;
}

const tabs: readonly BottomTab[] = ["run", "tallies", "tracks", "diagnostics", "console"];

export function RunPanel({ config, diagnostics, tracks, activeTab, onTabChange, sceneStats, freshness }: RunPanelProps) {
  const escaped = tracks.filter((track) => track.events.at(-1)?.type === "escape").length;
  const absorbed = tracks.filter((track) => track.events.at(-1)?.type === "absorb").length;

  return (
    <section className="run-dock">
      <nav className="bottom-tabs">
        {tabs.map((tab) => <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => onTabChange(tab)}>{tab}</button>)}
      </nav>
      <div className="bottom-content">
        {activeTab === "run" && (
          <div className="run-metrics">
            <Metric label="backend" value={config.backend} />
            <Metric label="histories" value={config.histories.toLocaleString()} />
            <Metric label="batch" value={config.batchSize.toLocaleString()} />
            <Metric label="visible" value={tracks.length} />
            <Metric label="escaped" value={escaped} />
            <Metric label="absorbed" value={absorbed} />
            <Metric label="diagnostics" value={diagnostics.length} />
            <Metric label="results" value={freshness === "fresh" ? "current" : freshness} />
          </div>
        )}
        {activeTab === "tallies" && (
          <div className="dock-copy">{sceneStats.tallies} tally entities are available. MVP visualization uses detector glyphs and a placeholder heat overlay.</div>
        )}
        {activeTab === "tracks" && (
          <div className="dock-copy">Showing {tracks.length} sampled histories. Final event mix: {escaped} escaped, {absorbed} absorbed.</div>
        )}
        {activeTab === "diagnostics" && (
          <div className="diagnostic-list-horizontal">
            {diagnostics.length === 0 ? <span className="muted">No diagnostics.</span> : diagnostics.map((diagnostic, index) => <span key={index} className={`diagnostic-pill ${diagnostic.severity}`}>{diagnostic.message}</span>)}
          </div>
        )}
        {activeTab === "console" && (
          <div className="console-line">{getConsoleStatus(config.backend, tracks.length, config.histories, diagnostics)}</div>
        )}
      </div>
    </section>
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
