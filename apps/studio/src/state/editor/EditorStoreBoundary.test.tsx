import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import {createEditorFailureJournal} from "../../app/editorFailureJournal";
import {EditorStoreBoundary} from "./EditorStoreBoundary";

describe("EditorStoreBoundary", () => {
  it("recovers the editor subtree without discarding its captured failure", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const journal = createEditorFailureJournal({now: () => "2026-07-20T12:00:00.000Z"});
    let shouldThrow = true;
    function EditorChild() {
      if (shouldThrow) throw new Error("Editor provider failed");
      return <p>Editor recovered</p>;
    }

    render(<EditorStoreBoundary failureJournal={journal}><EditorChild/></EditorStoreBoundary>);

    expect(screen.getByRole("alert")).toHaveTextContent("Editor state crashed");
    expect(screen.getByRole("region", {name: "Editor failure diagnostic"})).toHaveTextContent(
      "editor.ui.render-failure",
    );
    expect(screen.getByRole("region", {name: "Editor failure Console event"})).toHaveTextContent(
      "editor-state · retryable · Editor provider failed",
    );
    expect(journal.getSnapshot().diagnostics).toHaveLength(1);

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", {name: "Retry editor"}));

    expect(screen.getByText("Editor recovered")).toBeTruthy();
    expect(journal.getSnapshot().diagnostics).toHaveLength(1);
    consoleError.mockRestore();
  });
});
