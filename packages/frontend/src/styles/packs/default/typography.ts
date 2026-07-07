export const defaultTypography = {
    fontFamily: {
        body: "Inter, IBM Plex Sans, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        heading: "Inter, IBM Plex Sans, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        mono: "JetBrains Mono, IBM Plex Mono, SFMono-Regular, Consolas, Liberation Mono, monospace",
    },

    fontSize: {
        xs: "0.75rem",
        sm: "0.875rem",
        md: "1rem",
        lg: "1.125rem",
        xl: "1.25rem",
        xxl: "1.5rem",
        display: "2rem",
    },

    fontWeight: {
        regular: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
    },

    lineHeight: {
        tight: 1.15,
        heading: 1.25,
        body: 1.5,
        relaxed: 1.65,
        mono: 1.45,
    },

    letterSpacing: {
        tight: "-0.02em",
        normal: "0",
        wide: "0.04em",
        label: "0.08em",
    },
} as const;

export type DefaultTypography = typeof defaultTypography;