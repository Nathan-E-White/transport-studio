import type { Project } from "@transport/domain";

// noinspection JSUnusedGlobalSymbols
export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

// noinspection JSUnusedGlobalSymbols
export function parseProject(json: string): Project {
  return JSON.parse(json) as Project;
}
