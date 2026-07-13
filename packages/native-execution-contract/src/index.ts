import type {
  TransportBackendDiagnostic,
  TransportBackendEvent,
} from "@transport/domain/transport/TransportBackendProtocol";
import type {TransportProblem, TransportRunId} from "@transport/domain/transport/TransportProblem";

export const NATIVE_EXECUTION_CONTRACT_VERSION = "2.0.0" as const;

export interface NativeExecutionRequest {
  readonly contractVersion: typeof NATIVE_EXECUTION_CONTRACT_VERSION;
  readonly runSessionId: TransportRunId;
  readonly problem: TransportProblem;
}

type NativeSessionEvent = Exclude<TransportBackendEvent, {readonly type: "backendMetadata"}> & {
  readonly runId: TransportRunId;
};

export type NativeExecutionEvent =
  | Extract<TransportBackendEvent, {readonly type: "backendMetadata"}>
  | NativeSessionEvent;

export interface NativeExecutionResponse {
  readonly contractVersion: typeof NATIVE_EXECUTION_CONTRACT_VERSION;
  readonly events: readonly NativeExecutionEvent[];
}

export function createNativeExecutionRequest(
  runSessionId: TransportRunId,
  problem: TransportProblem,
): NativeExecutionRequest {
  return {contractVersion: NATIVE_EXECUTION_CONTRACT_VERSION, runSessionId, problem};
}

export function parseNativeExecutionResponse(
  value: unknown,
  expectedRunSessionId?: TransportRunId,
): NativeExecutionResponse {
  if (!isRecord(value) || value.contractVersion !== NATIVE_EXECUTION_CONTRACT_VERSION) {
    const received = isRecord(value) && typeof value.contractVersion === "string"
      ? value.contractVersion
      : "missing";
    throw new Error(
      `Unsupported native execution contract version '${received}'; expected '${NATIVE_EXECUTION_CONTRACT_VERSION}'.`,
    );
  }
  if (!Array.isArray(value.events)) {
    throw new Error("Native execution response events must be an array.");
  }
  const events = value.events.map(parseNativeExecutionEvent);
  assertNativeExecutionSequence(events, expectedRunSessionId);
  return value as unknown as NativeExecutionResponse;
}

export function parseNativeExecutionEvent(value: unknown): NativeExecutionEvent {
  if (!isNativeExecutionEvent(value)) {
    throw new Error(
      `Unknown or invalid native execution event kind '${isRecord(value) ? String(value.type) : "missing"}'.`,
    );
  }
  return value as NativeExecutionEvent;
}

function assertNativeExecutionSequence(
  events: readonly NativeExecutionEvent[],
  expectedRunSessionId?: TransportRunId,
): void {
  if (events.length === 0) throw new Error("Native execution response must contain events.");
  if (expectedRunSessionId !== undefined) {
    for (const event of events) {
      if (event.type !== "backendMetadata" && event.runId !== expectedRunSessionId) {
        throw new Error(
          `Native execution event session '${event.runId}' does not match caller session '${expectedRunSessionId}'.`,
        );
      }
    }
  }
  if (events.length === 1 && events[0]?.type === "runFailed") return;
  if (events[0]?.type !== "backendMetadata"
    || events[1]?.type !== "problemAccepted"
    || events[2]?.type !== "runStarted") {
    throw new Error("Native execution response must begin with metadata, acceptance, and start events.");
  }
  const terminal = events.at(-1);
  if (terminal?.type !== "runCompleted" && terminal?.type !== "runFailed") {
    throw new Error("Native execution response must end with exactly one terminal event.");
  }
  for (const event of events.slice(3, -1)) {
    if (event.type !== "runProgress"
      && event.type !== "trackSamples"
      && event.type !== "tallyDelta"
      && event.type !== "diagnostic") {
      throw new Error(`Native execution event '${event.type}' is out of lifecycle order.`);
    }
  }
}

function isNativeExecutionEvent(event: unknown): boolean {
  if (!isRecord(event) || typeof event.type !== "string") return false;
  if (event.type !== "backendMetadata" && typeof event.runId !== "string") return false;
  switch (event.type) {
    case "backendMetadata":
      return isBackendMetadata(event.metadata);
    case "problemAccepted":
      return typeof event.problemId === "string"
        && Array.isArray(event.diagnostics)
        && event.diagnostics.every(isDiagnostic);
    case "runStarted":
      return typeof event.problemId === "string" && isProvenance(event.provenance);
    case "runProgress":
      return isNumber(event.completedHistories) && isNumber(event.totalHistories);
    case "trackSamples":
      return Array.isArray(event.samples) && event.samples.every(isTrackSample);
    case "tallyDelta":
      return isTallyDelta(event.delta);
    case "diagnostic":
    case "runFailed":
      return isDiagnostic(event.diagnostic);
    case "runCompleted":
      return isRunSummary(event.summary);
    default:
      return false;
  }
}

function isBackendMetadata(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.version === "string"
    && isRecord(value.capabilities)
    && isStringArray(value.capabilities.particles)
    && isStringArray(value.capabilities.geometry)
    && isStringArray(value.capabilities.sources)
    && isStringArray(value.capabilities.tallies)
    && Array.isArray(value.capabilities.lifecycle)
    && value.capabilities.lifecycle.every((item) => item === "submit" || item === "start")
    && isDataPolicy(value.capabilities.dataPolicy);
}

function isProvenance(value: unknown): boolean {
  return isRecord(value)
    && typeof value.backendId === "string"
    && typeof value.backendVersion === "string"
    && typeof value.problemId === "string"
    && isNumber(value.seed)
    && isDataPolicy(value.dataPolicy)
    && isStringArray(value.warnings);
}

function isRunSummary(value: unknown): boolean {
  return isRecord(value)
    && isNumber(value.completedHistories)
    && isNumber(value.totalHistories)
    && isNumber(value.sampledTrackCount)
    && isNumber(value.tallyCount)
    && Array.isArray(value.diagnostics)
    && value.diagnostics.every(isDiagnostic);
}

function isTrackSample(value: unknown): boolean {
  return isRecord(value)
    && typeof value.historyId === "string"
    && Array.isArray(value.events)
    && value.events.every((event) => isRecord(event)
      && typeof event.historyId === "string"
      && typeof event.particleId === "string"
      && isParticleEventType(event.type)
      && isVec3(event.position)
      && isVec3(event.direction)
      && isNumber(event.energyMeV)
      && isNumber(event.weight)
      && isNumber(event.time));
}

function isTallyDelta(value: unknown): boolean {
  return isRecord(value)
    && typeof value.tallyId === "string"
    && Array.isArray(value.scores)
    && value.scores.every(isNumber);
}

function isDiagnostic(value: unknown): value is TransportBackendDiagnostic {
  return isRecord(value)
    && (value.level === "info" || value.level === "warning" || value.level === "error")
    && typeof value.code === "string"
    && typeof value.message === "string";
}

function isVec3(value: unknown): boolean {
  return isRecord(value) && isNumber(value.x) && isNumber(value.y) && isNumber(value.z);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isDataPolicy(value: unknown): boolean {
  return value === "toy"
    || value === "simple-coefficients"
    || value === "hybrid-warning-mode"
    || value === "requires-data-packs";
}

function isParticleEventType(value: unknown): boolean {
  return value === "birth"
    || value === "move"
    || value === "boundary-crossing"
    || value === "scatter"
    || value === "absorb"
    || value === "escape"
    || value === "detector-hit"
    || value === "error-lost";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
