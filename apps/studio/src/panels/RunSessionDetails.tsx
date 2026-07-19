import type {RunSessionProgress, RunSessionState} from "../app/runSession";

interface RunSessionDetailsProps {
  readonly session: RunSessionState | null;
}

export function RunSessionDetails({session}: RunSessionDetailsProps) {
  if (!session) {
    return (
      <section className="run-session-details" aria-labelledby="run-session-title">
        <RunSessionHeader status="idle"/>
        <p role="status" className="dock-copy">No run has been prepared. Start a backend run to capture lifecycle detail.</p>
      </section>
    );
  }

  const progress = authoritativeProgress(session);
  const journalDiagnostics = session.diagnostics.filter((diagnostic) => diagnostic.code.startsWith("run.journal."));

  return (
    <section className="run-session-details" aria-labelledby="run-session-title">
      <RunSessionHeader status={session.status}/>

      <dl className="run-session-lifecycle">
        <Detail label="phase" value={humanize(session.phase)}/>
        <Detail label="progress" value={formatProgress(progress)}/>
        <Detail label="journal" value={`${session.journal.status} · sequence ${session.journal.finalSequence.toLocaleString()}`}/>
        <Detail label="session" value={session.id}/>
      </dl>

      <div className="run-session-provenance-grid">
        <section className="run-session-provenance" role="region" aria-label="Preparation provenance">
          <h4>Preparation</h4>
          <dl className="run-session-provenance-details">
            <Detail label="adapter" value={session.adapterMetadata.name}/>
            <Detail label="adapter version" value={session.adapterMetadata.version}/>
            <Detail label="input fingerprint" value={session.input.exactInputFingerprint}/>
            <Detail label="source" value={`scene revision ${session.input.sourceSceneRevision}`}/>
          </dl>
        </section>

        <section className="run-session-provenance" role="region" aria-label="Backend provenance">
          <h4>Execution backend</h4>
          {session.provenance ? (
            <>
              <dl className="run-session-provenance-details">
                <Detail label="backend" value={session.provenance.backendId}/>
                <Detail label="backend version" value={session.provenance.backendVersion}/>
                <Detail label="problem" value={session.provenance.problemId}/>
                <Detail label="seed" value={`seed ${session.provenance.seed.toLocaleString()}`}/>
                <Detail label="data" value={`${session.provenance.dataPolicy} data policy`}/>
              </dl>
              {session.provenance.warnings.map((warning) => <p className="run-session-warning" key={warning}>{warning}</p>)}
            </>
          ) : (
            <p className="muted">Awaiting backend start.</p>
          )}
        </section>
      </div>

      {session.status === "completed" && session.summary && (
        <div className="run-session-outcome success" role="status" aria-label="Run outcome">
          <strong>Completed {session.summary.completedHistories.toLocaleString()} of {session.summary.totalHistories.toLocaleString()} histories.</strong>
          <span>{session.summary.sampledTrackCount.toLocaleString()} sampled tracks · {session.summary.tallyCount.toLocaleString()} tallies{formatElapsed(session.summary.elapsedMilliseconds)}</span>
        </div>
      )}

      {session.status === "failed" && (
        <div className="run-session-outcome failure" role="alert" aria-label="Run failed">
          <strong>{session.terminalFailure?.code ?? "run.session.failed"}</strong>
          <span>{session.terminalFailure?.message ?? "The backend ended without a usable terminal result."}</span>
          <span>Review the diagnostic, correct the backend or input condition, and start a new run.</span>
        </div>
      )}

      {session.journal.status === "incomplete" && (
        <div className="run-session-outcome failure" role="alert" aria-label="Run journal incomplete">
          <strong>Run journal incomplete at final sequence {session.journal.finalSequence.toLocaleString()}.</strong>
          {journalDiagnostics.length > 0
            ? journalDiagnostics.map((diagnostic) => <span key={`${diagnostic.code}:${diagnostic.message}`}><b>{diagnostic.code}</b>: {diagnostic.message}</span>)
            : <span>No journal diagnostic was recorded.</span>}
          <span>Check journal storage permissions and preserve the session diagnostics before retrying.</span>
        </div>
      )}
    </section>
  );
}

function RunSessionHeader({status}: {readonly status: RunSessionState["status"] | "idle"}) {
  return (
    <header className="run-session-header">
      <h3 id="run-session-title">Run session</h3>
      <span className={`run-session-status ${status}`}>{status}</span>
    </header>
  );
}

function Detail({label, value}: {readonly label: string; readonly value: string}) {
  return <div className="run-session-detail"><dt>{label}</dt><dd>{value}</dd></div>;
}

function authoritativeProgress(session: RunSessionState): RunSessionProgress | null {
  if (session.status === "completed" && session.summary) {
    return {
      completedHistories: session.summary.completedHistories,
      totalHistories: session.summary.totalHistories,
    };
  }
  return session.progress;
}

function formatProgress(progress: RunSessionProgress | null): string {
  if (!progress) return "Not started";
  const percent = progress.totalHistories > 0
    ? Math.round((progress.completedHistories / progress.totalHistories) * 100)
    : 0;
  return `${progress.completedHistories.toLocaleString()} / ${progress.totalHistories.toLocaleString()} (${percent}%)`;
}

function humanize(value: string): string {
  return value.replaceAll("-", " ");
}

function formatElapsed(elapsedMilliseconds: number | undefined): string {
  return elapsedMilliseconds === undefined ? "" : ` · ${(elapsedMilliseconds / 1000).toFixed(2)} s`;
}
