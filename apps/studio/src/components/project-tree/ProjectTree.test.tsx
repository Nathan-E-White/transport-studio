import {fireEvent, render, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import type {Project} from "@transport/domain";
import {IDENTITY_TRANSFORM} from "@transport/shared";
import {ProjectTree, ProjectTreeProps} from "./ProjectTree";
import {EditorStoreProvider, type VisibilityTable, useEditorStore} from "../../state/editor";

const project: Project = {
  id: "project-1" as Project["id"],
  name: "Photon Testbed",
  scene: {
    entities: [
      {
        id: "geom-1" as Project["scene"]["entities"][number]["id"],
        kind: "geometry",
        name: "Shield Slab",
        tags: ["shield"],
        visible: true,
        locked: false,
        transform: IDENTITY_TRANSFORM,
        primitive: "box",
        parameters: {width: 1, height: 1, depth: 1},
      },
      {
        id: "mat-1" as Project["scene"]["entities"][number]["id"],
        kind: "material",
        name: "Water",
        tags: ["moderator"],
        visible: true,
        locked: false,
        transform: IDENTITY_TRANSFORM,
        color: "#7aa2ff",
        attenuationCoefficient: 0.2,
        scatterProbability: 0.3,
        absorptionProbability: 0.1,
        anisotropy: 0,
      },
      {
        id: "src-1" as Project["scene"]["entities"][number]["id"],
        kind: "source",
        name: "Photon Beam",
        tags: ["beam"],
        visible: true,
        locked: false,
        transform: IDENTITY_TRANSFORM,
        sourceKind: "pencil-beam",
        particleType: "photon",
        energy: 1,
        strength: 1,
      },
      {
        id: "tally-1" as Project["scene"]["entities"][number]["id"],
        kind: "tally",
        name: "Dose Tally",
        tags: ["detector"],
        visible: true,
        locked: false,
        transform: IDENTITY_TRANSFORM,
        tallyKind: "detector-hit",
        particleTypes: ["photon"],
      },
    ],
  },
  runConfiguration: {
    particleTypes: ["photon"],
    histories: 100,
    batchSize: 10,
    seed: 1,
    backend: "visual-ts",
    visibleHistoryBudget: 8,
  },
  metadata: {
    appVersion: "0.0.0",
    physicsModelVersion: "toy-photon-0",
    createdAt: "2026-01-01T00:00:00.000Z",
    modifiedAt: "2026-01-01T00:00:00.000Z",
  },
};

function renderProjectTree(overrides: Partial<ProjectTreeProps> = {}) {
  const props: ProjectTreeProps = {
    diagnostics: [],
    ...overrides,
  };

  render(<EditorStoreProvider initialProject={project}><ProjectTree {...props}/></EditorStoreProvider>);

  return props;
}

function MakeGeometryNonSelectable() {
  const {state, dispatch} = useEditorStore();
  const geometry = state.scene.project!.scene.entities.find((entity) => entity.kind === "geometry")!;
  return <button type="button" onClick={() => dispatch({
    type: "set-selectable",
    ref: {kind: geometry.kind, id: geometry.id},
    selectable: false,
  })}>Make geometry non-selectable</button>;
}

function SetProbeMode() {
  const {dispatch} = useEditorStore();
  return <button type="button" onClick={() => dispatch({type: "set-mode", mode: "probe"})}>Use probe mode</button>;
}

describe("ProjectTree", () => {
  it("reports actionable failures through the consolidated public boundary", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<EditorStoreProvider><ProjectTree diagnostics={[]}/></EditorStoreProvider>);

    expect(screen.getByRole("alert")).toHaveTextContent("Project tree unavailable.");
    expect(screen.getByTitle("Project Tree requires an Editable Scene project")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith("Project tree crashed", expect.any(Error), expect.any(Object));
    consoleError.mockRestore();
  });

  it("renders fixed groups, counts, rows, and create controls", () => {
    renderProjectTree();

    expect(screen.getByRole("region", {name: "Project tree"})).toBeInTheDocument();
    expect(screen.getByText("Photon Testbed")).toBeInTheDocument();
    expect(screen.getByText("toy-photon-0")).toBeInTheDocument();
    expect(screen.getByText("Geometry")).toBeInTheDocument();
    expect(screen.getByText("Materials")).toBeInTheDocument();
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getByText("Tallies")).toBeInTheDocument();
    expect(screen.getByText("Shield Slab")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "+ Geometry"})).toBeInTheDocument();
  });

  it("opens Project Settings, cancels atomically, and restores keyboard focus", () => {
    renderProjectTree();
    const settingsButton = screen.getByRole("button", {name: "Project settings"});

    fireEvent.click(settingsButton);

    const dialog = screen.getByRole("dialog", {name: "Project Settings"});
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText("Project name")).toHaveValue("Photon Testbed");
    expect(screen.getByLabelText("Project name")).toHaveFocus();

    fireEvent.keyDown(screen.getByLabelText("Project name"), {key: "Tab", shiftKey: true});
    expect(screen.getByRole("button", {name: "Save Project Settings"})).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("button", {name: "Save Project Settings"}), {key: "Tab"});
    expect(screen.getByLabelText("Project name")).toHaveFocus();

    fireEvent.change(screen.getByLabelText("Project name"), {target: {value: "Discarded Name"}});
    fireEvent.change(screen.getByLabelText("Histories"), {target: {value: "250"}});
    fireEvent.click(screen.getByRole("button", {name: "Cancel"}));

    expect(screen.queryByRole("dialog", {name: "Project Settings"})).not.toBeInTheDocument();
    expect(screen.getByText("Photon Testbed")).toBeInTheDocument();
    expect(settingsButton).toHaveFocus();

    fireEvent.click(settingsButton);
    expect(screen.getByLabelText("Project name")).toHaveValue("Photon Testbed");
    fireEvent.keyDown(screen.getByRole("dialog", {name: "Project Settings"}), {key: "Escape"});
    expect(screen.queryByRole("dialog", {name: "Project Settings"})).not.toBeInTheDocument();
    expect(settingsButton).toHaveFocus();
  });

  it("saves all modeled Project Settings together and rejects an invalid draft without partial updates", () => {
    renderProjectTree();
    const settingsButton = screen.getByRole("button", {name: "Project settings"});
    fireEvent.click(settingsButton);

    fireEvent.change(screen.getByLabelText("Project name"), {target: {value: "Updated Testbed"}});
    fireEvent.change(screen.getByLabelText("Histories"), {target: {value: "0"}});
    fireEvent.change(screen.getByLabelText("Batch size"), {target: {value: "25"}});
    fireEvent.click(screen.getByRole("button", {name: "Save Project Settings"}));

    expect(screen.getByRole("alert", {name: "Project Settings errors"})).toHaveTextContent("Histories must be a positive integer");
    expect(screen.queryByText("Updated Testbed")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Histories"), {target: {value: "250"}});
    fireEvent.change(screen.getByLabelText("Seed"), {target: {value: "17"}});
    fireEvent.change(screen.getByLabelText("Visible history budget"), {target: {value: "20"}});
    fireEvent.click(screen.getByRole("button", {name: "Save Project Settings"}));

    expect(screen.queryByRole("dialog", {name: "Project Settings"})).not.toBeInTheDocument();
    expect(screen.getByText("Updated Testbed")).toBeInTheDocument();
    expect(settingsButton).toHaveFocus();

    fireEvent.click(settingsButton);
    expect(screen.getByLabelText("Histories")).toHaveValue(250);
    expect(screen.getByLabelText("Batch size")).toHaveValue(25);
    expect(screen.getByLabelText("Seed")).toHaveValue(17);
    expect(screen.getByLabelText("Visible history budget")).toHaveValue(20);
  });

  it("filters by tag while preserving the search surface", () => {
    renderProjectTree();

    fireEvent.change(screen.getByPlaceholderText("Name, kind, tag, description"), {
      target: {value: "moderator"},
    });

    expect(screen.getByText("Water")).toBeInTheDocument();
    expect(screen.queryByText("Shield Slab")).not.toBeInTheDocument();
    expect(screen.getByText("Search entities")).toBeInTheDocument();
  });

  it("updates authoritative selection when a row is chosen", () => {
    renderProjectTree();

    fireEvent.click(screen.getByRole("treeitem", {name: "Water, material"}));

    expect(screen.getByRole("treeitem", {name: "Water, material"})).toHaveAttribute("aria-selected", "true");
  });

  it("honors live non-selectable, helper-only, hidden, and locked interaction state", () => {
    const visibility: VisibilityTable = {
      "geometry:geom-1": {visible: true, selectable: false, locked: false, includedInCompile: true, helperOnly: false},
      "material:mat-1": {visible: true, selectable: true, locked: false, includedInCompile: false, helperOnly: true},
      "source:src-1": {visible: false, selectable: true, locked: false, includedInCompile: true, helperOnly: false},
      "tally:tally-1": {visible: true, selectable: true, locked: true, includedInCompile: true, helperOnly: false},
    };
    render(
      <EditorStoreProvider initialProject={project} initialVisibility={visibility}>
        <ProjectTree diagnostics={[]}/>
      </EditorStoreProvider>,
    );

    const hidden = screen.getByRole("treeitem", {name: "Photon Beam, source, hidden"});
    fireEvent.click(hidden);
    expect(hidden).toHaveAttribute("aria-selected", "true");

    const nonSelectable = screen.getByRole("treeitem", {name: "Shield Slab, geometry, not selectable"});
    fireEvent.click(nonSelectable);
    expect(nonSelectable).toHaveAttribute("aria-selected", "false");
    expect(nonSelectable).toHaveAttribute("tabindex", "-1");
    expect(hidden).toHaveAttribute("aria-selected", "true");

    const helper = screen.getByRole("treeitem", {name: "Water, material, excluded from compiled problem, editor helper only"});
    expect(within(helper).getByText("helper")).toBeInTheDocument();
    expect(within(helper).getByRole("button", {name: "Helper-only entities cannot be included in the compiled problem"})).toBeDisabled();
    fireEvent.click(helper);
    expect(helper).toHaveAttribute("aria-selected", "true");

    const locked = screen.getByRole("treeitem", {name: "Dose Tally, tally, locked"});
    expect(within(locked).getByRole("button", {name: "Locked entities cannot be edited"})).toBeDisabled();
    fireEvent.click(locked);
    expect(locked).toHaveAttribute("aria-selected", "true");
  });

  it("updates row eligibility when selectability changes after mount", () => {
    render(
      <EditorStoreProvider initialProject={project}>
        <MakeGeometryNonSelectable/>
        <ProjectTree diagnostics={[]}/>
      </EditorStoreProvider>,
    );
    const selectable = screen.getByRole("treeitem", {name: "Shield Slab, geometry"});
    fireEvent.click(selectable);
    expect(selectable).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", {name: "Make geometry non-selectable"}));

    const ineligible = screen.getByRole("treeitem", {name: "Shield Slab, geometry, not selectable"});
    expect(ineligible).toHaveAttribute("aria-selected", "false");
    expect(ineligible).toHaveAttribute("tabindex", "-1");
  });

  it("supports keyboard selection through the public tree interface", () => {
    renderProjectTree();
    const row = screen.getByRole("treeitem", {name: "Water, material"});

    fireEvent.keyDown(row, {key: "Enter"});

    expect(row).toHaveAttribute("aria-selected", "true");
  });

  it("exposes mode-specific selection and disables authoring actions with an explanation", () => {
    render(
      <EditorStoreProvider initialProject={project}>
        <SetProbeMode/>
        <ProjectTree diagnostics={[]}/>
      </EditorStoreProvider>,
    );

    fireEvent.click(screen.getByRole("button", {name: "Use probe mode"}));

    const material = screen.getByRole("treeitem", {name: "Water, material, unavailable in probe mode"});
    const source = screen.getByRole("treeitem", {name: "Photon Beam, source"});
    expect(material).toHaveAttribute("aria-disabled", "true");
    expect(material).toHaveAttribute("tabindex", "-1");
    fireEvent.click(material);
    expect(material).toHaveAttribute("aria-selected", "false");
    fireEvent.click(source);
    expect(source).toHaveAttribute("aria-selected", "true");

    expect(screen.getByRole("button", {name: "+ Geometry"})).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Probe mode is read-only");
    expect(within(source).getAllByRole("button").every((button) => button.hasAttribute("disabled"))).toBe(true);
  });

  it("closes an inline metadata draft when the editor enters a read-only mode", () => {
    render(
      <EditorStoreProvider initialProject={project}>
        <SetProbeMode/>
        <ProjectTree diagnostics={[]}/>
      </EditorStoreProvider>,
    );
    const geometry = screen.getByRole("treeitem", {name: "Shield Slab, geometry"});
    fireEvent.click(within(geometry).getByRole("button", {name: "Edit entity metadata"}));
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "Unsaved draft"}});

    fireEvent.click(screen.getByRole("button", {name: "Use probe mode"}));

    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByRole("treeitem", {name: "Shield Slab, geometry"})).toBeInTheDocument();
    expect(screen.queryByText("Unsaved draft")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Probe mode is read-only");
  });

  it("opens and saves the metadata editor", () => {
    renderProjectTree();
    const row = screen.getByRole("treeitem", {name: "Shield Slab, geometry"});

    fireEvent.click(within(row).getByRole("button", {name: "Edit entity metadata"}));
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "Primary Shield"}});
    fireEvent.change(screen.getByLabelText("Description"), {target: {value: "front slab"}});
    fireEvent.change(screen.getByLabelText("Tags"), {target: {value: "shield, primary"}});
    fireEvent.click(screen.getByRole("button", {name: "Save"}));

    expect(screen.getByRole("treeitem", {name: "Primary Shield, geometry"})).toBeInTheDocument();
  });

  it("dispatches duplicate, delete, create, visibility, lock, and compile actions", () => {
    renderProjectTree();
    const row = screen.getByRole("treeitem", {name: "Shield Slab, geometry"});

    fireEvent.click(within(row).getByRole("button", {name: "Hide this entity in the viewport"}));
    expect(screen.getByText("hidden")).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", {name: "Lock this entity against editing"}));
    expect(row).toHaveAttribute("data-locked", "true");
    expect(within(row).getByRole("button", {name: "Unlock this entity for editing"})).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(row).getByRole("button", {name: "Exclude this entity from the compiled transport problem"}));
    expect(screen.getByText("excluded")).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", {name: "Duplicate this entity"}));
    expect(screen.getByText("Shield Slab Copy")).toBeInTheDocument();

    const materialRow = screen.getByRole("treeitem", {name: "Water, material"});
    fireEvent.click(within(materialRow).getByRole("button", {name: "Delete this entity"}));
    expect(screen.queryByText("Water")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {name: "+ Source"}));
    expect(screen.getByText("New Source")).toBeInTheDocument();
  });

  it("shows diagnostic badges for entity-specific diagnostics", () => {
    renderProjectTree({
      diagnostics: [
        {
          severity: "warning",
          message: "Material assignment missing",
          entityId: "geom-1" as Project["scene"]["entities"][number]["id"],
        },
      ],
    });

    expect(screen.getByText("warning")).toBeInTheDocument();
  });

  it("preserves mixed diagnostic codes, severity, messages, and entity association", () => {
    renderProjectTree({
      diagnostics: [
        {
          severity: "warning",
          code: "missing-material",
          message: "Shield Slab needs a material assignment.",
          entityId: "geom-1" as Project["scene"]["entities"][number]["id"],
        },
        {
          severity: "warning",
          code: "future-diagnostic-code",
          message: "A future warning remains generic.",
          entityId: "geom-1" as Project["scene"]["entities"][number]["id"],
        },
        {
          severity: "error",
          message: "An uncoded error remains invalid.",
          entityId: "geom-1" as Project["scene"]["entities"][number]["id"],
        },
        {
          severity: "info",
          code: "future-informational-code",
          message: "An informational diagnostic remains visible.",
          entityId: "geom-1" as Project["scene"]["entities"][number]["id"],
        },
      ],
    });

    const row = screen.getByRole("treeitem", {name: "Shield Slab, geometry"});
    const badges = within(row).getByLabelText("Project tree badges");
    expect(within(badges).getByText("material?")).toHaveAttribute("data-badge-kind", "missing-material");
    expect(within(badges).getByText("warning")).toHaveAttribute(
      "title",
      "2 diagnostics: Shield Slab needs a material assignment.; A future warning remains generic.",
    );
    expect(within(badges).getByText("invalid")).toHaveAttribute("title", "An uncoded error remains invalid.");
    expect(within(badges).getByText("info")).toHaveAttribute(
      "title",
      "An informational diagnostic remains visible.",
    );
  });
});
