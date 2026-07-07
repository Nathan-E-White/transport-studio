import {ColorPalette} from "../../../ColorPalette";

export const defaultColors: ColorPalette = {
    background: "#0F1117",
    backgroundMuted: "#151922",

    surface: "#1A1F2B",
    surfaceElevated: "#232A38",
    surfaceInset: "#121722",
    panel: "#1A1F2B",
    elevatedPanel: "#232A38",
    insetPanel: "#121722",

    border: "rgba(180, 194, 220, 0.22)",
    borderMuted: "rgba(180, 194, 220, 0.12)",
    borderStrong: "rgba(210, 224, 255, 0.36)",

    textPrimary: "#EEF3FF",
    textSecondary: "#AAB6CC",
    textMuted: "#768399",
    textInverse: "#090B10",

    accentPrimary: "#7AA2F7",
    accentSecondary: "#9ECEFF",
    accentTertiary: "#73DACA",

    success: "#73DACA",
    warning: "#E0AF68",
    danger: "#F7768E",
    info: "#9ECEFF",

    grid: "rgba(180, 194, 220, 0.12)",
    gridStrong: "rgba(180, 194, 220, 0.24)",

    shadow: "rgba(0, 0, 0, 0.42)",
    glow: "rgba(122, 162, 247, 0.38)",
    glowSoft: "rgba(158, 206, 255, 0.18)",
} as const;

// noinspection JSUnusedGlobalSymbols
export type DefaultColors = typeof defaultColors;