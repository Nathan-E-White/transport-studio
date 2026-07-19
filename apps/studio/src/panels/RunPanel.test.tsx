import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";
import {createInitialProject} from "../app/createInitialProject";
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
});
