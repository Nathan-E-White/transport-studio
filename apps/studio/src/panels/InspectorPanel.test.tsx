import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import type {Project, SceneEntity} from "@transport/domain";
import type {EntityId} from "@transport/shared";
import {InspectorPanel} from "./InspectorPanel";

const entityId = "geometry-1" as EntityId;

const entity: SceneEntity = {
  id: entityId,
  kind: "geometry",
  name: "Rotated Shield",
  tags: [],
  visible: true,
  locked: false,
  transform: {
    position: {x: 1, y: 2, z: 3},
    rotationEuler: {x: 0.125, y: -1.5, z: 2},
    scale: {x: 1, y: 1, z: 1},
  },
  primitive: "box",
  parameters: {width: 1, height: 1, depth: 1},
};

const project: Project = {
  id: "project-1" as EntityId,
  name: "Inspector Test Project",
  scene: {entities: [entity]},
  runConfiguration: {
    particleTypes: ["photon"],
    histories: 1,
    batchSize: 1,
    seed: 1,
    backend: "visual-ts",
    visibleHistoryBudget: 1,
  },
  metadata: {
    appVersion: "test",
    physicsModelVersion: "test",
    createdAt: "2026-07-19T00:00:00.000Z",
    modifiedAt: "2026-07-19T00:00:00.000Z",
  },
};

function rotationValue() {
  return screen.getByLabelText("Rotation value");
}

describe("InspectorPanel rotation", () => {
  it("shows the selected entity's modeled Euler rotation", () => {
    render(<InspectorPanel entity={entity} diagnostics={[]} tracks={[]} project={project}/>);

    expect(rotationValue()).toHaveTextContent("0.13, -1.50, 2.00");
  });

  it("commits transform and kind-specific fields as one accepted entity", () => {
    const onEntityChange = vi.fn();
    render(<InspectorPanel entity={entity} diagnostics={[]} tracks={[]} project={project} onEntityChange={onEntityChange}/>);

    fireEvent.change(screen.getByLabelText("Position X"), {target: {value: "4"}});
    fireEvent.change(screen.getByLabelText("Width"), {target: {value: "2.5"}});
    fireEvent.click(screen.getByRole("button", {name: "Apply Inspector Changes"}));

    expect(onEntityChange).toHaveBeenCalledWith(entity, expect.objectContaining({
      transform: expect.objectContaining({position: {x: 4, y: 2, z: 3}}),
      parameters: expect.objectContaining({width: 2.5}),
    }));
  });

  it("shows rejected input without committing a partial entity", () => {
    const onEntityChange = vi.fn();
    render(<InspectorPanel entity={entity} diagnostics={[]} tracks={[]} project={project} onEntityChange={onEntityChange}/>);

    fireEvent.change(screen.getByLabelText("Scale X"), {target: {value: "0"}});
    fireEvent.click(screen.getByRole("button", {name: "Apply Inspector Changes"}));

    expect(screen.getByRole("alert", {name: "Inspector edit rejected"})).toHaveTextContent("Scale values must be greater than zero");
    expect(onEntityChange).not.toHaveBeenCalled();
    expect(project.scene.entities[0].transform.scale.x).toBe(1);
  });

  it("migrates geometry parameters when the primitive changes", () => {
    const onEntityChange = vi.fn();
    render(<InspectorPanel entity={entity} diagnostics={[]} tracks={[]} project={project} onEntityChange={onEntityChange}/>);

    fireEvent.change(screen.getByLabelText("Primitive"), {target: {value: "sphere"}});
    expect(screen.getByLabelText("Radius")).toHaveValue(1);
    expect(screen.queryByLabelText("Width")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Apply Inspector Changes"}));

    expect(onEntityChange).toHaveBeenCalledWith(entity, expect.objectContaining({primitive: "sphere", parameters: {radius: 1}}));
  });

  it("gives a point source a repairable direction when it becomes a pencil beam", () => {
    const pointSource = {
      ...project.scene.entities.find((candidate) => candidate.kind === "source"),
      id: "source-point" as EntityId,
      kind: "source",
      name: "Point Source",
      tags: [],
      visible: true,
      locked: false,
      transform: entity.transform,
      sourceKind: "point-isotropic",
      particleType: "photon",
      energy: 1,
      strength: 1,
      direction: undefined,
    } satisfies SceneEntity;
    const sourceProject = {...project, scene: {...project.scene, entities: [pointSource]}};
    const onEntityChange = vi.fn();
    render(<InspectorPanel entity={pointSource} diagnostics={[]} tracks={[]} project={sourceProject} onEntityChange={onEntityChange}/>);

    fireEvent.change(screen.getByLabelText("Source"), {target: {value: "pencil-beam"}});
    expect(screen.getByLabelText("Direction X")).toHaveValue(1);
    fireEvent.click(screen.getByRole("button", {name: "Apply Inspector Changes"}));

    expect(onEntityChange).toHaveBeenCalledWith(pointSource, expect.objectContaining({
      sourceKind: "pencil-beam",
      direction: {x: 1, y: 0, z: 0},
    }));
  });

  it("disables edits for locked entities and explains why", () => {
    const onEntityChange = vi.fn();
    render(<InspectorPanel entity={{...entity, locked: true}} diagnostics={[]} tracks={[]} project={project} onEntityChange={onEntityChange}/>);

    expect(screen.getByText(/This entity is locked/)).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Apply Inspector Changes"})).toBeDisabled();
    expect(screen.getByLabelText("Position X")).toBeDisabled();
  });

  it("keeps submitted snapshots read-only with an explanation", () => {
    render(<InspectorPanel entity={entity} diagnostics={[]} tracks={[]} project={project}
      onEntityChange={vi.fn()} editingDisabledReason="Submitted run snapshots are read-only."/>);

    expect(screen.getByText("Submitted run snapshots are read-only.")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Apply Inspector Changes"})).toBeDisabled();
  });

  it("refreshes zero and absent rotation values when selection changes", () => {
    const zeroRotationEntity: SceneEntity = {
      ...entity,
      id: "geometry-zero" as EntityId,
      name: "Unrotated Shield",
      transform: {
        ...entity.transform,
        rotationEuler: {x: 0, y: 0, z: 0},
      },
    };
    const rotationAbsentEntity = {
      ...entity,
      id: "geometry-legacy" as EntityId,
      name: "Rotation Not Recorded",
      transform: {
        position: entity.transform.position,
        scale: entity.transform.scale,
      },
    } as unknown as SceneEntity;
    const onEntityChange = vi.fn();
    const {rerender} = render(
      <InspectorPanel entity={zeroRotationEntity} diagnostics={[]} tracks={[]} project={project} onEntityChange={onEntityChange}/>,
    );

    expect(rotationValue()).toHaveTextContent("0.00, 0.00, 0.00");
    fireEvent.change(screen.getByLabelText("Rotation X"), {target: {value: "7"}});

    rerender(<InspectorPanel entity={rotationAbsentEntity} diagnostics={[]} tracks={[]} project={project} onEntityChange={onEntityChange}/>);

    expect(rotationValue()).toHaveTextContent("not set");
    expect(screen.getByLabelText("Rotation X")).toHaveValue(null);
    expect(onEntityChange).not.toHaveBeenCalled();
  });

  it("keeps the draft's original conflict baseline across a same-selection rerender", () => {
    const onEntityChange = vi.fn();
    const {rerender} = render(
      <InspectorPanel entity={entity} diagnostics={[]} tracks={[]} project={project} onEntityChange={onEntityChange}/>,
    );
    fireEvent.change(screen.getByLabelText("Position X"), {target: {value: "4"}});

    const externallyChanged = {
      ...entity,
      transform: {...entity.transform, position: {x: 8, y: 2, z: 3}},
    } satisfies SceneEntity;
    const changedProject = {...project, scene: {...project.scene, entities: [externallyChanged]}};
    rerender(<InspectorPanel entity={externallyChanged} diagnostics={[]} tracks={[]} project={changedProject} onEntityChange={onEntityChange}/>);
    fireEvent.click(screen.getByRole("button", {name: "Apply Inspector Changes"}));

    expect(onEntityChange).toHaveBeenCalledWith(entity, expect.objectContaining({
      transform: expect.objectContaining({position: {x: 4, y: 2, z: 3}}),
    }));
  });

  it("refreshes a rejected stale draft from the current entity", () => {
    const onEntityChange = vi.fn();
    const {rerender} = render(
      <InspectorPanel entity={entity} diagnostics={[]} tracks={[]} project={project} onEntityChange={onEntityChange}/>,
    );
    fireEvent.change(screen.getByLabelText("Position X"), {target: {value: "4"}});
    const externallyChanged = {
      ...entity,
      transform: {...entity.transform, position: {x: 8, y: 2, z: 3}},
    } satisfies SceneEntity;
    const changedProject = {...project, scene: {...project.scene, entities: [externallyChanged]}};
    const conflictDiagnostics = [{severity: "error" as const, code: "inspector.entity.conflict", message: "The entity changed."}];

    rerender(<InspectorPanel entity={externallyChanged} diagnostics={[]} tracks={[]} project={changedProject} onEntityChange={onEntityChange}/>);
    rerender(<InspectorPanel entity={externallyChanged} diagnostics={[]} tracks={[]} project={changedProject} onEntityChange={onEntityChange}
      editDiagnostics={conflictDiagnostics}/>);

    expect(screen.getByLabelText("Position X")).toHaveValue(8);
    expect(screen.getByRole("alert", {name: "Inspector edit rejected"})).toHaveTextContent("The entity changed.");

    fireEvent.change(screen.getByLabelText("Position X"), {target: {value: "6"}});
    const metadataChanged = {...externallyChanged, name: "Externally Renamed"};
    const renamedProject = {...project, scene: {...project.scene, entities: [metadataChanged]}};
    rerender(<InspectorPanel entity={metadataChanged} diagnostics={[]} tracks={[]} project={renamedProject} onEntityChange={onEntityChange}
      editDiagnostics={conflictDiagnostics}/>);

    expect(screen.getByLabelText("Position X")).toHaveValue(6);
  });
});
