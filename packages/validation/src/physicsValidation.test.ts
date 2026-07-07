import { describe, expect, it } from "vitest";
import { validateExperimentSpec, type PhysicsProblemSpec } from "./index";

describe("physics validation facade", () => {
  it("returns category diagnostics for gated physics", () => {
    const problem: PhysicsProblemSpec = {
      id: "criticality-placeholder",
      name: "Criticality Placeholder",
      geometry: [],
      mesh: { dimension: "1D", cells: [1, 1, 1] },
      materials: [],
      materialStates: [],
      radiation: { mode: "none" },
      hydro: { mode: "none" },
      temperatures: { mode: "single-temperature" },
      coupling: { nodes: [], edges: [] },
      sources: [],
      boundaryConditions: [],
      diagnostics: { probes: [], tallies: [], conserveMass: false, conserveEnergy: false },
      criticality: { enabled: true, fissileMaterialIds: ["mat-fuel"] },
      run: { solverId: "criticality-keff" },
    };

    expect(validateExperimentSpec({ problem }).diagnostics.map((diagnostic) => diagnostic.category)).toContain("solver");
    expect(validateExperimentSpec({ problem }).diagnostics.map((diagnostic) => diagnostic.category)).toContain("safety");
  });
});
