import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import type {TransportBackendEvent, TransportBackendMetadata} from "@transport/domain";
import type {NativePhotonSmokeBridge} from "@transport/transport-worker";
import {StudioApp} from "./StudioApp";

const mocks = vi.hoisted(() => {
    const nativeBackendMetadata: TransportBackendMetadata = {
        id: "native-rust-photon-smoke",
        name: "Native Rust photon smoke backend",
        version: "test",
        capabilities: {
            particles: ["photon"],
            geometry: ["box"],
            sources: ["pencil-beam"],
            tallies: ["detector-hit"],
            lifecycle: ["submit", "start"],
            dataPolicy: "hybrid-warning-mode"
        }
    };
    const transform = {
        position: {x: 0, y: 0, z: 0},
        rotationEuler: {x: 0, y: 0, z: 0},
        scale: {x: 1, y: 1, z: 1}
    };
    const project = {
        id: "project-1",
        name: "Mock Project",
        scene: {
            entities: [
                {
                    id: "source-1",
                    name: "Photon Source",
                    kind: "source",
                    tags: [],
                    visible: true,
                    locked: false,
                    transform: {...transform, position: {x: -4, y: 0, z: 0}},
                    sourceKind: "pencil-beam",
                    particleType: "photon",
                    energy: 1,
                    strength: 1,
                    direction: {x: 1, y: 0, z: 0}
                },
                {
                    id: "shield-1",
                    name: "Shield Slab",
                    kind: "geometry",
                    tags: [],
                    visible: true,
                    locked: false,
                    transform,
                    primitive: "box",
                    materialId: "water-1",
                    parameters: {width: 1, height: 2, depth: 3}
                },
                {
                    id: "water-1",
                    name: "Water Moderator",
                    kind: "material",
                    tags: [],
                    visible: true,
                    locked: false,
                    transform,
                    color: "#38bdf8",
                    attenuationCoefficient: 1,
                    scatterProbability: 0.2,
                    absorptionProbability: 0.8,
                    anisotropy: 0
                },
                {
                    id: "dose-1",
                    name: "Dose Tally",
                    kind: "tally",
                    tags: [],
                    visible: true,
                    locked: false,
                    transform,
                    tallyKind: "detector-hit",
                    particleTypes: ["photon"],
                    bins: [1, 1, 1]
                }
            ]
        },
        runConfiguration: {
            particleTypes: ["photon"],
            histories: 4,
            batchSize: 2,
            seed: 314159,
            backend: "visual-ts",
            visibleHistoryBudget: 4
        }
    };

    const tracks = [
        {id: "track-escape", events: [{type: "birth"}, {type: "scatter"}, {type: "escape"}]},
        {id: "track-absorb", events: [{type: "birth"}, {type: "scatter"}, {type: "absorb"}]},
        {id: "track-scatter", events: [{type: "birth"}, {type: "scatter"}]},
        {id: "track-empty", events: []}
    ];
    const nativeBridgeUnavailableEvents: readonly TransportBackendEvent[] = [
        {type: "backendMetadata", metadata: nativeBackendMetadata},
        {
            type: "runFailed",
            runId: "native-314159",
            diagnostic: {
                level: "error",
                code: "native.bridge.unavailable",
                message: "Native Rust photon backend bridge is not available in this runtime."
            }
        }
    ];
    const runNativePhotonSmokeBackend = vi.fn<
        (problem: unknown, bridge?: NativePhotonSmokeBridge) => Promise<readonly TransportBackendEvent[]>
    >(async () => nativeBridgeUnavailableEvents);
    const createTauriNativePhotonSmokeBridge = vi.fn<() => NativePhotonSmokeBridge | undefined>(() => undefined);

    return {
        nativeBackendMetadata,
        nativeBridgeUnavailableEvents,
        project,
        tracks,
        createInitialProject: vi.fn(() => project),
        createNativePhotonSmokeFixtureProblem: vi.fn(() => ({
            id: "fixture-photon-shielding",
            settings: {
                histories: 16,
                seed: 1337
            }
        })),
        compileEditorScene: vi.fn<(scene: unknown) => {
            ok: true;
            value: {
                id: string;
                settings: {
                    histories: number;
                    seed: number;
                };
            };
            diagnostics: [];
        }>(() => ({
            ok: true,
            value: {
                id: "compiled-current-scene",
                settings: {
                    histories: 4,
                    seed: 314159
                }
            },
            diagnostics: []
        })),
        runNativePhotonSmokeBackend,
        createTauriNativePhotonSmokeBridge,
        runToyPhotonTransport: vi.fn(() => ({tracks})),
        validateProject: vi.fn(() => [
            {id: "diagnostic-1", severity: "info", message: "Mock diagnostic"}
        ])
    };
});

vi.mock("./createInitialProject", () => ({
    createInitialProject: mocks.createInitialProject
}));

vi.mock("@transport/transport-visual", () => ({
    runToyPhotonTransport: mocks.runToyPhotonTransport
}));

vi.mock("@transport/transport-worker", () => ({
    createNativePhotonSmokeFixtureProblem: mocks.createNativePhotonSmokeFixtureProblem,
    runNativePhotonSmokeBackend: mocks.runNativePhotonSmokeBackend
}));

vi.mock("./nativePhotonSmokeTauriBridge", () => ({
    createTauriNativePhotonSmokeBridge: mocks.createTauriNativePhotonSmokeBridge
}));

vi.mock("@transport/domain/compile/CompileEditorScene", () => ({
    compileEditorScene: mocks.compileEditorScene
}));

vi.mock("@transport/validation", () => ({
    validateProject: mocks.validateProject
}));

function ProjectTreeMock(props: {
    project: {
        scene: {
            entities: readonly {
                id: string;
                visible: boolean;
                includedInCompile?: boolean;
            }[];
        };
    };
    selectedEntityId?: string;
    onSelect: (id: string) => void;
    onSetEntityVisible: (id: string, visible: boolean) => void;
    onSetEntityIncludedInCompile: (id: string, includedInCompile: boolean) => void;
    stats: { geometry: number; materials: number; sources: number; tallies: number };
}) {
    const shield = props.project.scene.entities.find((entity) => entity.id === "shield-1");

    return (
        <section aria-label="Project tree">
            <h2>Project tree</h2>
            <p>tree selected entity: {props.selectedEntityId ?? "none"}</p>
            <p>tree shield visible: {String(shield?.visible ?? false)}</p>
            <p>tree shield included: {String(shield?.includedInCompile ?? true)}</p>
            <p>
                scene
                stats: {props.stats.geometry} geometry, {props.stats.materials} materials, {props.stats.sources} sources, {props.stats.tallies} tallies
            </p>
            <button type="button" onClick={() => props.onSelect("water-1")}>Select Water Moderator</button>
            <button type="button" onClick={() => props.onSelect("dose-1")}>Select Dose Tally</button>
            <button type="button" onClick={() => props.onSetEntityVisible("shield-1", false)}>Hide Shield Slab</button>
            <button type="button" onClick={() => props.onSetEntityIncludedInCompile("shield-1", false)}>Exclude Shield Slab</button>
        </section>
    );
}

vi.mock("../panels/ProjectTree", () => ({
    ProjectTree: ProjectTreeMock
}));

vi.mock("../components/project-tree/ProjectTree", () => ({
    ProjectTree: ProjectTreeMock
}));

vi.mock("../components/style-selector/StyleSelectorBoundary", () => ({
    StyleSelectorBoundary: () => <label>Style Pack<select><option>Default</option></select></label>
}));

vi.mock("../panels/InspectorPanel", () => ({
    InspectorPanel: (props: {
        entity?: { name: string };
        diagnostics: readonly unknown[];
        tracks: readonly unknown[]
    }) => (
        <section aria-label="Inspector panel">
            <h2>Inspector panel</h2>
            <p>inspector entity: {props.entity?.name ?? "none"}</p>
            <p>inspector diagnostics: {props.diagnostics.length}</p>
            <p>inspector tracks: {props.tracks.length}</p>
        </section>
    )
}));

vi.mock("../panels/RunPanel", () => ({
    RunPanel: (props: {
        activeTab: string;
        onTabChange: (tab: "run" | "tallies" | "tracks" | "diagnostics" | "console") => void;
        config: { backend: string };
        tracks: readonly unknown[];
        diagnostics: readonly { message: string }[];
        sceneStats: { geometry: number; materials: number; sources: number; tallies: number };
    }) => (
        <section aria-label="Run panel">
            <h2>Run panel</h2>
            <p>active run tab: {props.activeTab}</p>
            <p>run panel backend: {props.config.backend}</p>
            <p>run panel tracks: {props.tracks.length}</p>
            <p>run panel diagnostics: {props.diagnostics.length}</p>
            {props.diagnostics.map((diagnostic) => <p key={diagnostic.message}>{diagnostic.message}</p>)}
            <p>run panel scene
                stats: {props.sceneStats.geometry}/{props.sceneStats.materials}/{props.sceneStats.sources}/{props.sceneStats.tallies}</p>
            <button type="button" onClick={() => props.onTabChange("tracks")}>Open Tracks Tab</button>
            <button type="button" onClick={() => props.onTabChange("diagnostics")}>Open Diagnostics Tab</button>
        </section>
    )
}));

vi.mock("../viewport/TransportViewport", () => ({
    TransportViewport: (props: {
        tracks: readonly unknown[];
        selectedEntityId?: string;
        showTallies: boolean;
        showDiagnostics: boolean;
        mode: string;
    }) => (
        <section aria-label="Transport viewport">
            <h2>Transport viewport</h2>
            <p>viewport mode: {props.mode}</p>
            <p>viewport selected entity: {props.selectedEntityId ?? "none"}</p>
            <p>viewport tracks: {props.tracks.length}</p>
            <p>viewport tallies visible: {String(props.showTallies)}</p>
            <p>viewport diagnostics visible: {String(props.showDiagnostics)}</p>
        </section>
    )
}));

describe("StudioApp spec", () => {
    beforeEach(() => {
        mocks.createInitialProject.mockClear();
        mocks.createNativePhotonSmokeFixtureProblem.mockClear();
        mocks.compileEditorScene.mockClear();
        mocks.runNativePhotonSmokeBackend.mockClear();
        mocks.createTauriNativePhotonSmokeBridge.mockClear();
        mocks.runToyPhotonTransport.mockClear();
        mocks.validateProject.mockClear();
        mocks.runNativePhotonSmokeBackend.mockResolvedValue(mocks.nativeBridgeUnavailableEvents);
        mocks.createTauriNativePhotonSmokeBridge.mockReturnValue(undefined);
    });

    it("opens as a visual Monte Carlo workbench with a default project, selected entity, and empty run state", () => {
        render(<StudioApp/>);

        expect(screen.getByText("Transport Studio")).toBeTruthy();
        expect(screen.getByText("visual Monte Carlo workbench")).toBeTruthy();
        expect(screen.getByText("DESIGN MODE")).toBeTruthy();
        expect(screen.getByText("Shield Slab")).toBeTruthy();
        expect(screen.getByText("0 sampled tracks · 0 escaped · 0 absorbed")).toBeTruthy();

        expect(screen.getByRole("region", {name: "Project tree"})).toBeTruthy();
        expect(screen.getByRole("region", {name: "Transport viewport"})).toBeTruthy();
        expect(screen.getByRole("region", {name: "Inspector panel"})).toBeTruthy();
        expect(screen.getByRole("region", {name: "Run panel"})).toBeTruthy();

        expect(screen.getByText("tree selected entity: shield-1")).toBeTruthy();
        expect(screen.getByText("viewport selected entity: shield-1")).toBeTruthy();
        expect(screen.getByText("inspector entity: Shield Slab")).toBeTruthy();
        expect(screen.getByText("scene stats: 1 geometry, 1 materials, 1 sources, 1 tallies")).toBeTruthy();
        expect(screen.getByText("run panel scene stats: 1/1/1/1")).toBeTruthy();
        expect(screen.getByText("inspector diagnostics: 1")).toBeTruthy();

        expect(mocks.createInitialProject).toHaveBeenCalledTimes(1);
        expect(mocks.validateProject).toHaveBeenCalledWith(mocks.project);
        expect(mocks.runToyPhotonTransport).not.toHaveBeenCalled();
    });

    it("lets the user change work modes without running the transport simulation", () => {
        render(<StudioApp/>);

        fireEvent.click(screen.getByRole("button", {name: "probe"}));
        expect(screen.getByText("PROBE MODE")).toBeTruthy();
        expect(screen.getByText("viewport mode: probe")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", {name: "analyze"}));
        expect(screen.getByText("ANALYZE MODE")).toBeTruthy();
        expect(screen.getByText("viewport mode: analyze")).toBeTruthy();

        expect(mocks.runToyPhotonTransport).not.toHaveBeenCalled();
    });

    it("keeps entity selection synchronized between the project tree, viewport, inspector, and title HUD", () => {
        render(<StudioApp/>);

        fireEvent.click(screen.getByRole("button", {name: "Select Water Moderator"}));

        expect(screen.getByText("Water Moderator")).toBeTruthy();
        expect(screen.getByText("tree selected entity: water-1")).toBeTruthy();
        expect(screen.getByText("viewport selected entity: water-1")).toBeTruthy();
        expect(screen.getByText("inspector entity: Water Moderator")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", {name: "Select Dose Tally"}));

        expect(screen.getByText("Dose Tally")).toBeTruthy();
        expect(screen.getByText("tree selected entity: dose-1")).toBeTruthy();
        expect(screen.getByText("viewport selected entity: dose-1")).toBeTruthy();
        expect(screen.getByText("inspector entity: Dose Tally")).toBeTruthy();
    });

    it("runs the toy photon simulation, enters run mode, and summarizes terminal track outcomes", () => {
        render(<StudioApp/>);

        fireEvent.click(screen.getByRole("button", {name: "▶ Run Toy Photons"}));

        expect(mocks.runToyPhotonTransport).toHaveBeenCalledTimes(1);
        expect(mocks.runToyPhotonTransport).toHaveBeenCalledWith(mocks.project, mocks.project.runConfiguration);
        expect(screen.getByText("RUN MODE")).toBeTruthy();
        expect(screen.getByText("viewport mode: run")).toBeTruthy();
        expect(screen.getByText("active run tab: run")).toBeTruthy();
        expect(screen.getByText("4 sampled tracks · 1 escaped · 1 absorbed")).toBeTruthy();
        expect(screen.getByText("viewport tracks: 4")).toBeTruthy();
        expect(screen.getByText("inspector tracks: 4")).toBeTruthy();
        expect(screen.getByText("run panel tracks: 4")).toBeTruthy();
        expect(screen.getByText("run panel backend: visual-ts")).toBeTruthy();
    });

    it("wires the native action to the compiled current scene and reports bridge diagnostics", async () => {
        render(<StudioApp/>);

        fireEvent.click(screen.getByRole("button", {name: "Run Native Rust"}));

        await waitFor(() => expect(mocks.runNativePhotonSmokeBackend).toHaveBeenCalledTimes(1));
        expect(mocks.createNativePhotonSmokeFixtureProblem).not.toHaveBeenCalled();
        expect(mocks.compileEditorScene).toHaveBeenCalledTimes(1);
        expect(mocks.createTauriNativePhotonSmokeBridge).toHaveBeenCalledTimes(1);
        expect(mocks.runNativePhotonSmokeBackend).toHaveBeenCalledWith({
            id: "compiled-current-scene",
            settings: {
                histories: 4,
                seed: 314159
            }
        }, undefined);
        expect(screen.getByText("RUN MODE")).toBeTruthy();
        expect(screen.getByText("active run tab: diagnostics")).toBeTruthy();
        expect(screen.getByText("run panel backend: native")).toBeTruthy();
        expect(screen.getByText("run panel tracks: 0")).toBeTruthy();
        expect(screen.getByText("run panel diagnostics: 2")).toBeTruthy();
        expect(screen.getByText("native.bridge.unavailable: Native Rust photon backend bridge is not available in this runtime.")).toBeTruthy();
    });

    it("keeps viewport visibility independent from compiled problem inclusion for native compilation", async () => {
        render(<StudioApp/>);

        fireEvent.click(screen.getByRole("button", {name: "Hide Shield Slab"}));
        fireEvent.click(screen.getByRole("button", {name: "Run Native Rust"}));

        await waitFor(() => expect(mocks.compileEditorScene).toHaveBeenCalledTimes(1));
        expect(mocks.compileEditorScene.mock.calls[0]?.[0]).toMatchObject({
            entities: [
                {
                    id: "shield-1",
                    visible: false,
                    includedInCompile: true
                }
            ]
        });

        fireEvent.click(screen.getByRole("button", {name: "Exclude Shield Slab"}));
        fireEvent.click(screen.getByRole("button", {name: "Run Native Rust"}));

        await waitFor(() => expect(mocks.compileEditorScene).toHaveBeenCalledTimes(2));
        expect(mocks.compileEditorScene.mock.calls[1]?.[0]).toMatchObject({
            entities: [
                {
                    id: "shield-1",
                    visible: false,
                    includedInCompile: false
                }
            ]
        });
    });

    it("renders native Rust tracks and warning diagnostics when the Tauri bridge succeeds", async () => {
        const bridge = {runPhotonSmoke: vi.fn()};
        mocks.createTauriNativePhotonSmokeBridge.mockReturnValue(bridge);
        mocks.runNativePhotonSmokeBackend.mockResolvedValue([
            {type: "backendMetadata", metadata: mocks.nativeBackendMetadata},
            {
                type: "problemAccepted",
                problemId: "compiled-current-scene",
                diagnostics: [
                    {
                        level: "warning",
                        code: "physics_data.simple_coefficients",
                        message: "Native photon backend used simple coefficients because tabular cross-section data was not supplied."
                    }
                ]
            },
            {
                type: "trackSamples",
                runId: "native-314159",
                samples: [
                    {
                        historyId: "h-0",
                        events: [
                            {
                                historyId: "h-0",
                                particleId: "p-0",
                                type: "birth",
                                position: {x: -4, y: 0, z: 0},
                                direction: {x: 1, y: 0, z: 0},
                                energyMeV: 1,
                                weight: 1,
                                time: 0,
                                reason: "native photon birth"
                            },
                            {
                                historyId: "h-0",
                                particleId: "p-0",
                                type: "absorb",
                                position: {x: 0, y: 0, z: 0},
                                direction: {x: 1, y: 0, z: 0},
                                energyMeV: 1,
                                weight: 1,
                                time: 0,
                                materialId: "water-1",
                                entityId: "shield-1",
                                reason: "sampled absorption"
                            }
                        ]
                    }
                ]
            },
            {
                type: "runCompleted",
                runId: "native-314159",
                summary: {
                    completedHistories: 4,
                    totalHistories: 4,
                    sampledTrackCount: 1,
                    tallyCount: 1,
                    diagnostics: []
                }
            }
        ] satisfies readonly TransportBackendEvent[]);
        render(<StudioApp/>);

        fireEvent.click(screen.getByRole("button", {name: "Run Native Rust"}));

        await waitFor(() => expect(screen.getByText("run panel tracks: 1")).toBeTruthy());
        expect(mocks.runNativePhotonSmokeBackend).toHaveBeenCalledWith({
            id: "compiled-current-scene",
            settings: {
                histories: 4,
                seed: 314159
            }
        }, bridge);
        expect(screen.getByText("run panel backend: native")).toBeTruthy();
        expect(screen.getByText("run panel diagnostics: 2")).toBeTruthy();
        expect(screen.getByText("physics_data.simple_coefficients: Native photon backend used simple coefficients because tabular cross-section data was not supplied.")).toBeTruthy();
        expect(screen.getByText("1 sampled tracks · 0 escaped · 1 absorbed")).toBeTruthy();
        expect(screen.getByText("active run tab: run")).toBeTruthy();
    });

    it("lets the user inspect run-panel tabs without rerunning transport", () => {
        render(<StudioApp/>);

        fireEvent.click(screen.getByRole("button", {name: "▶ Run Toy Photons"}));
        fireEvent.click(screen.getByRole("button", {name: "Open Tracks Tab"}));

        expect(screen.getByText("active run tab: tracks")).toBeTruthy();
        expect(mocks.runToyPhotonTransport).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole("button", {name: "Open Diagnostics Tab"}));

        expect(screen.getByText("active run tab: diagnostics")).toBeTruthy();
        expect(mocks.runToyPhotonTransport).toHaveBeenCalledTimes(1);
    });

    it("lets the user hide viewport overlays without losing the underlying run results", () => {
        render(<StudioApp/>);

        fireEvent.click(screen.getByRole("button", {name: "▶ Run Toy Photons"}));
        expect(screen.getByText("viewport tracks: 4")).toBeTruthy();
        expect(screen.getByText("viewport tallies visible: true")).toBeTruthy();
        expect(screen.getByText("viewport diagnostics visible: true")).toBeTruthy();

        fireEvent.click(screen.getByRole("checkbox", {name: "Tracks"}));
        fireEvent.click(screen.getByRole("checkbox", {name: "Tallies"}));
        fireEvent.click(screen.getByRole("checkbox", {name: "Diagnostics"}));

        expect(screen.getByText("viewport tracks: 0")).toBeTruthy();
        expect(screen.getByText("viewport tallies visible: false")).toBeTruthy();
        expect(screen.getByText("viewport diagnostics visible: false")).toBeTruthy();
        expect(screen.getByText("inspector tracks: 4")).toBeTruthy();
        expect(screen.getByText("run panel tracks: 4")).toBeTruthy();
        expect(screen.getByText("4 sampled tracks · 1 escaped · 1 absorbed")).toBeTruthy();
    });

    it("clears run results and returns the bottom panel to the run tab", () => {
        render(<StudioApp/>);

        fireEvent.click(screen.getByRole("button", {name: "▶ Run Toy Photons"}));
        fireEvent.click(screen.getByRole("button", {name: "Open Tracks Tab"}));
        expect(screen.getByText("active run tab: tracks")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", {name: "Clear"}));

        expect(screen.getByText("0 sampled tracks · 0 escaped · 0 absorbed")).toBeTruthy();
        expect(screen.getByText("viewport tracks: 0")).toBeTruthy();
        expect(screen.getByText("inspector tracks: 0")).toBeTruthy();
        expect(screen.getByText("run panel tracks: 0")).toBeTruthy();
        expect(screen.getByText("active run tab: run")).toBeTruthy();
    });
});
