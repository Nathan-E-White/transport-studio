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

export type ModeEntityKind = "geometry" | "material" | "source" | "tally";

export interface EditorModeBehavior {
    readonly label: string;
    readonly description: string;
    readonly selectableKinds: readonly ModeEntityKind[];
    readonly editingEnabled: boolean;
    readonly viewportEmphasis: string;
}

export const EDITOR_MODE_BEHAVIORS: Readonly<Record<EditorMode, EditorModeBehavior>> = {
    design: {
        label: "Design",
        description: "Build the modeled scene; every entity type can be selected and edited.",
        selectableKinds: ["geometry", "material", "source", "tally"],
        editingEnabled: true,
        viewportEmphasis: "Modeled geometry and editable scene helpers",
    },
    probe: {
        label: "Probe",
        description: "Inspect geometry, sources, and tally regions without changing the model.",
        selectableKinds: ["geometry", "source", "tally"],
        editingEnabled: false,
        viewportEmphasis: "Sources and tally regions",
    },
    run: {
        label: "Run",
        description: "Inspect source launch state and tally output while transport results are presented.",
        selectableKinds: ["source", "tally"],
        editingEnabled: false,
        viewportEmphasis: "Source launch and tally entities",
    },
    analyze: {
        label: "Analyze",
        description: "Select statistical tallies and inspect their results without editing the scene.",
        selectableKinds: ["tally"],
        editingEnabled: false,
        viewportEmphasis: "Statistical tally entities",
    },
    debug: {
        label: "Debug",
        description: "Inspect selectable project entities using a wireframe scene presentation.",
        selectableKinds: ["geometry", "material", "source", "tally"],
        editingEnabled: false,
        viewportEmphasis: "Geometry, source, and tally wireframes",
    },
};

export function getEditorModeBehavior(mode: EditorMode): EditorModeBehavior {
    return EDITOR_MODE_BEHAVIORS[mode];
}

export function isEntityKindSelectableInMode(mode: EditorMode, kind: string): boolean {
    return EDITOR_MODE_BEHAVIORS[mode].selectableKinds.some((candidate) => candidate === kind);
}

export function getModeEditingDisabledReason(mode: EditorMode): string | undefined {
    if (EDITOR_MODE_BEHAVIORS[mode].editingEnabled) return undefined;
    return `${EDITOR_MODE_BEHAVIORS[mode].label} mode is read-only. Switch to Design mode to change the modeled scene.`;
}

export function getModeEntityEmphasis(mode: EditorMode, kind: ModeEntityKind): number {
    const emphasis: Readonly<Record<EditorMode, Readonly<Record<ModeEntityKind, number>>>> = {
        design: {geometry: 1, material: 1, source: 0.75, tally: 0.55},
        probe: {geometry: 0.45, material: 0.15, source: 1, tally: 1},
        run: {geometry: 0.25, material: 0.1, source: 1, tally: 0.8},
        analyze: {geometry: 0.15, material: 0.1, source: 0.2, tally: 1},
        debug: {geometry: 0.7, material: 0.7, source: 0.7, tally: 0.7},
    };
    return emphasis[mode][kind];
}

export function isEditorMode(value: unknown): value is EditorMode {
    return typeof value === "string" && EDITOR_MODES.includes(value as EditorMode);
}
