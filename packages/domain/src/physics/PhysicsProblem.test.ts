import { describe, expect, it } from "vitest";
import {
    V1_SOLVER_CAPABILITIES,
    createExperimentReport,
    fingerprintPhysicsProblem,
    isResultStale,
    validatePhysicsProblem,
    type PhysicsProblemSpec,
} from "./PhysicsProblem";

describe("PhysicsProblem V1 contracts", () => {
    it("keeps every planned solver visible in the capability registry", () => {
        expect(V1_SOLVER_CAPABILITIES.map((solver) => solver.id)).toEqual([
            "mock-fields",
            "gray-radiation-diffusion",
            "eulerian-hydro",
            "multigroup-radiation-diffusion",
            "discrete-ordinates",
            "implicit-monte-carlo",
            "lagrangian-hydro",
            "ale-hydro",
            "criticality-keff",
            "point-kinetics",
            "depletion",
        ]);
    });

    it("validates runnable gray diffusion and reports all experiment sections", () => {
        const problem = baseProblem();
        const report = createExperimentReport({ problem });

        expect(report.validation.ok).toBe(true);
        expect(report.sections.map((section) => section.title)).toEqual([
            "Geometry / Regions",
            "Mesh / AMR blocks",
            "Materials / EOS / opacity",
            "Radiation model",
            "Hydro model",
            "Coupling strategy",
            "Sources / drives",
            "Boundary conditions",
            "Diagnostics / tallies / probes",
            "Solver run configuration",
        ]);
    });

    it("gates unsupported solvers without removing their model facets", () => {
        const diagnostics = validatePhysicsProblem({
            ...baseProblem(),
            run: { solverId: "criticality-keff" },
            criticality: {
                enabled: true,
                fissileMaterialIds: ["mat-fuel"],
                state: "subcritical-placeholder",
            },
        }).diagnostics;

        expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain("physics.solver.gated");
        expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain("physics.criticality.placeholder");
    });

    it("detects table-domain failures and stale result fingerprints", () => {
        const problem = baseProblem();
        const fingerprint = fingerprintPhysicsProblem(problem);
        const modified = {
            ...problem,
            materialStates: [{ ...problem.materialStates[0], density: { kind: "constant" as const, value: 100, unit: "g/cm^3" } }],
        };

        expect(isResultStale(modified, fingerprint)).toBe(true);
        expect(validatePhysicsProblem(modified).diagnostics.map((diagnostic) => diagnostic.code)).toContain("physics.table.density.outOfDomain");
    });
});

function baseProblem(): PhysicsProblemSpec {
    return {
        id: "marshak-demo",
        name: "Marshak Demo",
        geometry: [{ id: "region-foam", name: "Foam", kind: "foam", materialId: "mat-foam" }],
        mesh: { dimension: "1D", cells: [32, 1, 1] },
        materials: [
            {
                id: "mat-foam",
                name: "CH Foam",
                composition: [{ id: "C", fraction: 1, basis: "atom" }],
                eos: { kind: "ideal-gas", gamma: 1.4 },
                opacity: {
                    kind: "gray-table",
                    table: {
                        id: "mock-opacity",
                        dataPolicy: "mock",
                        domain: { density: [0.001, 10], temperature: [1, 1_000] },
                    },
                },
            },
        ],
        materialStates: [
            {
                materialId: "mat-foam",
                density: { kind: "constant", value: 1, unit: "g/cm^3" },
                electronTemperature: { kind: "constant", value: 300, unit: "K" },
            },
        ],
        radiation: {
            mode: "gray-diffusion",
            radiationEnergy: { kind: "constant", value: 1, unit: "arb" },
            opacityRef: { kind: "constant", value: 1, unit: "cm^-1" },
        },
        hydro: { mode: "none" },
        temperatures: { mode: "single-temperature" },
        coupling: {
            nodes: [
                { id: "rad", kind: "radiation-transport-step", inputs: ["radiation-energy"], outputs: ["radiation-energy"] },
                { id: "diag", kind: "diagnostics", inputs: ["radiation-energy"], outputs: ["energy-diagnostics"] },
            ],
            edges: [{ from: "rad", output: "radiation-energy", to: "diag", input: "radiation-energy" }],
        },
        sources: ["left-drive"],
        boundaryConditions: ["left-marshak", "right-outflow"],
        diagnostics: { probes: ["front"], tallies: ["energy"], conserveMass: true, conserveEnergy: true },
        criticality: { enabled: false, fissileMaterialIds: [] },
        run: { solverId: "gray-radiation-diffusion", timeStep: 0.01, steps: 8 },
    };
}
