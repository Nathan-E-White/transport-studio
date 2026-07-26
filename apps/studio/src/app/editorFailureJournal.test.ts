import {describe, expect, it, vi} from "vitest";
import {createEditorFailureJournal} from "./editorFailureJournal";

describe("EditorFailureJournal", () => {
  it("projects a captured render failure into one diagnostic and one Console entry", () => {
    const journal = createEditorFailureJournal({
      capacity: 3,
      now: () => "2026-07-20T12:00:00.000Z",
    });

    journal.capture({
      surface: "project-tree",
      recoverability: "retryable",
      error: new TypeError("Entity row exploded"),
      componentStack: "\n    at EntityRow (/workspace/EntityRow.tsx:12:3)\n    at ProjectTree",
    });

    expect(journal.getSnapshot()).toMatchObject({
      capacity: 3,
      droppedCount: 0,
      diagnostics: [{
        severity: "error",
        code: "editor.ui.render-failure",
        message: "Project tree render failure (retryable): Entity row exploded",
      }],
      consoleEntries: [{
        classification: "editor.ui.render-failure",
        surface: "project-tree",
        recoverability: "retryable",
        observedAt: "2026-07-20T12:00:00.000Z",
        occurrences: 1,
        errorName: "TypeError",
        message: "Entity row exploded",
        componentPath: ["EntityRow", "ProjectTree"],
      }],
    });
  });

  it("redacts secrets and local paths while retaining safe context", () => {
    const journal = createEditorFailureJournal({now: () => "2026-07-20T12:00:00.000Z"});

    journal.capture({
      surface: "editor-state",
      recoverability: "retryable",
      error: new Error("Load failed: token=abc123 password=hunter2 at /Users/alice/private/project.ts"),
      componentStack: "\n    at SecretEditor (/Users/alice/private/SecretEditor.tsx:9:2)",
    });

    const entry = journal.getSnapshot().consoleEntries[0]!;
    expect(entry.message).toBe("Load failed: token=[REDACTED] password=[REDACTED] at [LOCAL_PATH]");
    expect(entry.componentPath).toEqual(["SecretEditor"]);
    expect(JSON.stringify(journal.getSnapshot())).not.toContain("abc123");
    expect(JSON.stringify(journal.getSnapshot())).not.toContain("hunter2");
    expect(JSON.stringify(journal.getSnapshot())).not.toContain("/Users/alice");
  });

  it("redacts secret-bearing error names, headers, and colon-delimited values", () => {
    const journal = createEditorFailureJournal();
    const error = new Error("Authorization: Bearer message-secret password: open-sesame");
    error.name = "token=name-secret";

    journal.capture({surface: "editor-state", recoverability: "retryable", error});

    const serialized = JSON.stringify(journal.getSnapshot());
    expect(serialized).not.toContain("name-secret");
    expect(serialized).not.toContain("message-secret");
    expect(serialized).not.toContain("open-sesame");
    expect(journal.getSnapshot().consoleEntries[0]).toMatchObject({
      errorName: "token=[REDACTED]",
      message: "Authorization: [REDACTED] password: [REDACTED]",
    });
  });

  it("aggregates repeated failures, bounds distinct entries, and isolates subscriber errors", () => {
    const journal = createEditorFailureJournal({capacity: 2, now: () => "2026-07-20T12:00:00.000Z"});
    const healthySubscriber = vi.fn();
    journal.subscribe(() => {
      throw new Error("subscriber render failed");
    });
    journal.subscribe(healthySubscriber);

    const capture = (message: string) => journal.capture({
      surface: "project-tree",
      recoverability: "retryable",
      error: new Error(message),
      componentStack: "\n    at ProjectTree",
    });

    expect(() => capture("same failure")).not.toThrow();
    capture("same failure");
    capture("second failure");
    capture("third failure");

    const snapshot = journal.getSnapshot();
    expect(snapshot.consoleEntries.map((entry) => [entry.message, entry.occurrences])).toEqual([
      ["second failure", 1],
      ["third failure", 1],
    ]);
    expect(snapshot.droppedCount).toBe(1);
    expect(healthySubscriber).toHaveBeenCalledTimes(4);
  });

});
