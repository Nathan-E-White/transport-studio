import {render, screen, within} from "@testing-library/react";
import {describe, expect, it} from "vitest";
import {compileTransportProblem} from "@transport/domain/compile/CompileTransportProblem";
import {createInitialProject} from "../app/createInitialProject";
import {toyBackendMetadata} from "../app/runExecutionAdapters";
import type {RunSessionState} from "../app/runSession";
import {RunSessionDetails} from "./RunSessionDetails";

const project = createInitialProject();
const compileResult = compileTransportProblem(project);
if (!compileResult.ok || !compileResult.value) throw new Error("Run Session presentation fixture must compile.");
const problem = compileResult.value;

const preparedSession: RunSessionState = {
  id: "session-1",
  status: "prepared",
  phase: "awaiting-acceptance",
  adapterMetadata: toyBackendMetadata,
  progress: null,
  diagnostics: [],
  tracks: [],
  tallies: [],
  provenance: null,
  summary: null,
  terminalFailure: null,
  input: {
    recordVersion: "1.0.0",
    problem,
    exactInputFingerprint: "input-sha-256",
    sourceSceneRevision: 3,
    sourceSceneFingerprint: "scene-sha-256",
    submittedScene: {project},
    heavyAssets: [],
  },
  journal: {status: "capturing", finalSequence: 1},
};

const provenance = {
  backendId: toyBackendMetadata.id,
  backendVersion: toyBackendMetadata.version,
  problemId: problem.id,
  seed: 1337,
  dataPolicy: "toy" as const,
  warnings: [],
};

describe("RunSessionDetails", () => {
  it("presents an idle Run Session", () => {
    render(<RunSessionDetails session={null}/>);

    expect(screen.getByRole("status")).toHaveTextContent("No run has been prepared");
    expect(screen.getByText("idle")).toBeInTheDocument();
  });

  it("presents preparation state and preparation provenance", () => {
    render(<RunSessionDetails session={preparedSession}/>);

    expect(screen.getByText("prepared")).toBeInTheDocument();
    expect(screen.getByText("awaiting acceptance")).toBeInTheDocument();
    expect(screen.getByText("Not started")).toBeInTheDocument();
    expect(screen.getByText("phase").tagName).toBe("DT");
    expect(screen.getByText("awaiting acceptance").tagName).toBe("DD");
    const preparation = screen.getByRole("region", {name: "Preparation provenance"});
    expect(within(preparation).getByText("Visual TypeScript Toy Transport")).toBeInTheDocument();
    expect(within(preparation).getByText("input-sha-256")).toBeInTheDocument();
    expect(within(preparation).getByText("scene revision 3")).toBeInTheDocument();
  });

  it("presents running progress and backend provenance", () => {
    render(<RunSessionDetails session={{
      ...preparedSession,
      status: "running",
      phase: "progress",
      progress: {completedHistories: 32, totalHistories: 64},
      provenance,
    }}/>);

    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByText("32 / 64 (50%)")).toBeInTheDocument();
    const execution = screen.getByRole("region", {name: "Backend provenance"});
    expect(within(execution).getByText(toyBackendMetadata.id)).toBeInTheDocument();
    expect(within(execution).getByText("seed 1,337")).toBeInTheDocument();
    expect(within(execution).getByText("toy data policy")).toBeInTheDocument();
  });

  it("uses the terminal summary instead of stale progress for a completed run", () => {
    render(<RunSessionDetails session={{
      ...preparedSession,
      status: "completed",
      phase: "terminal",
      progress: {completedHistories: 32, totalHistories: 64},
      provenance,
      summary: {
        completedHistories: 64,
        totalHistories: 64,
        elapsedMilliseconds: 1250,
        sampledTrackCount: 12,
        tallyCount: 2,
        diagnostics: [],
      },
      journal: {status: "complete", finalSequence: 8},
    }}/>);

    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText("64 / 64 (100%)")).toBeInTheDocument();
    expect(screen.getByRole("status", {name: "Run outcome"})).toHaveTextContent("Completed 64 of 64 histories");
    expect(screen.queryByText("32 / 64 (50%)")).not.toBeInTheDocument();
  });

  it("presents a terminal failure as an actionable diagnostic", () => {
    render(<RunSessionDetails session={{
      ...preparedSession,
      status: "failed",
      phase: "terminal",
      progress: {completedHistories: 12, totalHistories: 64},
      provenance,
      terminalFailure: {
        level: "error",
        code: "backend.transport_failed",
        message: "Cross-section data pack could not be loaded.",
        runId: "session-1",
      },
    }}/>);

    const failure = screen.getByRole("alert", {name: "Run failed"});
    expect(failure).toHaveTextContent("backend.transport_failed");
    expect(failure).toHaveTextContent("Cross-section data pack could not be loaded.");
    expect(screen.getByText("12 / 64 (19%)")).toBeInTheDocument();
  });

  it("presents an unhealthy journal with its diagnostic and final sequence", () => {
    render(<RunSessionDetails session={{
      ...preparedSession,
      status: "completed",
      phase: "terminal",
      progress: {completedHistories: 64, totalHistories: 64},
      provenance,
      summary: {
        completedHistories: 64,
        totalHistories: 64,
        sampledTrackCount: 12,
        tallyCount: 0,
        diagnostics: [],
      },
      diagnostics: [{
        severity: "error",
        code: "run.journal.write_failed",
        message: "Journal close failed: permission denied.",
      }],
      journal: {status: "incomplete", finalSequence: 7},
    }}/>);

    const journal = screen.getByRole("alert", {name: "Run journal incomplete"});
    expect(journal).toHaveTextContent("final sequence 7");
    expect(journal).toHaveTextContent("run.journal.write_failed");
    expect(journal).toHaveTextContent("Journal close failed: permission denied.");
  });
});
