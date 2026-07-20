import {fireEvent, render, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import {compileTransportProblem} from "@transport/domain/compile/CompileTransportProblem";
import {createInitialProject} from "../app/createInitialProject";
import {toyBackendMetadata} from "../app/runExecutionAdapters";
import type {RunSessionState} from "../app/runSession";
import type {TransportTallyDelta} from "@transport/domain";
import {EditorStoreProvider, getPrimarySelection, useEditorStore} from "../state/editor";
import {ConsolePanel, RunPanel} from "./RunPanel";

function RunPanelHarness({tallies = []}: {readonly tallies?: readonly TransportTallyDelta[]}) {
  const {state, dispatch} = useEditorStore();
  const project = state.scene.project!;

  return (
    <RunPanel
      config={project.runConfiguration}
      project={project}
      diagnostics={[]}
      tracks={[]}
      tallies={tallies}
      selectedTallyId={getPrimarySelection(state.selection)?.kind === "tally" ? getPrimarySelection(state.selection)?.id : undefined}
      sceneStats={{geometry: 1, materials: 1, sources: 1, tallies: 1}}
      freshness="empty"
      renderingBlock={null}
      resultView="current"
      session={null}
      onTallySelect={(tallyId) => {
        const entity = project.scene.entities.find((candidate) => candidate.kind === "tally" && candidate.id === tallyId);
        if (entity?.kind === "tally") dispatch({type: "select-one", ref: {kind: entity.kind, id: entity.id}});
      }}
      onResultViewChange={() => undefined}
    />
  );
}

describe("RunPanel tabs", () => {
  it("shows a truthful disconnected Console instead of synthesized backend status", () => {
    render(
      <EditorStoreProvider initialProject={createInitialProject()}>
        <RunPanelHarness/>
      </EditorStoreProvider>,
    );

    fireEvent.click(screen.getByRole("tab", {name: "console"}));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Console disconnected: no Run Session is selected.");
    expect(screen.getByRole("tabpanel")).not.toHaveTextContent("transport-worker://");
    expect(screen.getByRole("tabpanel")).not.toHaveTextContent("tauri://");
  });

  it("keeps out-of-stream failures and empty journal failures visible", () => {
    const completedThenRejected = {
      id: "session-1", status: "failed", adapterMetadata: toyBackendMetadata,
      terminalFailure: {level: "error", code: "run.adapter.rejected", message: "run.adapter.rejected: stream broke", runId: "session-1"},
      journal: {status: "disabled", finalSequence: 1},
      console: {capacity: 200, droppedCount: 0, lastSequence: 1, entries: [{
        sequence: 1, observedAt: "2026-07-19T12:00:01.000Z", eventType: "runCompleted",
        severity: "info", backendId: toyBackendMetadata.id, backendVersion: toyBackendMetadata.version,
        message: "Run session-1 completed.", terminal: true,
      }]},
    } as unknown as RunSessionState;
    const view = render(<ConsolePanel session={completedThenRejected}/>);
    expect(screen.getByRole("alert")).toHaveTextContent("failed outside the protocol event stream");
    expect(screen.getByRole("alert")).toHaveTextContent("stream broke");
    expect(screen.getByRole("listitem")).toHaveTextContent("runCompleted");

    view.rerender(<ConsolePanel session={{
      ...completedThenRejected,
      terminalFailure: {level: "warning", code: "backend.stopped", message: "Backend stopped", runId: "session-1"},
      console: {...completedThenRejected.console, entries: [{
        ...completedThenRejected.console.entries[0]!, eventType: "runFailed", severity: "warning", message: "backend.stopped: Backend stopped",
        failureCode: "backend.stopped",
      }]},
    }}/>);
    expect(screen.queryByText(/failed outside the protocol event stream/)).not.toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("warning");

    view.rerender(<ConsolePanel session={{
      ...completedThenRejected,
      console: {...completedThenRejected.console, entries: [{
        ...completedThenRejected.console.entries[0]!, eventType: "runFailed", severity: "error",
        message: "backend.stopped: Backend stopped", failureCode: "backend.stopped",
      }]},
    }}/>);
    expect(screen.getByRole("alert")).toHaveTextContent("stream broke");

    view.rerender(<ConsolePanel session={{
      ...completedThenRejected,
      status: "prepared",
      terminalFailure: null,
      journal: {status: "incomplete", finalSequence: 0},
      console: {capacity: 200, droppedCount: 0, lastSequence: 0, entries: []},
    }}/>);
    expect(screen.getByRole("alert")).toHaveTextContent("Run journal capture is incomplete");
    expect(screen.getByText(/awaiting the first Run Session protocol event/)).toBeInTheDocument();
  });

  it("links tabs to the visible panel and supports directional keyboard activation", () => {
    render(
      <EditorStoreProvider initialProject={createInitialProject()}>
        <RunPanelHarness/>
      </EditorStoreProvider>,
    );

    const runTab = screen.getByRole("tab", {name: "run"});
    const panel = screen.getByRole("tabpanel");
    expect(screen.getByRole("tablist", {name: "Run details"})).toBeInTheDocument();
    expect(screen.getAllByRole("tabpanel", {hidden: true})).toHaveLength(5);
    for (const tab of screen.getAllByRole("tab")) {
      expect(document.getElementById(tab.getAttribute("aria-controls")!)).not.toBeNull();
    }
    expect(runTab).toHaveAttribute("aria-selected", "true");
    expect(runTab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", runTab.id);

    runTab.focus();
    fireEvent.keyDown(runTab, {key: "ArrowRight"});

    const talliesTab = screen.getByRole("tab", {name: "tallies"});
    expect(talliesTab).toHaveFocus();
    expect(talliesTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("No statistical tally results have arrived");
  });

  it("keeps completed metrics bound to the submitted session after editable settings change", () => {
    const submittedProject = createInitialProject();
    const compileResult = compileTransportProblem(submittedProject);
    if (!compileResult.ok || !compileResult.value) throw new Error("Run Panel fixture must compile.");
    const session: RunSessionState = {
      id: "session-1",
      status: "completed",
      phase: "terminal",
      adapterMetadata: toyBackendMetadata,
      progress: {completedHistories: 1_000, totalHistories: 1_000},
      diagnostics: [{severity: "warning", code: "run.submitted.warning", message: "Submitted run warning."}],
      tracks: [{historyId: "history-1", events: [{
        historyId: "history-1",
        particleId: "particle-1",
        type: "escape",
        position: {x: 0, y: 0, z: 0},
        direction: {x: 1, y: 0, z: 0},
        energy: 1,
        weight: 1,
        time: 1,
      }]}],
      tallies: [],
      provenance: {
        backendId: toyBackendMetadata.id,
        backendVersion: toyBackendMetadata.version,
        problemId: compileResult.value.id,
        seed: 1_337,
        dataPolicy: "toy",
        warnings: [],
      },
      summary: {
        completedHistories: 1_000,
        totalHistories: 1_000,
        sampledTrackCount: 1,
        tallyCount: 0,
        diagnostics: [],
      },
      terminalFailure: null,
      input: {
        recordVersion: "1.0.0",
        problem: compileResult.value,
        exactInputFingerprint: "input-sha-256",
        sourceSceneRevision: 0,
        sourceSceneFingerprint: "scene-sha-256",
        submittedScene: {project: submittedProject},
        heavyAssets: [],
      },
      journal: {status: "complete", finalSequence: 8},
      console: {
        capacity: 200,
        droppedCount: 3,
        lastSequence: 5,
        entries: [
          {sequence: 4, observedAt: "2026-07-19T12:00:04.000Z", eventType: "diagnostic", severity: "warning",
            backendId: toyBackendMetadata.id, backendVersion: toyBackendMetadata.version,
            message: "run.submitted.warning: Submitted run warning.", terminal: false},
          {sequence: 5, observedAt: "2026-07-19T12:00:05.000Z", eventType: "runCompleted", severity: "info",
            backendId: toyBackendMetadata.id, backendVersion: toyBackendMetadata.version,
            message: "Run session-1 completed 1,000/1,000 histories.", terminal: true},
        ],
      },
    };
    const editedConfig = {...submittedProject.runConfiguration, histories: 2_000, batchSize: 200};

    render(
      <EditorStoreProvider initialProject={submittedProject}>
        <RunPanel
          config={editedConfig}
          project={submittedProject}
          diagnostics={[
            {severity: "error", message: "Current project error."},
            {severity: "warning", message: "Current project warning."},
          ]}
          tracks={[]}
          tallies={[]}
          sceneStats={{geometry: 1, materials: 1, sources: 1, tallies: 1}}
          freshness="stale"
          renderingBlock={{submittedRevision: 0, currentRevision: 1, message: "Editable scene changed after this run."}}
          resultView="current"
          session={session}
          onTallySelect={() => undefined}
          onResultViewChange={() => undefined}
        />
      </EditorStoreProvider>,
    );

    const metrics = within(document.querySelector(".run-metrics")!);
    expect(metrics.getByText("histories").closest(".metric")).toHaveTextContent("1,000");
    expect(metrics.getByText("batch").closest(".metric")).toHaveTextContent("100");
    expect(metrics.getByText("diagnostics").closest(".metric")).toHaveTextContent("1");
    expect(metrics.getByText("sampled").closest(".metric")).toHaveTextContent("1");
    expect(metrics.getByText("escaped").closest(".metric")).toHaveTextContent("1");
    expect(screen.getByRole("status", {name: "Run outcome"})).toHaveTextContent("1 sampled tracks");
    expect(screen.queryByText("2,000")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", {name: "tracks"}));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Showing 0 sampled histories. Final event mix: 0 escaped, 0 absorbed.");
    fireEvent.click(screen.getByRole("tab", {name: "console"}));
    const consoleEntries = within(screen.getByRole("list", {name: "Run Session console events"}));
    expect(consoleEntries.getAllByRole("listitem")).toHaveLength(2);
    expect(consoleEntries.getAllByRole("listitem")[0]).toHaveTextContent("#4");
    expect(consoleEntries.getAllByRole("listitem")[0]).toHaveTextContent("diagnostic");
    expect(consoleEntries.getAllByRole("listitem")[0]).toHaveTextContent("warning");
    expect(consoleEntries.getAllByRole("listitem")[1]).toHaveTextContent("#5");
    expect(consoleEntries.getAllByRole("listitem")[1]).toHaveTextContent("terminal");
    expect(screen.getByRole("tabpanel")).toHaveTextContent(`${toyBackendMetadata.id} ${toyBackendMetadata.version}`);
    expect(screen.getByRole("tabpanel")).toHaveTextContent("3 older events were dropped by the 200-entry retention limit");
  });

  it("lists live tally results and selects their modeled tally without conflating tracks", () => {
    const project = createInitialProject();
    const tally = project.scene.entities.find((entity) => entity.kind === "tally")!;
    const compatibleProject = {
      ...project,
      scene: {...project.scene, entities: project.scene.entities.map((entity) => entity.id === tally.id ? {...tally, bins: [2, 1, 1] as const} : entity)},
    };
    render(
      <EditorStoreProvider initialProject={compatibleProject}>
        <RunPanelHarness tallies={[{tallyId: tally.id, scores: [-2, 4]}]}/>
      </EditorStoreProvider>,
    );

    fireEvent.click(screen.getByRole("tab", {name: "tallies"}));
    const selector = screen.getByLabelText("Statistical tally result");
    expect(within(selector).getByRole("option", {name: `${tally.name} · 2 values`})).toBeInTheDocument();
    fireEvent.change(selector, {target: {value: tally.id}});

    expect(selector).toHaveValue(tally.id);
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Statistical tally results are separate from sampled tracks");
    const values = screen.getByRole("table", {name: "Selected tally bin values"});
    expect(values).toHaveTextContent("− negative");
    expect(values).toHaveTextContent("-2");
    expect(values).toHaveTextContent("+ positive");
    expect(values).toHaveTextContent("4");
  });

  it("matches stale results to the submitted presentation project instead of the editable scene", () => {
    const submittedProject = createInitialProject();
    const tally = submittedProject.scene.entities.find((entity) => entity.kind === "tally")!;
    const currentProject = {
      ...submittedProject,
      scene: {...submittedProject.scene, entities: submittedProject.scene.entities.filter((entity) => entity.id !== tally.id)},
    };
    const onTallySelect = vi.fn();
    render(
      <EditorStoreProvider initialProject={currentProject}>
        <RunPanel config={submittedProject.runConfiguration} project={submittedProject} diagnostics={[]} tracks={[]}
          tallies={[{tallyId: tally.id, scores: [3]}]} selectedTallyId={tally.id}
          sceneStats={{geometry: 1, materials: 1, sources: 1, tallies: 1}} freshness="stale"
          renderingBlock={{submittedRevision: 0, currentRevision: 1, message: "Stale."}} resultView="submitted"
          session={null} onTallySelect={onTallySelect} onResultViewChange={() => undefined}/>
      </EditorStoreProvider>,
    );

    fireEvent.click(screen.getByRole("tab", {name: "tallies"}));
    const selector = screen.getByLabelText("Statistical tally result");
    expect(selector).toHaveValue(tally.id);
    expect(within(selector).getByRole("option", {name: `${tally.name} · 1 values`})).toBeInTheDocument();
    expect(screen.queryByText(/tally.result.entity.missing/)).not.toBeInTheDocument();
    fireEvent.change(selector, {target: {value: tally.id}});
    expect(onTallySelect).toHaveBeenCalledWith(tally.id);
  });

  it("shows the actual malformed-stream diagnostic instead of claiming no result arrived", () => {
    const project = createInitialProject();
    const tally = project.scene.entities.find((entity) => entity.kind === "tally")!;
    render(
      <EditorStoreProvider initialProject={project}>
        <RunPanel config={project.runConfiguration} project={project} tracks={[]} tallies={[]}
          diagnostics={[{severity: "error", code: "run.tally.delta_shape_mismatch", message: "run.tally.delta_shape_mismatch: Score shape changed.", entityId: tally.id}]}
          selectedTallyId={tally.id} sceneStats={{geometry: 1, materials: 1, sources: 1, tallies: 1}}
          freshness="fresh" renderingBlock={null} resultView="current" session={null}
          onTallySelect={() => undefined} onResultViewChange={() => undefined}/>
      </EditorStoreProvider>,
    );

    fireEvent.click(screen.getByRole("tab", {name: "tallies"}));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("run.tally.delta_shape_mismatch: Score shape changed.");
    expect(screen.getByRole("tabpanel")).not.toHaveTextContent("No statistical tally results have arrived.");
  });

  it("diagnoses invalid selected result values and shapes instead of fabricating table coordinates", () => {
    const project = createInitialProject();
    const tally = project.scene.entities.find((entity) => entity.kind === "tally")!;
    const shapedTally = {...tally, bins: [2, 1, 1] as const};
    const shapedProject = {
      ...project,
      scene: {...project.scene, entities: project.scene.entities.map((entity) => entity.id === tally.id ? shapedTally : entity)},
    };
    const {rerender} = render(
      <EditorStoreProvider initialProject={shapedProject}>
        <RunPanel config={shapedProject.runConfiguration} project={shapedProject} tracks={[]}
          tallies={[{tallyId: tally.id, scores: [1, 2, 3]}]} diagnostics={[]} selectedTallyId={tally.id}
          sceneStats={{geometry: 1, materials: 1, sources: 1, tallies: 1}} freshness="fresh"
          renderingBlock={null} resultView="current" session={null} onTallySelect={() => undefined}
          onResultViewChange={() => undefined}/>
      </EditorStoreProvider>,
    );
    fireEvent.click(screen.getByRole("tab", {name: "tallies"}));

    expect(screen.getByRole("tabpanel")).toHaveTextContent("modeled shape requires 2");
    expect(screen.queryByRole("table", {name: "Selected tally bin values"})).not.toBeInTheDocument();

    rerender(
      <EditorStoreProvider initialProject={shapedProject}>
        <RunPanel config={shapedProject.runConfiguration} project={shapedProject} tracks={[]}
          tallies={[{tallyId: tally.id, scores: [1, Number.NaN]}]} diagnostics={[]} selectedTallyId={tally.id}
          sceneStats={{geometry: 1, materials: 1, sources: 1, tallies: 1}} freshness="fresh"
          renderingBlock={null} resultView="current" session={null} onTallySelect={() => undefined}
          onResultViewChange={() => undefined}/>
      </EditorStoreProvider>,
    );

    expect(screen.getByRole("tabpanel")).toHaveTextContent("contains non-finite values");
    expect(screen.queryByRole("table", {name: "Selected tally bin values"})).not.toBeInTheDocument();
  });
});
