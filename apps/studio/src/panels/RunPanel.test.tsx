import {fireEvent, render, screen, within} from "@testing-library/react";
import {describe, expect, it} from "vitest";
import {compileTransportProblem} from "@transport/domain/compile/CompileTransportProblem";
import {createInitialProject} from "../app/createInitialProject";
import {toyBackendMetadata} from "../app/runExecutionAdapters";
import type {RunSessionState} from "../app/runSession";
import {EditorStoreProvider, useEditorStore} from "../state/editor";
import {RunPanel} from "./RunPanel";

function RunPanelHarness() {
  const {state} = useEditorStore();
  const project = state.scene.project!;

  return (
    <RunPanel
      config={project.runConfiguration}
      diagnostics={[]}
      tracks={[]}
      sceneStats={{geometry: 1, materials: 1, sources: 1, tallies: 1}}
      freshness="empty"
      renderingBlock={null}
      resultView="current"
      session={null}
      onResultViewChange={() => undefined}
    />
  );
}

describe("RunPanel tabs", () => {
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
    expect(screen.getByRole("tabpanel")).toHaveTextContent("1 tally entities are available");
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
    };
    const editedConfig = {...submittedProject.runConfiguration, histories: 2_000, batchSize: 200};

    render(
      <EditorStoreProvider initialProject={submittedProject}>
        <RunPanel
          config={editedConfig}
          diagnostics={[
            {severity: "error", message: "Current project error."},
            {severity: "warning", message: "Current project warning."},
          ]}
          tracks={[]}
          sceneStats={{geometry: 1, materials: 1, sources: 1, tallies: 1}}
          freshness="stale"
          renderingBlock={{submittedRevision: 0, currentRevision: 1, message: "Editable scene changed after this run."}}
          resultView="current"
          session={session}
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
    expect(screen.getByRole("tabpanel")).toHaveTextContent("1,000 requested histories");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("1 run diagnostics");
  });
});
