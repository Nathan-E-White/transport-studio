import type {Diagnostic, SceneEntity, TransportTallyDelta} from "@transport/domain";

export const MAX_RENDERABLE_TALLY_CELLS = 4_096;

export interface TallyResultCell {
  readonly value: number;
  readonly intensity: number;
  readonly sign: "negative" | "zero" | "positive";
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
}

export type TallyResultPresentation =
  | {readonly status: "inactive"}
  | {readonly status: "diagnostic"; readonly diagnostic: Diagnostic}
  | {
      readonly status: "ready";
      readonly kind: "statistical-tally-result";
      readonly tallyId: string;
      readonly label: string;
      readonly accessibleLabel: string;
      readonly cells: readonly TallyResultCell[];
    };

export function createTallyResultPresentation(
  selectedEntity: SceneEntity | undefined,
  results: readonly TransportTallyDelta[],
  resultDiagnostics: readonly Diagnostic[] = [],
): TallyResultPresentation {
  if (!selectedEntity || selectedEntity.kind !== "tally") return {status: "inactive"};
  const result = results.find((candidate) => candidate.tallyId === selectedEntity.id);
  if (!result) {
    const suppression = resultDiagnostics.find((item) => item.entityId === selectedEntity.id && item.code?.startsWith("run.tally."));
    return suppression
      ? {status: "diagnostic", diagnostic: suppression}
      : diagnostic("info", "tally.result.missing", `No statistical result is available yet for “${selectedEntity.name}”.`, selectedEntity.id);
  }
  if (result.scores.some((score) => !Number.isFinite(score))) {
    return diagnostic("warning", "tally.result.values.invalid", `The result for “${selectedEntity.name}” contains non-finite values and cannot be rendered.`, selectedEntity.id);
  }

  if (!selectedEntity.bins) {
    if (result.scores.length !== 1) {
      return diagnostic("warning", "tally.result.shape.unsupported", `The result for “${selectedEntity.name}” has ${result.scores.length} values but no modeled spatial bin shape.`, selectedEntity.id);
    }
    return ready(selectedEntity, result, [1, 1, 1]);
  }

  if (selectedEntity.bins.some((value) => !Number.isInteger(value) || value <= 0)) {
    return diagnostic("warning", "tally.result.shape.unsupported", `The modeled bin shape for “${selectedEntity.name}” is unsupported.`, selectedEntity.id);
  }
  const expected = selectedEntity.bins.reduce((product, value) => product * value, 1);
  if (expected > MAX_RENDERABLE_TALLY_CELLS) {
    return diagnostic("warning", "tally.result.shape.unsupported", `The modeled shape for “${selectedEntity.name}” contains ${expected} cells; viewport presentation supports at most ${MAX_RENDERABLE_TALLY_CELLS}.`, selectedEntity.id);
  }
  if (result.scores.length !== expected) {
    return diagnostic("warning", "tally.result.shape.incompatible", `The result for “${selectedEntity.name}” has ${result.scores.length} values; its modeled shape requires ${expected}.`, selectedEntity.id);
  }
  return ready(selectedEntity, result, selectedEntity.bins);
}

function ready(
  entity: Extract<SceneEntity, {readonly kind: "tally"}>,
  result: TransportTallyDelta,
  bins: readonly [number, number, number],
): TallyResultPresentation {
  const maximum = result.scores.reduce((largest, score) => Math.max(largest, Math.abs(score)), 0);
  const [nx, ny, nz] = bins;
  const cells = result.scores.map((value, index): TallyResultCell => {
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / (nx * ny));
    return {
      value,
      intensity: maximum === 0 ? 0 : Math.abs(value) / maximum,
      sign: value < 0 ? "negative" : value > 0 ? "positive" : "zero",
      position: [(x + 0.5) / nx - 0.5, (y + 0.5) / ny - 0.5, (z + 0.5) / nz - 0.5],
      scale: [0.9 / nx, 0.9 / ny, 0.9 / nz],
    };
  });
  return {
    status: "ready",
    kind: "statistical-tally-result",
    tallyId: entity.id,
    label: `Statistical tally · ${formatSummary(result.scores)}`,
    accessibleLabel: `${entity.name} statistical tally. ${formatAccessibleValues(result.scores)}`,
    cells,
  };
}

function formatSummary(scores: readonly number[]): string {
  const summary = scores.reduce((current, score) => ({
    minimum: Math.min(current.minimum, score),
    maximum: Math.max(current.maximum, score),
    total: current.total + score,
  }), {minimum: Number.POSITIVE_INFINITY, maximum: Number.NEGATIVE_INFINITY, total: 0});
  const {minimum, maximum, total} = summary;
  return `${scores.length} ${scores.length === 1 ? "value" : "bins"} · range ${formatValue(minimum)} to ${formatValue(maximum)} · sum ${formatValue(total)}`;
}

function formatAccessibleValues(scores: readonly number[]): string {
  if (scores.length <= 64) return `Values: ${scores.map(formatValue).join(", ")}.`;
  return `${formatSummary(scores)}. Individual values omitted from this label because the result contains more than 64 bins.`;
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toPrecision(6).replace(/\.?0+$/, "");
}

function diagnostic(
  severity: Diagnostic["severity"],
  code: string,
  message: string,
  entityId: SceneEntity["id"],
): TallyResultPresentation {
  return {status: "diagnostic", diagnostic: {severity, code, message, entityId}};
}
