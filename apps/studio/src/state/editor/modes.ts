// apps/studio/src/state/editor/modes.ts

export type EditorMode = "design" | "probe" | "run" | "analyze" | "debug";

export const DEFAULT_EDITOR_MODE: EditorMode = "design";

export const EDITOR_MODES: readonly EditorMode[] = [
    "design",
    "probe",
    "run",
    "analyze",
    "debug",
] as const;

export function isEditorMode(value: unknown): value is EditorMode {
    return typeof value === "string" && EDITOR_MODES.includes(value as EditorMode);
}