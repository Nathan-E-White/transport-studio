import {ColorPalette} from "../../../ColorPalette";

export const livermoreColors: ColorPalette = {
    background: "#070B11",
    backgroundMuted: "#0B111A",

    surface: "#101722",
    surfaceElevated: "#162130",
    surfaceInset: "#0D141E",

    border: "rgba(120, 170, 255, 0.22)",
    borderMuted: "rgba(120, 170, 255, 0.12)",
    borderStrong: "rgba(108, 224, 255, 0.42)",

    textPrimary: "#DCE9FF",
    textSecondary: "#8CA4C8",
    textMuted: "#5F789B",
    textInverse: "#05080D",

    accentPrimary: "#3FA7FF",
    accentSecondary: "#6CE0FF",
    accentTertiary: "#5AFFC1",

    success: "#5AFFC1",
    warning: "#FFB347",
    danger: "#FF5A5A",
    info: "#6CE0FF",

    grid: "rgba(120, 170, 255, 0.12)",
    gridStrong: "rgba(120, 170, 255, 0.24)",

    shadow: "rgba(0, 0, 0, 0.45)",
    glow: "rgba(63, 167, 255, 0.48)",
    glowSoft: "rgba(108, 224, 255, 0.22)",

    panel: "#101722",
    elevatedPanel: "#162130",
    insetPanel: "#0D141E"

} as const;

export type LivermoreColors = typeof livermoreColors;