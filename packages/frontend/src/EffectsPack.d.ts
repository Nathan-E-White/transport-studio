export interface EffectsPack {
    bloom: {
        enabled: boolean;
        strength: number;
        radius: number;
        threshold: number;
    };

    glow: {
        intensity: number;
        softIntensity: number;
        edgeIntensity: number;
        pulseIntensity: number;
    };

    fog: {
        enabled: boolean;
        color: string;
        density: number;
        near: number;
        far: number;
    };

    shadow: {
        panel: string;
        elevated: string;
        inset: string;
        text: string;
    };

    opacity: {
        disabled: number;
        muted: number;
        overlay: number;
        glass: number;
        solid: number;
    };

    blur: {
        panel: string;
        overlay: string;
        backdrop: string;
    };

    transition: {
        fast: string;
        standard: string;
        slow: string;
        diagnostic: string;
    };

    motion: {
        hoverLift: string;
        press: string;
        panelEnter: string;
        scanlineDuration: string;
        pulseDuration: string;
    };

    postProcessing: {
        filmGrain: number;
        vignette: number;
        chromaticAberration: number;
        exposure: number;
        contrast: number;
        saturation: number;
    };
}