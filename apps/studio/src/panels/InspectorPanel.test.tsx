import {render, screen, within} from "@testing-library/react";
import {describe, expect, it} from "vitest";
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
  return within(screen.getByText("Rotation").closest(".property-row")!).getByRole("strong");
}

describe("InspectorPanel rotation", () => {
  it("shows the selected entity's modeled Euler rotation", () => {
    render(<InspectorPanel entity={entity} diagnostics={[]} tracks={[]} project={project}/>);

    expect(rotationValue()).toHaveTextContent("0.13, -1.50, 2.00");
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
    const {rerender} = render(
      <InspectorPanel entity={zeroRotationEntity} diagnostics={[]} tracks={[]} project={project}/>,
    );

    expect(rotationValue()).toHaveTextContent("0.00, 0.00, 0.00");

    rerender(<InspectorPanel entity={rotationAbsentEntity} diagnostics={[]} tracks={[]} project={project}/>);

    expect(rotationValue()).toHaveTextContent("not set");
  });
});
