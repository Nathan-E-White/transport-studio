import {type EffectsPack} from "../../../EffectsPack";

export const livermoreEffects: EffectsPack = {
    bloom: {
        enabled: true,
        strength: 0.42,
        radius: 0.36,
        threshold: 0.62,
    },

    glow: {
        intensity: 0.48,
        softIntensity: 0.22,
        edgeIntensity: 0.34,
        pulseIntensity: 0.16,
    },

    fog: {
        enabled: true,
        color: "#070B11",
        density: 0.018,
        near: 18,
        far: 180,
    },

    shadow: {
        panel: "0 18px 48px rgba(0, 0, 0, 0.45)",
        elevated: "0 24px 72px rgba(0, 0, 0, 0.56)",
        inset: "inset 0 0 32px rgba(63, 167, 255, 0.08)",
        text: "0 0 16px rgba(108, 224, 255, 0.18)",
    },

    opacity: {
        disabled: 0.42,
        muted: 0.64,
        overlay: 0.78,
        glass: 0.86,
        solid: 1,
    },

    blur: {
        panel: "14px",
        overlay: "20px",
        backdrop: "28px",
    },

    transition: {
        fast: "120ms linear",
        standard: "180ms ease-out",
        slow: "280ms ease-out",
        diagnostic: "90ms linear",
    },

    motion: {
        hoverLift: "translateY(-1px)",
        press: "translateY(0)",
        panelEnter: "translateY(4px)",
        scanlineDuration: "1800ms",
        pulseDuration: "1400ms",
    },

    postProcessing: {
        filmGrain: 0.015,
        vignette: 0.18,
        chromaticAberration: 0,
        exposure: 1.04,
        contrast: 1.08,
        saturation: 1.02,
    },
} as const;

export type LivermoreEffects = typeof livermoreEffects;