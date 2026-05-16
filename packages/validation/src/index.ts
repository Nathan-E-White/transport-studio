import type { Diagnostic, Project } from "@transport/domain";

export function validateProject(project: Project): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const entities = project.scene.entities;

  if (!entities.some((entity) => entity.kind === "source")) {
    diagnostics.push({ severity: "warning", message: "No source has been defined." });
  }

  if (!entities.some((entity) => entity.kind === "tally")) {
    diagnostics.push({ severity: "warning", message: "No tally has been defined. The run will produce tracks but no aggregate score." });
  }

  for (const entity of entities) {
    if (entity.kind === "geometry" && !entity.materialId) {
      diagnostics.push({ severity: "warning", message: `Geometry '${entity.name}' has no material assigned.`, entityId: entity.id });
    }
  }

  return diagnostics;
}
