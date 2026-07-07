import {defaultColors} from "./colors";
import {defaultEffects} from "./effects";

export const defaultSurfaces = {
    radius: {
        none: "0",
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "18px",
        pill: "999px",
    },

    borderWidth: {
        hairline: "1px",
        thin: "1px",
        standard: "1px",
        strong: "2px",
    },

    panel: {
        background: defaultColors.surface,
        elevatedBackground: defaultColors.surfaceElevated,
        insetBackground: defaultColors.surfaceInset,
        border: defaultColors.border,
        borderMuted: defaultColors.borderMuted,
        borderStrong: defaultColors.borderStrong,
        opacity: defaultEffects.opacity.glass,
        backdropBlur: defaultEffects.blur.panel,
    },

    glass: {
        background: "rgba(16, 23, 34, 0.78)",
        border: defaultColors.borderMuted,
        opacity: defaultEffects.opacity.overlay,
        backdropBlur: defaultEffects.blur.overlay,
    },
} as const;

export type DefaultSurfaces = typeof defaultSurfaces;