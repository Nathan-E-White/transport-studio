import type { Project } from "@transport/domain";

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export function parseProject(json: string): Project {
  return JSON.parse(json) as Project;
}
