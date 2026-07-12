import type {TransportBackendEvent, TransportBackendDiagnostic} from "@transport/domain";
import type {TransportProblem} from "@transport/domain/transport/TransportProblem";

export const NATIVE_EXECUTION_CONTRACT_VERSION = "1.0.0" as const;

export interface NativeExecutionRequest {
  readonly contractVersion: typeof NATIVE_EXECUTION_CONTRACT_VERSION;
  readonly problem: TransportProblem;
}

export interface NativePhotonSmokePayload {
  readonly runId: string;
  readonly tracks: readonly import("@transport/domain").TransportTrackSample[];
  readonly tallyDeltas: readonly import("@transport/domain").TransportTallyDelta[];
  readonly diagnostics: readonly TransportBackendDiagnostic[];
  readonly completedHistories: number;
  readonly totalHistories: number;
  readonly warnings: readonly string[];
}

export interface NativeExecutionSuccess {
  readonly contractVersion: typeof NATIVE_EXECUTION_CONTRACT_VERSION;
  readonly payload: NativePhotonSmokePayload;
}

export interface NativeExecutionFailure {
  readonly contractVersion: typeof NATIVE_EXECUTION_CONTRACT_VERSION;
  readonly code: "native.contract.version_mismatch" | "native.contract.invalid_request";
  readonly message: string;
}

export function createNativeExecutionRequest(problem: TransportProblem): NativeExecutionRequest {
  return {contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION, problem};
}

export function parseNativeExecutionSuccess(value: unknown): NativeExecutionSuccess {
  if (!isRecord(value) || value.contractVersion !== NATIVE_EXECUTION_CONTRACT_VERSION) {
    const received = isRecord(value) && typeof value.contractVersion === "string"
      ? value.contractVersion
      : "missing";
    throw new Error(`Unsupported native execution contract version '${received}'; expected '${NATIVE_EXECUTION_CONTRACT_VERSION}'.`);
  }
  if (!isNativePhotonSmokePayload(value.payload)) {
    throw new Error("Native execution response payload is invalid.");
  }
  return value as unknown as NativeExecutionSuccess;
}

export function parseNativeExecutionFailure(value: unknown): NativeExecutionFailure {
  if (!isRecord(value)
    || value.contractVersion !== NATIVE_EXECUTION_CONTRACT_VERSION
    || (value.code !== "native.contract.version_mismatch" && value.code !== "native.contract.invalid_request")
    || typeof value.message !== "string") {
    throw new Error("Native execution failure payload is invalid.");
  }
  return value as unknown as NativeExecutionFailure;
}

export function parseNativeBackendEvents(value: unknown): readonly TransportBackendEvent[] {
  if (!Array.isArray(value)) throw new Error("Native backend events must be an array.");
  for (const event of value) {
    if (!isBackendEvent(event)) {
      throw new Error(`Unknown native backend event kind '${isRecord(event) ? String(event.type) : "missing"}'.`);
    }
  }
  return value as readonly TransportBackendEvent[];
}

function isBackendEvent(event: unknown): boolean {
  if (!isRecord(event) || typeof event.type !== "string") return false;
  switch (event.type) {
    case "backendMetadata":
      return isRecord(event.metadata) && typeof event.metadata.id === "string";
    case "problemAccepted":
      return typeof event.problemId === "string" && Array.isArray(event.diagnostics) && event.diagnostics.every(isDiagnostic);
    case "runStarted":
      return typeof event.runId === "string" && typeof event.problemId === "string" && isRecord(event.provenance);
    case "runProgress":
      return typeof event.runId === "string" && typeof event.completedHistories === "number" && typeof event.totalHistories === "number";
    case "trackSamples":
      return typeof event.runId === "string" && Array.isArray(event.samples) && event.samples.every(isTrackSample);
    case "tallyDelta":
      return typeof event.runId === "string" && isTallyDelta(event.delta);
    case "diagnostic":
    case "runFailed":
      return (event.runId === undefined || typeof event.runId === "string") && isDiagnostic(event.diagnostic);
    case "runCompleted":
      return typeof event.runId === "string" && isRecord(event.summary)
        && typeof event.summary.completedHistories === "number"
        && typeof event.summary.totalHistories === "number";
    default:
      return false;
  }
}

function isNativePhotonSmokePayload(value: unknown): boolean {
  return isRecord(value)
    && typeof value.runId === "string"
    && Array.isArray(value.tracks) && value.tracks.every(isTrackSample)
    && Array.isArray(value.tallyDeltas) && value.tallyDeltas.every(isTallyDelta)
    && Array.isArray(value.diagnostics) && value.diagnostics.every(isDiagnostic)
    && typeof value.completedHistories === "number"
    && typeof value.totalHistories === "number"
    && Array.isArray(value.warnings) && value.warnings.every((warning) => typeof warning === "string");
}

function isTrackSample(value: unknown): boolean {
  return isRecord(value)
    && typeof value.historyId === "string"
    && Array.isArray(value.events)
    && value.events.every((event) => isRecord(event)
      && typeof event.historyId === "string"
      && typeof event.particleId === "string"
      && typeof event.type === "string"
      && isVec3(event.position)
      && isVec3(event.direction)
      && typeof event.energyMeV === "number"
      && typeof event.weight === "number"
      && typeof event.time === "number");
}

function isTallyDelta(value: unknown): boolean {
  return isRecord(value)
    && typeof value.tallyId === "string"
    && Array.isArray(value.scores)
    && value.scores.every((score) => typeof score === "number");
}

function isDiagnostic(value: unknown): boolean {
  return isRecord(value)
    && (value.level === "info" || value.level === "warning" || value.level === "error")
    && typeof value.code === "string"
    && typeof value.message === "string";
}

function isVec3(value: unknown): boolean {
  return isRecord(value)
    && typeof value.x === "number"
    && typeof value.y === "number"
    && typeof value.z === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
