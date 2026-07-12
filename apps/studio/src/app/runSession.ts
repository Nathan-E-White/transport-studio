import type {
    Diagnostic,
    Project,
    TrackSample,
    TransportBackendDiagnostic,
    TransportBackendEvent,
    TransportTrackSample,
} from "@transport/domain";
import {
    type CompileDiagnostic,
    type CompileResult,
} from "@transport/domain/compile/CompileTransportProblem";
import type {TransportProblem} from "@transport/domain/transport/TransportProblem";
import {
    runNativePhotonSmokeBackend,
    type NativePhotonSmokeBridge,
} from "@transport/transport-worker";
import {runToyPhotonTransport} from "@transport/transport-visual";

export type RunSessionBottomTab = "run" | "diagnostics";
export type RunSessionMode = "design" | "probe" | "run" | "analyze" | "debug";

export interface RunSessionOutcome {
    readonly backend: Project["runConfiguration"]["backend"];
    readonly mode: RunSessionMode;
    readonly bottomTab: RunSessionBottomTab;
    readonly tracks: readonly TrackSample[];
    readonly diagnostics: readonly Diagnostic[];
}

export interface NativeRunSessionDependencies {
    readonly runBackend?: (
        problem: TransportProblem,
        bridge?: NativePhotonSmokeBridge,
    ) => Promise<readonly TransportBackendEvent[]>;
}

export interface ToyRunSessionDependencies {
    readonly runToy?: typeof runToyPhotonTransport;
}

export function runToySession(
    project: Project,
    dependencies: ToyRunSessionDependencies = {},
): RunSessionOutcome {
    const result = (dependencies.runToy ?? runToyPhotonTransport)(project, project.runConfiguration);

    return {
        backend: "visual-ts",
        mode: "run",
        bottomTab: "run",
        tracks: result.tracks,
        diagnostics: [],
    };
}

export function clearRunSession(
    current: Pick<RunSessionOutcome, "backend" | "mode">,
): RunSessionOutcome {
    return {
        backend: current.backend,
        mode: current.mode,
        bottomTab: "run",
        tracks: [],
        diagnostics: [],
    };
}

export async function runNativeSession(
    compileResult: CompileResult<TransportProblem>,
    bridge?: NativePhotonSmokeBridge,
    dependencies: NativeRunSessionDependencies = {},
): Promise<RunSessionOutcome> {
    const runBackend = dependencies.runBackend ?? runNativePhotonSmokeBackend;
    const compileDiagnostics = compileResult.diagnostics.map(convertCompileDiagnostic);

    if (!compileResult.ok || !compileResult.value) {
        return nativeOutcome([], compileDiagnostics);
    }

    const events = await runBackend(compileResult.value, bridge);
    const tracks = events.flatMap((event) => event.type === "trackSamples"
        ? event.samples.map(convertTransportTrackSample)
        : []);
    const diagnostics = [...compileDiagnostics, ...collectNativeDiagnostics(events)];

    return nativeOutcome(tracks, diagnostics);
}

function nativeOutcome(
    tracks: readonly TrackSample[],
    diagnostics: readonly Diagnostic[],
): RunSessionOutcome {
    return {
        backend: "native",
        mode: "run",
        bottomTab: diagnostics.some((diagnostic) => diagnostic.severity === "error")
            ? "diagnostics"
            : "run",
        tracks,
        diagnostics,
    };
}

function convertCompileDiagnostic(diagnostic: CompileDiagnostic): Diagnostic {
    return {
        severity: diagnostic.level,
        message: `${diagnostic.code}: ${diagnostic.message}`,
        entityId: diagnostic.entityId as Diagnostic["entityId"],
    };
}

function collectNativeDiagnostics(events: readonly TransportBackendEvent[]): readonly Diagnostic[] {
    return events.flatMap((event) => {
        switch (event.type) {
            case "problemAccepted":
                return event.diagnostics.map(convertBackendDiagnostic);
            case "diagnostic":
            case "runFailed":
                return [convertBackendDiagnostic(event.diagnostic)];
            default:
                return [];
        }
    });
}

function convertBackendDiagnostic(diagnostic: TransportBackendDiagnostic): Diagnostic {
    return {
        severity: diagnostic.level,
        message: `${diagnostic.code}: ${diagnostic.message}`,
        entityId: diagnostic.entityId as Diagnostic["entityId"],
    };
}

function convertTransportTrackSample(sample: TransportTrackSample): TrackSample {
    return {
        historyId: sample.historyId,
        events: sample.events.map((event) => ({
            historyId: event.historyId,
            particleId: event.particleId,
            type: event.type,
            position: event.position,
            direction: event.direction,
            energy: event.energyMeV,
            weight: event.weight,
            time: event.time,
            materialId: event.materialId,
            regionId: event.entityId,
            reason: event.reason,
        })) as TrackSample["events"],
    };
}
