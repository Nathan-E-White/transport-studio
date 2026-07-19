import type { Diagnostic, Project, RunConfiguration, TrackSample, TransportTallyDelta } from "@transport/domain";
import {useState, type ReactNode} from "react";
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
import {createTallyResultPresentation} from "../viewport/tallyResultPresentation";

interface RunPanelProps {
  readonly config: RunConfiguration;
  readonly project: Project;
  readonly diagnostics: readonly Diagnostic[];
  readonly tracks: readonly TrackSample[];
  readonly tallies: readonly TransportTallyDelta[];
  readonly selectedTallyId?: string;
  readonly sceneStats: { geometry: number; materials: number; sources: number; tallies: number };
  readonly freshness: RunSessionFreshness;
  readonly renderingBlock: RunRenderingBlock | null;
  readonly resultView: RunResultView;
  readonly session: RunSessionState | null;
  readonly onTallySelect: (tallyId: string) => void;
  readonly onResultViewChange: (view: RunResultView) => void;
}

export function RunPanel({
  config,
  project,
  diagnostics,
  tracks,
  tallies,
  selectedTallyId,
  sceneStats,
  freshness,
  renderingBlock,
  resultView,
  session,
  onTallySelect,
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
  const resultTallies = tallies.flatMap((result) => {
    const entity = project.scene.entities.find((candidate) => candidate.kind === "tally" && candidate.id === result.tallyId);
    return entity?.kind === "tally" ? [{entity, result}] : [];
  });
  const unmatchedTallies = tallies.filter((result) => !resultTallies.some(({result: matched}) => matched === result));
  const tallyResultDiagnostics = runDiagnostics.filter((diagnostic) => diagnostic.code?.startsWith("run.tally."));
  const selectedResult = resultTallies.find(({entity}) => entity.id === selectedTallyId);
  const selectedPresentation = selectedResult
    ? createTallyResultPresentation(selectedResult.entity, [selectedResult.result], tallyResultDiagnostics)
    : undefined;

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
        <div className="tally-results-panel">
          <label>Statistical tally result<select aria-label="Statistical tally result" value={resultTallies.some(({entity}) => entity.id === selectedTallyId) ? selectedTallyId : ""}
            onChange={(event) => {
              const entity = resultTallies.find((candidate) => candidate.entity.id === event.currentTarget.value)?.entity;
              if (entity) onTallySelect(entity.id);
            }}>
            <option value="">Select a result</option>
            {resultTallies.map(({entity, result}) => <option key={entity.id} value={entity.id}>{entity.name} · {result.scores.length} values</option>)}
          </select></label>
          {tallies.length === 0 && tallyResultDiagnostics.length === 0 && <p className="muted">No statistical tally results have arrived.</p>}
          {tallyResultDiagnostics.map((diagnostic) => <p className={`diagnostic-card ${diagnostic.severity}`} key={`${diagnostic.code}:${diagnostic.entityId ?? "run"}`}>{diagnostic.message}</p>)}
          {unmatchedTallies.map((result) => <p className="diagnostic-card warning" key={result.tallyId}>tally.result.entity.missing: Result “{result.tallyId}” has no matching tally in this scene.</p>)}
          <p className="muted">{sceneStats.tallies} modeled tally entities. Statistical tally results are separate from sampled tracks.</p>
          {selectedPresentation?.status === "diagnostic" && (
            <p className={`diagnostic-card ${selectedPresentation.diagnostic.severity}`}>{selectedPresentation.diagnostic.message}</p>
          )}
          {selectedResult && selectedPresentation?.status === "ready" && (
            <TallyBinTable key={selectedResult.entity.id} entity={selectedResult.entity} result={selectedResult.result}/>
          )}
        </div>
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

const TALLY_TABLE_PAGE_SIZE = 32;

function TallyBinTable({entity, result}: {
  readonly entity: Extract<Project["scene"]["entities"][number], {readonly kind: "tally"}>;
  readonly result: TransportTallyDelta;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(result.scores.length / TALLY_TABLE_PAGE_SIZE));
  const start = page * TALLY_TABLE_PAGE_SIZE;
  const values = result.scores.slice(start, start + TALLY_TABLE_PAGE_SIZE);
  return <div className="tally-bin-inspector">
    <table aria-label="Selected tally bin values">
      <caption>{entity.name} bin values</caption>
      <thead><tr><th scope="col">Bin</th><th scope="col">Coordinate</th><th scope="col">Sign</th><th scope="col">Value</th></tr></thead>
      <tbody>{values.map((value, offset) => {
        const index = start + offset;
        const sign = value < 0 ? "negative" : value > 0 ? "positive" : "zero";
        return <tr key={index}><th scope="row">{index}</th><td>{formatBinCoordinate(index, entity.bins)}</td>
          <td>{value < 0 ? "−" : value > 0 ? "+" : "0"} {sign}</td><td>{value}</td></tr>;
      })}</tbody>
    </table>
    {pageCount > 1 && <div className="tally-bin-pages">
      <button type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous bins</button>
      <span>Page {page + 1} of {pageCount}</span>
      <button type="button" disabled={page === pageCount - 1} onClick={() => setPage((current) => current + 1)}>Next bins</button>
    </div>}
  </div>;
}

function formatBinCoordinate(index: number, bins: readonly [number, number, number] | undefined): string {
  if (!bins) return `index ${index}`;
  const [nx, ny] = bins;
  return `(${index % nx}, ${Math.floor(index / nx) % ny}, ${Math.floor(index / (nx * ny))})`;
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
