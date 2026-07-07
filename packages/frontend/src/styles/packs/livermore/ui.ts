export const livermoreUI = {
    borderRadius: 8,
    borderWidth: 1,
    panelOpacity: 0.86,
    glowIntensity: 0.48,

    spacing: {
        xs: "0.25rem",
        sm: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
        xxl: "2rem",
    },

    control: {
        heightSm: "1.75rem",
        heightMd: "2.25rem",
        heightLg: "2.75rem",
        paddingX: "0.75rem",
        gap: "0.5rem",
    },

    panel: {
        padding: "1rem",
        headerHeight: "2.75rem",
        gap: "0.75rem",
    },

    zIndex: {
        base: 0,
        overlay: 10,
        popover: 20,
        modal: 30,
        toast: 40,
    },
} as const;

export type LivermoreUI = typeof livermoreUI;