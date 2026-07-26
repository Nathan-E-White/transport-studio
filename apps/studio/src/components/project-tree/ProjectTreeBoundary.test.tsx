import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import {createEditorFailureJournal} from "../../app/editorFailureJournal";
import {ProjectTreeBoundary} from "./ProjectTreeBoundary";

describe("ProjectTreeBoundary", () => {
  it("recovers the project tree without discarding its captured failure", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const journal = createEditorFailureJournal({now: () => "2026-07-26T06:00:00.000Z"});
    let shouldThrow = true;
    function ProjectTreeChild() {
      if (shouldThrow) throw new Error("Project tree provider failed");
      return <p>Project tree recovered</p>;
    }

    render(<ProjectTreeBoundary failureJournal={journal}><ProjectTreeChild/></ProjectTreeBoundary>);

    expect(screen.getByRole("alert")).toHaveTextContent("Project tree unavailable.");
    expect(journal.getSnapshot().diagnostics).toHaveLength(1);

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", {name: "Retry project tree"}));

    expect(screen.getByText("Project tree recovered")).toBeTruthy();
    expect(journal.getSnapshot().diagnostics).toHaveLength(1);
    consoleError.mockRestore();
  });
});
