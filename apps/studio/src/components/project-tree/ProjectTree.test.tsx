import {fireEvent, render, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import type {Project} from "@transport/domain";
import {IDENTITY_TRANSFORM} from "@transport/shared";
import {ProjectTree, ProjectTreeProps} from "./ProjectTree";

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
    project,
    selectedEntityId: "geom-1",
    diagnostics: [],
    onSelect: vi.fn(),
    onCreateEntity: vi.fn(),
    onUpdateEntityMetadata: vi.fn(),
    onDuplicateEntity: vi.fn(),
    onDeleteEntity: vi.fn(),
    onSetEntityVisible: vi.fn(),
    onSetEntityLocked: vi.fn(),
    ...overrides,
  };

  render(<ProjectTree {...props}/>);

  return props;
}

describe("ProjectTree", () => {
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

  it("filters by tag while preserving the search surface", () => {
    renderProjectTree();

    fireEvent.change(screen.getByPlaceholderText("Name, kind, tag, description"), {
      target: {value: "moderator"},
    });

    expect(screen.getByText("Water")).toBeInTheDocument();
    expect(screen.queryByText("Shield Slab")).not.toBeInTheDocument();
    expect(screen.getByText("Search entities")).toBeInTheDocument();
  });

  it("syncs row selection through the app callback", () => {
    const props = renderProjectTree();

    fireEvent.click(screen.getByRole("treeitem", {name: "Water, material"}));

    expect(props.onSelect).toHaveBeenCalledWith("mat-1");
  });

  it("opens and saves the metadata editor", () => {
    const props = renderProjectTree();
    const row = screen.getByRole("treeitem", {name: "Shield Slab, geometry"});

    fireEvent.click(within(row).getByRole("button", {name: "Edit entity metadata"}));
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "Primary Shield"}});
    fireEvent.change(screen.getByLabelText("Description"), {target: {value: "front slab"}});
    fireEvent.change(screen.getByLabelText("Tags"), {target: {value: "shield, primary"}});
    fireEvent.click(screen.getByRole("button", {name: "Save"}));

    expect(props.onUpdateEntityMetadata).toHaveBeenCalledWith("geom-1", {
      name: "Primary Shield",
      description: "front slab",
      tags: ["shield", "primary"],
    });
  });

  it("dispatches duplicate, delete, create, visibility, lock, and compile actions", () => {
    const props = renderProjectTree();
    const row = screen.getByRole("treeitem", {name: "Shield Slab, geometry"});

    fireEvent.click(within(row).getByRole("button", {name: "Hide this entity in the viewport"}));
    expect(props.onSetEntityVisible).toHaveBeenCalledWith("geom-1", false);
    expect(screen.getByText("hidden")).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", {name: "Lock this entity against editing"}));
    expect(props.onSetEntityLocked).toHaveBeenCalledWith("geom-1", true);

    fireEvent.click(within(row).getByRole("button", {name: "Exclude this entity from the compiled transport problem"}));
    expect(screen.getByText("excluded")).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", {name: "Duplicate this entity"}));
    expect(props.onDuplicateEntity).toHaveBeenCalledWith("geom-1");

    const materialRow = screen.getByRole("treeitem", {name: "Water, material"});
    fireEvent.click(within(materialRow).getByRole("button", {name: "Delete this entity"}));
    expect(props.onDeleteEntity).toHaveBeenCalledWith("mat-1");

    fireEvent.click(screen.getByRole("button", {name: "+ Source"}));
    expect(props.onCreateEntity).toHaveBeenCalledWith("source");
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
});
