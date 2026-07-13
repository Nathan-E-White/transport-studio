import type { Vec3 } from "@transport/shared";

export type PhysicsSolverId =
    | "mock-fields"
    | "gray-radiation-diffusion"
    | "multigroup-radiation-diffusion"
    | "discrete-ordinates"
    | "implicit-monte-carlo"
    | "lagrangian-hydro"
    | "eulerian-hydro"
    | "ale-hydro"
    | "criticality-keff"
    | "point-kinetics"
    | "depletion"
    | "relativistic-multiphysics";

export type SolverSupportStatus = "runnable" | "gated" | "placeholder";
export type ModelFacetStatus = "runnable" | "stubbed" | "gated";
export type ProductCapabilityStatus = "solved" | "validated-only" | "substrate" | "gated" | "future-track";
export type RegionKind =
    | "vacuum"
    | "gas"
    | "solid"
    | "foam"
    | "shell"
    | "capsule"
    | "hohlraum"
    | "foil"
    | "ablator"
    | "tamper"
    | "diagnostic-window";

export interface FieldExpr {
    readonly kind: "constant" | "uniform" | "linear" | "table-ref" | "derived";
    readonly value?: number;
    readonly unit?: string;
    readonly tableId?: string;
    readonly expression?: string;
}

export interface VectorFieldExpr {
    readonly kind: "constant" | "uniform" | "derived";
    readonly value?: Vec3;
    readonly unit?: string;
    readonly expression?: string;
}

export interface TableDomain {
    readonly density?: readonly [number, number];
    readonly temperature?: readonly [number, number];
    readonly electronTemperature?: readonly [number, number];
    readonly ionTemperature?: readonly [number, number];
    readonly radiationTemperature?: readonly [number, number];
    readonly energyMeV?: readonly [number, number];
    readonly radiationGroup?: readonly [number, number];
}

export interface TableRef {
    readonly id: string;
    readonly name?: string;
    readonly dataPolicy: "mock" | "local-table" | "external-required";
    readonly domain: TableDomain;
}

export type EOSRef =
    | { readonly kind: "ideal-gas"; readonly gamma: number }
    | { readonly kind: "table"; readonly table: TableRef }
    | { readonly kind: "placeholder"; readonly id: string };

export type OpacityRef =
    | { readonly kind: "constant"; readonly value: number; readonly unit: "cm^-1" | "m^-1" }
    | { readonly kind: "gray-table"; readonly table: TableRef }
    | { readonly kind: "multigroup-table"; readonly table: TableRef; readonly groups: number }
    | { readonly kind: "placeholder"; readonly id: string };

export interface StrengthModelRef {
    readonly kind: "placeholder" | "table";
    readonly table?: TableRef;
}

export interface IonizationModelRef {
    readonly kind: "placeholder" | "average-ionization-table";
    readonly table?: TableRef;
}

export interface TransportCoeffRef {
    readonly kind: "constant" | "table" | "placeholder";
    readonly value?: number;
    readonly table?: TableRef;
}

export interface NuclideOrElementFraction {
    readonly id: string;
    readonly fraction: number;
    readonly basis: "atom" | "weight";
    readonly fissile?: boolean;
}

export interface MaterialDefinition {
    readonly id: string;
    readonly name: string;
    readonly composition: readonly NuclideOrElementFraction[];
    readonly eos: EOSRef;
    readonly opacity: OpacityRef;
    readonly strength?: StrengthModelRef;
    readonly ionization?: IonizationModelRef;
    readonly thermalConductivity?: TransportCoeffRef;
    readonly fissile?: boolean;
}

export interface MaterialState {
    readonly materialId: string;
    readonly density: FieldExpr;
    readonly electronTemperature?: FieldExpr;
    readonly ionTemperature?: FieldExpr;
    readonly radiationTemperature?: FieldExpr;
    readonly pressure?: FieldExpr;
    readonly velocity?: VectorFieldExpr;
    readonly internalEnergy?: FieldExpr;
    readonly ionizationState?: FieldExpr;
}

export interface GeometryRegionSpec {
    readonly id: string;
    readonly name: string;
    readonly kind: RegionKind;
    readonly materialId?: string;
}

export interface MeshSpec {
    readonly dimension: "1D" | "2D" | "3D";
    readonly cells: readonly [number, number, number];
    readonly amrBlocks?: readonly string[];
}

export interface RadiationModelSpec {
    readonly mode:
        | "none"
        | "gray-diffusion"
        | "multigroup-diffusion"
        | "discrete-ordinates"
        | "implicit-monte-carlo"
        | "hybrid";
    readonly radiationEnergy?: FieldExpr;
    readonly radiationFlux?: VectorFieldExpr;
    readonly opacityRef?: OpacityRef;
    readonly groupCount?: number;
}

export interface HydroModelSpec {
    readonly mode: "none" | "eulerian" | "lagrangian" | "ale";
    readonly density?: FieldExpr;
    readonly velocity?: VectorFieldExpr;
    readonly pressure?: FieldExpr;
    readonly eosRef?: EOSRef;
}

export interface TemperatureModelSpec {
    readonly mode: "single-temperature" | "two-temperature" | "three-temperature";
    readonly electronIonCoupling?: TransportCoeffRef;
    readonly matterRadiationCoupling?: TransportCoeffRef;
}

export type CouplingNodeKind =
    | "radiation-transport-step"
    | "hydro-step"
    | "eos-update"
    | "opacity-update"
    | "electron-ion-coupling"
    | "laser-deposition"
    | "conductive-heat-transfer"
    | "artificial-viscosity"
    | "amr-regrid"
    | "diagnostics";

export interface CouplingNodeSpec {
    readonly id: string;
    readonly kind: CouplingNodeKind;
    readonly inputs: readonly string[];
    readonly outputs: readonly string[];
}

export interface CouplingEdgeSpec {
    readonly from: string;
    readonly output: string;
    readonly to: string;
    readonly input: string;
}

export interface CouplingGraphSpec {
    readonly nodes: readonly CouplingNodeSpec[];
    readonly edges: readonly CouplingEdgeSpec[];
}

export interface CriticalitySpec {
    readonly enabled: boolean;
    readonly fissileMaterialIds: readonly string[];
    readonly state?: "not-requested" | "subcritical-placeholder" | "unsupported-criticality";
    readonly keff?: number;
    readonly betaEffective?: number;
    readonly reactivity?: number;
    readonly subcriticalMargin?: number;
}

export interface DiagnosticsSpec {
    readonly probes: readonly string[];
    readonly tallies: readonly string[];
    readonly conserveMass: boolean;
    readonly conserveEnergy: boolean;
}

export interface SolverRunConfig {
    readonly solverId: PhysicsSolverId;
    readonly timeStep?: number;
    readonly steps?: number;
    readonly seed?: number;
}

export interface PhysicsProblemSpec {
    readonly id: string;
    readonly name: string;
    readonly geometry: readonly GeometryRegionSpec[];
    readonly mesh: MeshSpec;
    readonly materials: readonly MaterialDefinition[];
    readonly materialStates: readonly MaterialState[];
    readonly radiation: RadiationModelSpec;
    readonly hydro: HydroModelSpec;
    readonly temperatures: TemperatureModelSpec;
    readonly coupling: CouplingGraphSpec;
    readonly sources: readonly string[];
    readonly boundaryConditions: readonly string[];
    readonly diagnostics: DiagnosticsSpec;
    readonly criticality: CriticalitySpec;
    readonly run: SolverRunConfig;
}

export interface ExperimentSpec {
    readonly problem: PhysicsProblemSpec;
}

interface SolverCapabilityBase {
    readonly id: PhysicsSolverId;
    readonly name: string;
    readonly supportedFacets: readonly string[];
    readonly requiredInputs: readonly string[];
    readonly emittedOutputs: readonly string[];
}

export type SolverCapability = SolverCapabilityBase & (
    | { readonly status: "runnable"; readonly claimStatus: "solved" }
    | { readonly status: "gated"; readonly claimStatus: "gated" | "substrate" }
    | { readonly status: "placeholder"; readonly claimStatus: "validated-only" | "future-track" }
);

export const V1_SOLVER_CAPABILITIES: readonly SolverCapability[] = [
    runnable("mock-fields", "Mock Fields", ["rad-hydro-fields", "reporting"], [], ["field-dataset"]),
    runnable("gray-radiation-diffusion", "Gray Radiation Diffusion", ["rad-hydro-fields", "diffusion", "marshak-waves"], ["radiation", "opacity"], ["radiation-energy", "energy-diagnostics"]),
    runnable("eulerian-hydro", "Eulerian Hydro", ["material-state-fields", "shocks"], ["hydro", "eos"], ["hydro-state", "mass-energy-diagnostics"]),
    gated("multigroup-radiation-diffusion", "Multigroup Radiation Diffusion", ["diffusion", "multigroup-opacity"]),
    gated("discrete-ordinates", "Discrete Ordinates", ["radiation-angular-transport"]),
    gated("implicit-monte-carlo", "Implicit Monte Carlo", ["radiation-monte-carlo"]),
    gated("lagrangian-hydro", "Lagrangian Hydro", ["material-motion"]),
    gated("ale-hydro", "ALE Hydro", ["material-motion", "remap"]),
    gated("criticality-keff", "Criticality keff", ["criticality"]),
    gated("point-kinetics", "Point Kinetics", ["criticality", "kinetics"]),
    gated("depletion", "Depletion", ["composition-evolution"]),
    substrate("relativistic-multiphysics", "Relativistic Multiphysics", ["bssn-geometry", "valencia-hydrodynamics", "gray-m1-radiation", "matter-radiation-exchange", "packet-deposition", "single-block-diagnostics"]),
];

export interface ProductCapabilityClaim {
    readonly id: string;
    readonly name: string;
    readonly status: ProductCapabilityStatus;
    readonly summary: string;
}

export const PRODUCT_CAPABILITY_CLAIMS: readonly ProductCapabilityClaim[] = [
    claim("v1-deterministic-solvers", "V1 deterministic solver paths", "solved", "Mock fields, gray radiation diffusion, and Eulerian hydro remain runnable V1 product paths."),
    claim("relativistic-coupled-kernel-validation", "Relativistic coupled-kernel verification", "validated-only", "Controlled local and three-cell tests verify selected BSSN, Valencia, gray-M1, exchange, and packet-deposition invariants."),
    claim("relativistic-multiphysics-kernel", "Relativistic multiphysics kernel", "substrate", "Kernel building blocks exist for BSSN, Valencia hydrodynamics, gray-M1 radiation, exchange, packet deposition, and single-block diagnostics."),
    claim("relativistic-multiphysics-product-run", "Relativistic multiphysics product run", "gated", "Product execution is disabled and must return an unsupported diagnostic without partial physics output."),
    claim("relativistic-multiphysics-future-tracks", "Relativistic multiphysics future tracks", "future-track", "Strong-field production, primary Monte Carlo radiation, Berger-Oliger AMR, curvilinear charts, full GRMHD, tabulated EOS, TOV, Bondi/Michel, AMR convergence, and strong-field constraint preservation remain deferred."),
];

export type ValidationCategory =
    | "schema"
    | "units"
    | "physics"
    | "table-domain"
    | "coupling"
    | "solver"
    | "safety"
    | "result-staleness";

export interface PhysicsValidationDiagnostic {
    readonly level: "info" | "warning" | "error";
    readonly category: ValidationCategory;
    readonly code: string;
    readonly message: string;
    readonly entityId?: string;
    readonly materialId?: string;
    readonly solverId?: PhysicsSolverId;
}

export interface PhysicsValidationReport {
    readonly diagnostics: readonly PhysicsValidationDiagnostic[];
    readonly ok: boolean;
}

export interface ExperimentReportSection {
    readonly title: string;
    readonly status: ModelFacetStatus;
    readonly lines: readonly string[];
}

export interface ExperimentReport {
    readonly title: "Experiment";
    readonly fingerprint: string;
    readonly sections: readonly ExperimentReportSection[];
    readonly capabilityClaims: readonly ProductCapabilityClaim[];
    readonly validation: PhysicsValidationReport;
}

export function validatePhysicsProblem(problem: PhysicsProblemSpec): PhysicsValidationReport {
    const diagnostics: PhysicsValidationDiagnostic[] = [];

    if (problem.id.trim().length === 0 || problem.name.trim().length === 0) {
        diagnostics.push(error("schema", "physics.schema.identity", "Physics problem must have non-empty id and name."));
    }

    const solver = getSolverCapability(problem.run.solverId);
    if (!solver) {
        diagnostics.push(error("solver", "physics.solver.unknown", `Unknown solver "${problem.run.solverId}".`, problem.run.solverId));
    } else if (solver.status !== "runnable") {
        diagnostics.push({
            level: "error",
            category: "solver",
            code: solver.claimStatus === "substrate" ? "physics.solver.substrate" : "physics.solver.gated",
            message: solver.claimStatus === "substrate"
                ? `Solver "${solver.id}" has kernel substrate only; product execution is disabled and no partial physics result will be produced.`
                : `Solver "${solver.id}" is registered for V1 but not runnable yet.`,
            solverId: solver.id,
        });
    }

    for (const material of problem.materials) {
        if (material.composition.some((part) => !Number.isFinite(part.fraction) || part.fraction < 0)) {
            diagnostics.push(error("physics", "physics.material.composition.invalid", `Material "${material.name}" has an invalid composition fraction.`, undefined, material.id));
        }
        diagnostics.push(...validateTableUse(problem, material));
    }

    diagnostics.push(...validateCoupling(problem.coupling));

    if (problem.criticality.enabled || problem.criticality.fissileMaterialIds.length > 0 || problem.materials.some(isFissileMaterial)) {
        diagnostics.push({
            level: "warning",
            category: "safety",
            code: "physics.criticality.placeholder",
            message: "Criticality is represented as V1 placeholder diagnostics only; keff solving is not enabled.",
            solverId: problem.run.solverId,
        });
    }

    return {
        diagnostics,
        ok: diagnostics.every((diagnostic) => diagnostic.level !== "error"),
    };
}

export function createExperimentReport(experiment: ExperimentSpec): ExperimentReport {
    const problem = experiment.problem;
    return {
        title: "Experiment",
        fingerprint: fingerprintPhysicsProblem(problem),
        sections: [
            section("Geometry / Regions", "runnable", problem.geometry.map((region) => `${region.kind}: ${region.name}`)),
            section("Mesh / AMR blocks", "runnable", [`${problem.mesh.dimension} ${problem.mesh.cells.join("x")}`]),
            section("Materials / EOS / opacity", "runnable", problem.materials.map((material) => `${material.name}: ${material.eos.kind} / ${material.opacity.kind}`)),
            section("Radiation model", problem.radiation.mode === "gray-diffusion" ? "runnable" : "stubbed", [problem.radiation.mode]),
            section("Hydro model", problem.hydro.mode === "eulerian" ? "runnable" : "stubbed", [problem.hydro.mode]),
            section("Coupling strategy", "runnable", problem.coupling.nodes.map((node) => `${node.kind}: ${node.id}`)),
            section("Sources / drives", "stubbed", problem.sources),
            section("Boundary conditions", "stubbed", problem.boundaryConditions),
            section("Diagnostics / tallies / probes", "runnable", [...problem.diagnostics.probes, ...problem.diagnostics.tallies]),
            section("Solver run configuration", getSolverCapability(problem.run.solverId)?.status === "runnable" ? "runnable" : "gated", [problem.run.solverId]),
        ],
        capabilityClaims: PRODUCT_CAPABILITY_CLAIMS,
        validation: validatePhysicsProblem(problem),
    };
}

export function fingerprintPhysicsProblem(problem: PhysicsProblemSpec): string {
    return stableStringify({
        geometry: problem.geometry,
        mesh: problem.mesh,
        materials: problem.materials,
        materialStates: problem.materialStates,
        radiation: problem.radiation,
        hydro: problem.hydro,
        temperatures: problem.temperatures,
        coupling: problem.coupling,
        sources: problem.sources,
        boundaryConditions: problem.boundaryConditions,
        diagnostics: problem.diagnostics,
        criticality: problem.criticality,
        run: problem.run,
    });
}

export function isResultStale(currentProblem: PhysicsProblemSpec, resultFingerprint: string): boolean {
    return fingerprintPhysicsProblem(currentProblem) !== resultFingerprint;
}

export function getSolverCapability(id: PhysicsSolverId): SolverCapability | undefined {
    return V1_SOLVER_CAPABILITIES.find((solver) => solver.id === id);
}

function validateTableUse(problem: PhysicsProblemSpec, material: MaterialDefinition): readonly PhysicsValidationDiagnostic[] {
    const diagnostics: PhysicsValidationDiagnostic[] = [];
    const state = problem.materialStates.find((candidate) => candidate.materialId === material.id);
    if (!state) {
        diagnostics.push(error("physics", "physics.material.state.missing", `Material "${material.name}" has no material state.`, undefined, material.id));
        return diagnostics;
    }

    const tableRefs = [tableFromEos(material.eos), tableFromOpacity(material.opacity)].filter((table): table is TableRef => table !== undefined);
    for (const table of tableRefs) {
        if (state.density.value !== undefined && !withinDomain(state.density.value, table.domain.density)) {
            diagnostics.push(error("table-domain", "physics.table.density.outOfDomain", `Material "${material.name}" density is outside table "${table.id}" domain.`, undefined, material.id));
        }
        const temperature = state.electronTemperature?.value ?? state.ionTemperature?.value ?? state.radiationTemperature?.value;
        if (temperature !== undefined && !withinDomain(temperature, table.domain.temperature ?? table.domain.electronTemperature ?? table.domain.ionTemperature ?? table.domain.radiationTemperature)) {
            diagnostics.push(error("table-domain", "physics.table.temperature.outOfDomain", `Material "${material.name}" temperature is outside table "${table.id}" domain.`, undefined, material.id));
        }
    }
    return diagnostics;
}

function validateCoupling(coupling: CouplingGraphSpec): readonly PhysicsValidationDiagnostic[] {
    const diagnostics: PhysicsValidationDiagnostic[] = [];
    const nodeIds = new Set(coupling.nodes.map((node) => node.id));
    for (const edge of coupling.edges) {
        if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
            diagnostics.push(error("coupling", "physics.coupling.node.unresolved", `Coupling edge ${edge.from}.${edge.output} -> ${edge.to}.${edge.input} references a missing node.`));
        }
    }
    return diagnostics;
}

function runnable(id: PhysicsSolverId, name: string, facets: readonly string[], requiredInputs: readonly string[], emittedOutputs: readonly string[]): SolverCapability {
    return { id, name, status: "runnable", claimStatus: "solved", supportedFacets: facets, requiredInputs, emittedOutputs };
}

function gated(id: PhysicsSolverId, name: string, facets: readonly string[]): SolverCapability {
    return { id, name, status: "gated", claimStatus: "gated", supportedFacets: facets, requiredInputs: [], emittedOutputs: ["unsupported-diagnostic"] };
}

function substrate(id: PhysicsSolverId, name: string, facets: readonly string[]): SolverCapability {
    return { id, name, status: "gated", claimStatus: "substrate", supportedFacets: facets, requiredInputs: [], emittedOutputs: ["unsupported-diagnostic"] };
}

function claim(id: string, name: string, status: ProductCapabilityStatus, summary: string): ProductCapabilityClaim {
    return { id, name, status, summary };
}

function section(title: string, status: ModelFacetStatus, lines: readonly string[]): ExperimentReportSection {
    return { title, status, lines };
}

function isFissileMaterial(material: MaterialDefinition): boolean {
    return material.fissile === true || material.composition.some((part) => part.fissile === true);
}

function tableFromEos(eos: EOSRef): TableRef | undefined {
    return eos.kind === "table" ? eos.table : undefined;
}

function tableFromOpacity(opacity: OpacityRef): TableRef | undefined {
    return opacity.kind === "gray-table" || opacity.kind === "multigroup-table" ? opacity.table : undefined;
}

function withinDomain(value: number, range: readonly [number, number] | undefined): boolean {
    return range === undefined || (value >= range[0] && value <= range[1]);
}

function error(category: ValidationCategory, code: string, message: string, solverId?: PhysicsSolverId, materialId?: string): PhysicsValidationDiagnostic {
    return { level: "error", category, code, message, solverId, materialId };
}

function stableStringify(value: unknown): string {
    return JSON.stringify(sortForStableStringify(value));
}

function sortForStableStringify(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortForStableStringify);
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, entry]) => [key, sortForStableStringify(entry)]),
        );
    }
    return value;
}
