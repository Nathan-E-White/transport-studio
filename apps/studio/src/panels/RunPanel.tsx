import type { Diagnostic, RunConfiguration, TrackSample } from "@transport/domain";

interface RunPanelProps {
  readonly config: RunConfiguration;
  readonly diagnostics: readonly Diagnostic[];
  readonly tracks: readonly TrackSample[];
}

export function RunPanel({ config, diagnostics, tracks }: RunPanelProps) {
  return (
    <section className="run-panel">
      <div>
        <strong>Backend:</strong> {config.backend}
      </div>
      <div>
        <strong>Histories:</strong> {config.histories.toLocaleString()}
      </div>
      <div>
        <strong>Visible track budget:</strong> {config.visibleHistoryBudget}
      </div>
      <div>
        <strong>Rendered tracks:</strong> {tracks.length}
      </div>
      <div className="diagnostic-strip">
        {diagnostics.length === 0 ? "No diagnostics" : diagnostics.map((d) => d.message).join(" | ")}
      </div>
    </section>
  );
}
