import {livermoreColors} from "./colors";
import {livermoreEffects} from "./effects";

export const livermoreSurfaces = {
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
        background: livermoreColors.surface,
        elevatedBackground: livermoreColors.surfaceElevated,
        insetBackground: livermoreColors.surfaceInset,
        border: livermoreColors.border,
        borderMuted: livermoreColors.borderMuted,
        borderStrong: livermoreColors.borderStrong,
        opacity: livermoreEffects.opacity.glass,
        backdropBlur: livermoreEffects.blur.panel,
    },

    glass: {
        background: "rgba(16, 23, 34, 0.78)",
        border: livermoreColors.borderMuted,
        opacity: livermoreEffects.opacity.overlay,
        backdropBlur: livermoreEffects.blur.overlay,
    },
} as const;

export type LivermoreSurfaces = typeof livermoreSurfaces;