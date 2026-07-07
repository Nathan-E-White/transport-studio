import type {EditorScene} from "@transport/domain/editor/EditorScene";
import {compileEditorScene} from "@transport/domain/compile/CompileEditorScene";
import type {TransportProblem} from "@transport/domain/transport/TransportProblem";

export function createNativePhotonSmokeFixtureScene(): EditorScene {
  return {
    id: "fixture-photon-shielding",
    name: "Native Photon Smoke Fixture",
    entities: [
      {
        id: "shield-box",
        name: "Shield Box",
        kind: "box",
        visible: true,
        locked: false,
        materialId: "mat-water",
        transform: {
          position: {x: 0, y: 0, z: 0},
          rotation: {x: 0, y: 0, z: 0},
          scale: {x: 1, y: 1, z: 1},
        },
        size: {x: 2, y: 4, z: 4},
      },
    ],
    materials: [
      {
        id: "mat-water",
        name: "Water Shield",
        density: 1,
        color: "#38bdf8",
        nuclides: [
          {nuclide: "H1", fraction: 2},
          {nuclide: "O16", fraction: 1},
        ],
      },
    ],
    sources: [
      {
        id: "beam-1",
        name: "Photon Beam",
        kind: "beam-source",
        particle: "photon",
        energyMeV: 1,
        strength: 1,
        position: {x: -4, y: 0, z: 0},
        direction: {x: 1, y: 0, z: 0},
      },
    ],
    tallies: [
      {
        id: "shield-track-length",
        name: "Shield Track Length",
        kind: "cell-flux",
        particle: "photon",
        entityId: "shield-box",
      },
    ],
    settings: {
      histories: 16,
      seed: 1337,
    },
  };
}

export function createNativePhotonSmokeFixtureProblem(): TransportProblem {
  const result = compileEditorScene(createNativePhotonSmokeFixtureScene());

  if (!result.ok || !result.value) {
    throw new Error(`Native photon smoke fixture failed to compile: ${result.diagnostics.map((diagnostic) => diagnostic.code).join(", ")}`);
  }

  return {
    ...result.value,
    metadata: {
      ...result.value.metadata,
      targetBackendId: "native-rust-photon-smoke",
      tags: ["mwe", "native-photon-smoke"],
    },
  };
}
