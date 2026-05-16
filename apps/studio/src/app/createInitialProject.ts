import type { Project } from "@transport/domain";
import { IDENTITY_TRANSFORM, makeId } from "@transport/shared";

export function createInitialProject(): Project {
  const materialId = makeId("mat");
  const shieldId = makeId("geom");

  return {
    id: makeId("project"),
    name: "Photon Shielding Sandbox",
    scene: {
      entities: [
        {
          id: materialId,
          kind: "material",
          name: "Toy Shield",
          tags: ["demo"],
          visible: true,
          locked: false,
          transform: IDENTITY_TRANSFORM,
          color: "#7aa2ff",
          attenuationCoefficient: 0.65,
          scatterProbability: 0.25,
          absorptionProbability: 0.35,
          anisotropy: 0
        },
        {
          id: shieldId,
          kind: "geometry",
          name: "Shield Slab",
          tags: ["demo"],
          visible: true,
          locked: false,
          transform: { ...IDENTITY_TRANSFORM, position: { x: 0, y: 0, z: 0 }, scale: { x: 1.5, y: 5, z: 5 } },
          primitive: "box",
          materialId,
          parameters: { width: 1, height: 1, depth: 1 }
        },
        {
          id: makeId("src"),
          kind: "source",
          name: "Photon Beam",
          tags: ["demo"],
          visible: true,
          locked: false,
          transform: { ...IDENTITY_TRANSFORM, position: { x: -8, y: 0, z: 0 } },
          sourceKind: "pencil-beam",
          particleType: "photon",
          energy: 1,
          strength: 1,
          direction: { x: 1, y: 0, z: 0 }
        },
        {
          id: makeId("tally"),
          kind: "tally",
          name: "Detector Plane",
          tags: ["demo"],
          visible: true,
          locked: false,
          transform: { ...IDENTITY_TRANSFORM, position: { x: 8, y: 0, z: 0 }, scale: { x: 0.1, y: 5, z: 5 } },
          tallyKind: "detector-hit",
          particleTypes: ["photon"],
          bins: [1, 16, 16]
        }
      ]
    },
    runConfiguration: {
      particleTypes: ["photon"],
      histories: 1000,
      batchSize: 100,
      seed: 1337,
      backend: "visual-ts",
      visibleHistoryBudget: 64
    },
    metadata: {
      appVersion: "0.0.0",
      physicsModelVersion: "toy-photon-0",
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString()
    }
  };
}
