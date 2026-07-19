import type {Diagnostic, Project, SceneEntity} from "@transport/domain";
import {compileTransportProblem} from "@transport/domain/compile/CompileTransportProblem";
import {replaceEntity} from "./projectMutations";

export type InspectorEditDiagnostic = Required<Pick<Diagnostic, "severity" | "code" | "message">> & {readonly entityId?: string};

export type InspectorEditResult =
  | {readonly ok: true; readonly project: Project}
  | {readonly ok: false; readonly diagnostics: readonly InspectorEditDiagnostic[]};

export function commitInspectorCandidate(project: Project, candidate: SceneEntity, baseline?: SceneEntity): InspectorEditResult {
  const current = project.scene.entities.find((entity) => entity.id === candidate.id);
  if (!current || current.kind !== candidate.kind) {
    return rejected("inspector.entity.missing", "The selected entity no longer exists in the Editable Scene.");
  }
  if (current.locked) {
    return rejected("inspector.entity.locked", `“${current.name}” is locked. Unlock it in the Project Tree before editing.`);
  }

  if (baseline && editableFingerprint(current) !== editableFingerprint(baseline)) {
    return rejected("inspector.entity.conflict", `“${current.name}” changed after this Inspector draft was opened. Review the latest values and try again.`);
  }

  const mergedCandidate = mergeInspectorFields(current, candidate);
  const diagnostics = validateEditableCandidate(mergedCandidate);
  if (diagnostics.length > 0) return {ok: false, diagnostics};

  const candidateProject = replaceEntity(project, mergedCandidate);
  const baselineErrors = new Set(domainErrors(project).map(diagnosticKey));
  const introducedErrors = domainErrors(candidateProject).filter((diagnostic) => !baselineErrors.has(diagnosticKey(diagnostic)));
  if (introducedErrors.length > 0) return {ok: false, diagnostics: introducedErrors};

  return {ok: true, project: candidateProject};
}

function validateEditableCandidate(entity: SceneEntity): readonly InspectorEditDiagnostic[] {
  const diagnostics: InspectorEditDiagnostic[] = [];
  for (const [name, vector] of Object.entries(entity.transform)) {
    if (!vector || ![vector.x, vector.y, vector.z].every(Number.isFinite)) {
      diagnostics.push({severity: "error", code: `inspector.transform.${name}.invalid`, message: `${humanize(name)} values must be finite numbers.`});
    }
  }
  if ([entity.transform.scale.x, entity.transform.scale.y, entity.transform.scale.z].some((value) => value <= 0)) {
    diagnostics.push({severity: "error", code: "inspector.transform.scale.non_positive", message: "Scale values must be greater than zero."});
  }

  switch (entity.kind) {
    case "geometry":
      for (const [name, value] of Object.entries(entity.parameters)) {
        if (typeof value === "number" && (!Number.isFinite(value) || value <= 0)) {
          diagnostics.push({severity: "error", code: `inspector.geometry.${name}.invalid`, message: `${humanize(name)} must be a positive finite number.`});
        }
      }
      break;
    case "material":
      if (!Number.isFinite(entity.attenuationCoefficient) || entity.attenuationCoefficient < 0) {
        diagnostics.push({severity: "error", code: "inspector.material.attenuation.invalid", message: "Attenuation must be finite and non-negative."});
      }
      for (const [name, value] of [["scatter", entity.scatterProbability], ["absorption", entity.absorptionProbability]] as const) {
        if (!Number.isFinite(value) || value < 0 || value > 1) diagnostics.push({severity: "error", code: `inspector.material.${name}.invalid`, message: `${humanize(name)} probability must be between 0 and 1.`});
      }
      break;
    case "source":
      if (!Number.isFinite(entity.energy) || entity.energy <= 0) diagnostics.push({severity: "error", code: "inspector.source.energy.invalid", message: "Source energy must be a positive finite number."});
      if (!Number.isFinite(entity.strength) || entity.strength < 0) diagnostics.push({severity: "error", code: "inspector.source.strength.invalid", message: "Source strength must be finite and non-negative."});
      if (entity.sourceKind === "pencil-beam" && (!entity.direction
        || ![entity.direction.x, entity.direction.y, entity.direction.z].every(Number.isFinite)
        || Math.hypot(entity.direction.x, entity.direction.y, entity.direction.z) === 0)) {
        diagnostics.push({severity: "error", code: "inspector.source.direction.invalid", message: "Beam direction must be finite and non-zero."});
      }
      break;
    case "tally":
      if (entity.particleTypes.length === 0) diagnostics.push({severity: "error", code: "inspector.tally.particles.empty", message: "Select at least one tally particle."});
      if (entity.bins && entity.bins.some((value) => !Number.isInteger(value) || value <= 0)) diagnostics.push({severity: "error", code: "inspector.tally.bins.invalid", message: "Tally bins must be positive integers."});
      break;
  }
  return diagnostics;
}

function domainErrors(project: Project) {
  return compileTransportProblem(project).diagnostics
    .filter((diagnostic) => diagnostic.level === "error")
    .map((diagnostic) => ({severity: "error" as const, code: diagnostic.code, message: diagnostic.message, entityId: diagnostic.entityId}));
}

function rejected(code: string, message: string): InspectorEditResult {
  return {ok: false, diagnostics: [{severity: "error", code, message}]};
}

function diagnosticKey(diagnostic: {readonly code: string; readonly message: string; readonly entityId?: string}) {
  return `${diagnostic.code}:${diagnostic.entityId ?? "project"}:${diagnostic.message}`;
}

function mergeInspectorFields(current: SceneEntity, candidate: SceneEntity): SceneEntity {
  if (current.kind !== candidate.kind) return current;
  switch (current.kind) {
    case "geometry": {
      const edit = candidate as typeof current;
      return {...current, transform: edit.transform, primitive: edit.primitive, materialId: edit.materialId, parameters: edit.parameters};
    }
    case "material": {
      const edit = candidate as typeof current;
      return {...current, transform: edit.transform, color: edit.color, attenuationCoefficient: edit.attenuationCoefficient, scatterProbability: edit.scatterProbability, absorptionProbability: edit.absorptionProbability};
    }
    case "source": {
      const edit = candidate as typeof current;
      return {...current, transform: edit.transform, sourceKind: edit.sourceKind, particleType: edit.particleType, energy: edit.energy, strength: edit.strength, direction: edit.direction};
    }
    case "tally": {
      const edit = candidate as typeof current;
      return {...current, transform: edit.transform, tallyKind: edit.tallyKind, particleTypes: edit.particleTypes, bins: edit.bins};
    }
  }
}

function editableFingerprint(entity: SceneEntity): string {
  const merged = mergeInspectorFields(entity, entity);
  return JSON.stringify({
    transform: merged.transform,
    kindFields: entity.kind === "geometry" ? [entity.primitive, entity.materialId, entity.parameters]
      : entity.kind === "material" ? [entity.color, entity.attenuationCoefficient, entity.scatterProbability, entity.absorptionProbability]
      : entity.kind === "source" ? [entity.sourceKind, entity.particleType, entity.energy, entity.strength, entity.direction]
      : [entity.tallyKind, entity.particleTypes, entity.bins],
  });
}

function humanize(value: string) {
  return value.replaceAll(/([A-Z])/g, " $1").toLowerCase();
}
