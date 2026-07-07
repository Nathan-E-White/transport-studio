export const livermoreVisualization = {
    particle: {
        primary: "#6CE0FF",
        secondary: "#3FA7FF",
        neutral: "#DCE9FF",
        charged: "#5AFFC1",
        photon: "#B8F7FF",
        neutron: "#7FB7FF",
        electron: "#5AFFC1",
        warning: "#FFB347",
    },

    tracks: {
        default: "#6CE0FF",
        selected: "#FFFFFF",
        faded: "rgba(108, 224, 255, 0.28)",
        collision: "#FFB347",
        absorption: "#FF5A5A",
        scattering: "#5AFFC1",
    },

    heatmap: {
        low: "#070B11",
        lowMid: "#0B2A4A",
        mid: "#155E9F",
        highMid: "#3FA7FF",
        high: "#DCE9FF",
        gradient: ["#070B11", "#0B2A4A", "#155E9F", "#3FA7FF", "#DCE9FF"],
    },

    dose: {
        low: "#5AFFC1",
        moderate: "#6CE0FF",
        elevated: "#FFB347",
        high: "#FF5A5A",
        critical: "#FFFFFF",
        gradient: ["#5AFFC1", "#6CE0FF", "#FFB347", "#FF5A5A", "#FFFFFF"],
    },

    vectorField: {
        streamline: "#3FA7FF",
        streamlineMuted: "rgba(63, 167, 255, 0.28)",
        glyph: "#6CE0FF",
        glyphSelected: "#FFFFFF",
        curl: "#5AFFC1",
        divergence: "#FFB347",
    },

    geometry: {
        surface: "rgba(108, 224, 255, 0.16)",
        surfaceSelected: "rgba(108, 224, 255, 0.42)",
        surfaceWireframe: "rgba(220, 233, 255, 0.36)",
        region: "rgba(63, 167, 255, 0.12)",
        regionSelected: "rgba(63, 167, 255, 0.32)",
        boundary: "rgba(108, 224, 255, 0.48)",
    },

    tally: {
        palette: ["#3FA7FF", "#6CE0FF", "#5AFFC1", "#FFB347", "#FF5A5A"],
        histogram: "#3FA7FF",
        line: "#6CE0FF",
        area: "rgba(63, 167, 255, 0.24)",
        uncertainty: "rgba(220, 233, 255, 0.32)",
    },

    grid: {
        major: "rgba(120, 170, 255, 0.24)",
        minor: "rgba(120, 170, 255, 0.12)",
        axisX: "#FF5A5A",
        axisY: "#5AFFC1",
        axisZ: "#3FA7FF",
    },
} as const;

export type LivermoreVisualization = typeof livermoreVisualization;